// SourceSyncController — P1B task 3.3.
//
// Single in-flight patch controller per lossless session. One request in flight
// at a time; new CodeMirror transactions apply locally immediately and are
// accumulated into a bounded pending set (design 02 §4):
//
//   idle -> batching -> sending -> awaiting-ack -> idle
//                       ├-> retrying
//                       ├-> resyncing
//                       └-> blocked
//
// - batching coalesces every change since the last send into ONE frame against
//   `confirmedRevision` (frame batch, single transaction id).
// - the pending set is bounded; reaching the cap forces an immediate flush
//   (never drops input).
// - timeout retries reuse the SAME transaction id (idempotent).
// - a stale revision / wrong identity / duplicate-mismatch triggers resync:
//   fetch the confirmed snapshot, recompute the diff to the optimistic doc, and
//   replay it as a fresh transaction id; if it cannot be replayed, enter
//   `blocked` (optimistic text preserved for copy/export; no old snapshot is
//   written).
// - `flush()` is the flush barrier (design 02 §6): drains every pending change
//   and returns `Flushed(revision)`, `Blocked(error)`, or `Disposed`.
// - every timer is tracked and cancelled on dispose; late responses are dropped
//   by the identity matrix (generation/session/document/transaction).

export type PipelineState =
  | 'idle'
  | 'batching'
  | 'sending'
  | 'awaitingAck'
  | 'retrying'
  | 'resyncing'
  | 'blocked'
  | 'disposed';

export type FlushOutcome =
  | { status: 'flushed'; revision: number; confirmedHash: string }
  | { status: 'cancelled-by-user' }
  | { status: 'blocked'; error: Error }
  | { status: 'disposed' };

/** A CodeMirror change in UTF-16 coordinates against a base document. */
export interface LocalChange {
  from: number;
  to: number;
  insert: string;
  /** One entry per inserted logical LF. Raw paste/drop may make these explicit. */
  insertedLineEndings?: Array<'inherit' | 'lf' | 'crlf' | 'cr'>;
}

export interface SyncControllerDeps {
  sessionId: number;
  documentId: number;
  bindingGeneration: number;
  confirmedRevision: number;
  confirmedHash: string;
  /** Send a patch over the bridge. Rejects with a structured `{ code, message }`. */
  applyPatch(patch: unknown): Promise<{ revision: number; confirmedHash: string }>;
  /** Fetch the confirmed snapshot from the bridge. */
  getSnapshot(): Promise<{ revision: number; logicalText: string; confirmedHash: string }>;
  /** Compose pending CM change sets into changes in base (UTF-16) coordinates. */
  composePending(): LocalChange[];
  /** Current optimistic document text (CodeMirror doc). */
  currentDoc(): string;
  /** Drop locally queued changes after resync has captured the optimistic doc. */
  discardPending?(): void;
  onStateChange?(state: PipelineState, detail?: unknown): void;
  batchWindowMs?: number;
  maxRetries?: number;
  pendingChangeCap?: number;
  /** Maximum duration for one bridge attempt. A deadline retries the same transaction. */
  attemptTimeoutMs?: number;
}

const DEFAULT_BATCH_WINDOW_MS = 20;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_PENDING_CHANGE_CAP = 200;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 2_000;

export class SourceSyncController {
  private deps: SyncControllerDeps;
  private state: PipelineState = 'idle';
  private confirmedRevision: number;
  private confirmedHash: string;
  private pendingCount = 0;
  private pendingChangeCap: number;
  private batchWindowMs: number;
  private maxRetries: number;
  private attemptTimeoutMs: number;
  /** True until every optimistic edit is proven reflected in Core. */
  private unresolvedOptimistic = false;

  private inFlight: {
    patch: unknown;
    txnId: number;
    retries: number;
    retryTimer: ReturnType<typeof setTimeout> | null;
    attemptGeneration: number;
  } | null = null;

  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private disposers: Array<() => void> = [];
  private disposed = false;
  private nextTxnId: number;
  /** Incremented on every resync so stale resync results are dropped. */
  private resyncGeneration = 0;

  constructor(deps: SyncControllerDeps) {
    this.deps = deps;
    this.confirmedRevision = deps.confirmedRevision;
    this.confirmedHash = deps.confirmedHash;
    this.pendingChangeCap = deps.pendingChangeCap ?? DEFAULT_PENDING_CHANGE_CAP;
    this.batchWindowMs = deps.batchWindowMs ?? DEFAULT_BATCH_WINDOW_MS;
    this.maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.attemptTimeoutMs = deps.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
    // Transaction ids are strictly increasing per session (P1B P2 freeze).
    this.nextTxnId = deps.confirmedRevision + 1;
  }

  // ── Public API ──────────────────────────────────────────────────────

  /** Called by the binding when a real user CodeMirror transaction changed the doc. */
  onUserEdit(): void {
    if (this.disposed) return;
    // This is deliberately independent from queue/in-flight handles: once an
    // optimistic CM transaction exists it must keep close/switch/reload dirty
    // until Core confirms it or an explicit recovery/discard flow handles it.
    this.unresolvedOptimistic = true;
    if (this.state === 'blocked') {
      this.pendingCount++;
      this.deps.onStateChange?.(this.state);
      return;
    }
    this.pendingCount++;
    if (this.state === 'idle') this.scheduleBatch();
    else if (this.pendingCount >= this.pendingChangeCap) {
      if (this.inFlight) {
        // A hung bridge must not let the unbounded optimistic mirror grow. Do
        // not drop user text: preserve it in blocked recovery state instead.
        this.block(new Error('pending-change-cap-exceeded'));
      } else {
        this.forceFlushNow();
      }
    }
  }

  /**
   * Flush barrier (design 02 §6). Drains every pending change to the confirmed
   * revision and resolves Flushed(confirmedRevision). Returns Blocked when the
   * pipeline cannot converge, or Disposed when the binding was torn down.
   */
  async flush(): Promise<FlushOutcome> {
    if (this.disposed) return { status: 'disposed' };
    if (this.state === 'blocked') {
      return { status: 'blocked', error: new Error('pipeline-blocked') };
    }
    return new Promise<FlushOutcome>((resolve) => {
      this.disposers.push(() => resolve({ status: 'disposed' }));
      const settle = () => {
        this.cleanupDisposer();
        if (this.disposed) return resolve({ status: 'disposed' });
        if (this.state === 'blocked') {
          return resolve({ status: 'blocked', error: new Error('pipeline-blocked') });
        }
        if (this.pendingCount === 0 && !this.inFlight) {
          return resolve({
            status: 'flushed',
            revision: this.confirmedRevision,
            confirmedHash: this.confirmedHash,
          });
        }
        void this.drain().then(settle);
      };
      this.disposers.push(() => clearTimeout(this.batchTimer ?? undefined));
      settle();
    });
  }

  get pipelineState(): PipelineState {
    return this.state;
  }

  get revision(): number {
    return this.confirmedRevision;
  }

  get hash(): string {
    return this.confirmedHash;
  }

  get pending(): number {
    return this.pendingCount;
  }

  /** True while a patch is sent but not yet acked (in-flight dirty hole, P1). */
  isInFlight(): boolean {
    return this.inFlight !== null;
  }

  isBlocked(): boolean {
    return this.state === 'blocked';
  }

  /** Includes a retry-exhausted/blocked first edit whose frame was consumed. */
  hasUnresolvedOptimisticChanges(): boolean {
    return this.unresolvedOptimistic;
  }

  /** Cancel all timers/requests and reject any pending flush. */
  dispose(): void {
    this.disposed = true;
    this.cancelTimers();
    for (const disposer of this.disposers) disposer();
    this.disposers = [];
    this.setState('disposed');
  }

  // ── Internal pipeline ───────────────────────────────────────────────

  private setState(state: PipelineState, detail?: unknown): void {
    this.state = state;
    this.deps.onStateChange?.(state, detail);
  }

  private scheduleBatch(): void {
    if (this.disposed || this.state === 'blocked') return;
    if (this.batchTimer || this.inFlight) return;
    this.setState('batching');
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      void this.sendFrame();
    }, this.batchWindowMs);
  }

  private forceFlushNow(): void {
    // Cap reached: send immediately (never drop input).
    if (this.inFlight || this.state === 'blocked' || this.disposed) return;
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    void this.sendFrame();
  }

  private sendFrame(): void {
    if (this.disposed || this.state === 'blocked') return;
    if (this.inFlight) return;
    if (this.pendingCount === 0) {
      this.setState('idle');
      return;
    }

    const changes = this.deps.composePending();
    if (changes.length === 0) {
      // Nothing composed (e.g. programmatic-only changes) — treat as consumed.
      this.pendingCount = 0;
      this.setState('idle');
      return;
    }

    const txnId = this.nextTxnId++;
    const patch = {
      bindingGeneration: this.deps.bindingGeneration,
      sessionId: this.deps.sessionId,
      documentId: this.deps.documentId,
      transactionId: txnId,
      baseRevision: this.confirmedRevision,
      // Bridge DTO: UTF-16 coordinates + explicit line-ending provenance.
      changes: changes.map((c) => ({
        fromUtf16: c.from,
        toUtf16: c.to,
        insertedLogicalText: c.insert,
        insertedLineEndings: c.insertedLineEndings
          ?? Array(c.insert.split('\n').length - 1).fill('inherit'),
      })),
    };
    this.pendingCount = 0;
    this.inFlight = { patch, txnId, retries: 0, retryTimer: null, attemptGeneration: 0 };
    this.setState('sending');
    void this.sendWithRetry();
  }

  private async sendWithRetry(): Promise<void> {
    if (!this.inFlight) return;
    const inFlight = this.inFlight;
    const txnId = inFlight.txnId;
    this.setState('awaitingAck');

    try {
      const outcome = await this.withAttemptDeadline(inFlight);
      if (this.disposed || this.inFlight !== inFlight) return; // stale by identity
      this.confirmedRevision = outcome.revision;
      this.confirmedHash = outcome.confirmedHash;
      this.inFlight = null;
      // Continue with anything queued while awaiting ack.
      if (this.pendingCount > 0) {
        this.setState('batching');
        void this.sendFrame();
      } else {
        this.unresolvedOptimistic = false;
        this.setState('idle');
      }
    } catch (err) {
      if (this.disposed || this.inFlight !== inFlight) return;
      const code = (err as { code?: string })?.code ?? 'io';
      if (code === 'stale-revision' || code === 'wrong-identity' || code === 'duplicate-mismatch') {
        // The base mirror diverged from the confirmed snapshot → resync with a
        // fresh transaction id (never blindly re-apply).
        void this.resync(code);
        return;
      }
      // Transient (io / session-missing / network): retry the SAME transaction id.
      if (inFlight.retries < this.maxRetries) {
        inFlight.retries++;
        this.setState('retrying', { txnId, attempt: inFlight.retries });
        const backoff = 50 * 2 ** (inFlight.retries - 1);
        inFlight.retryTimer = setTimeout(() => {
          if (this.inFlight === inFlight) void this.sendWithRetry();
        }, backoff);
        this.disposers.push(() => {
          if (inFlight.retryTimer) clearTimeout(inFlight.retryTimer);
        });
        return;
      }
      this.inFlight = null;
      this.block(new Error(`patch-timeout: ${code}`));
    }
  }

  private async resync(reason: string): Promise<void> {
    const gen = ++this.resyncGeneration;
    this.setState('resyncing', { reason });
    try {
      const snapshot = await this.deps.getSnapshot();
      if (this.disposed || gen !== this.resyncGeneration) return;
      // Validate identity is implicit: snapshot is for the same session.
      const confirmedText = snapshot.logicalText;
      const optimistic = this.deps.currentDoc();

      if (confirmedText === optimistic) {
        this.confirmedRevision = snapshot.revision;
        this.confirmedHash = snapshot.confirmedHash as string;
        this.pendingCount = 0;
        this.inFlight = null;
        this.unresolvedOptimistic = false;
        this.setState('idle');
        return;
      }

      // Recompute confirmed → optimistic into a fresh Core patch. The CM editor
      // already contains `optimistic`: applying this diff to it would duplicate
      // the change (Xbase -> XXbase). Rebase controller bookkeeping only.
      const diff = diffText(confirmedText, optimistic);
      if (!diff) {
        this.block(new Error(`resync-cannot-rebase: ${reason}`));
        return;
      }
      // All queued ChangeSets are represented by `diff`; leaving them queued
      // would replay their mutations after this rebase.
      this.deps.discardPending?.();
      const txnId = this.nextTxnId++;
      const patch = {
        bindingGeneration: this.deps.bindingGeneration,
        sessionId: this.deps.sessionId,
        documentId: this.deps.documentId,
        transactionId: txnId,
        baseRevision: snapshot.revision,
        changes: diff.map((c) => ({
          fromUtf16: c.from,
          toUtf16: c.to,
          insertedLogicalText: c.insert,
          insertedLineEndings: c.insertedLineEndings
            ?? Array(c.insert.split('\n').length - 1).fill('inherit'),
        })),
      };
      this.confirmedRevision = snapshot.revision;
      this.confirmedHash = snapshot.confirmedHash as string;
      this.pendingCount = 0;
      this.inFlight = { patch, txnId, retries: 0, retryTimer: null, attemptGeneration: 0 };
      void this.sendWithRetry();
    } catch (err) {
      if (this.disposed || gen !== this.resyncGeneration) return;
      this.block(err as Error);
    }
  }

  private block(error: Error): void {
    if (this.inFlight?.retryTimer) clearTimeout(this.inFlight.retryTimer);
    this.inFlight = null;
    this.setState('blocked', { error: error.message });
  }

  private cancelTimers(): void {
    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.batchTimer = null;
    if (this.inFlight?.retryTimer) clearTimeout(this.inFlight.retryTimer);
    if (this.inFlight) this.inFlight.retryTimer = null;
  }

  /**
   * Gives every invoke attempt a real deadline. The unresolved bridge promise
   * is deliberately left alone (Tauri invoke has no cancellation primitive),
   * but its eventual ack is ignored because the race's generation is no longer
   * current. A retry therefore uses the exact same transaction id safely.
   */
  private withAttemptDeadline(inFlight: NonNullable<SourceSyncController['inFlight']>): Promise<{ revision: number; confirmedHash: string }> {
    const generation = ++inFlight.attemptGeneration;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject({ code: 'attempt-timeout', message: `patch attempt exceeded ${this.attemptTimeoutMs}ms` });
      }, this.attemptTimeoutMs);
      void this.deps.applyPatch(inFlight.patch).then(
        (outcome) => {
          clearTimeout(timeout);
          if (this.disposed || this.inFlight !== inFlight || inFlight.attemptGeneration !== generation) return;
          resolve(outcome);
        },
        (error) => {
          clearTimeout(timeout);
          if (this.disposed || this.inFlight !== inFlight || inFlight.attemptGeneration !== generation) return;
          reject(error);
        },
      );
    });
  }

  private cleanupDisposer(): void {
    // Remove the single settle disposer added by flush().
    this.disposers.pop();
  }

  private async drain(): Promise<void> {
    // Used by flush(): force a frame if pending and not already sending.
    if (this.disposed) return;
    if (this.pendingCount > 0 && !this.inFlight) {
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      this.sendFrame();
    }
    // If a send is in flight, await its ack.
    if (this.inFlight) {
      await new Promise<void>((resolve) => {
        const poll = setInterval(() => {
          if (!this.inFlight || this.state === 'blocked' || this.disposed) {
            clearInterval(poll);
            resolve();
          }
        }, 10);
        this.disposers.push(() => clearInterval(poll));
      });
    }
  }
}

/**
 * Compute the minimal non-overlapping changes from `before` to `after`
 * (UTF-16 offsets). Returns null when no exact diff exists (cannot rebase).
 */
export function diffText(before: string, after: string): LocalChange[] | null {
  if (before === after) return [];
  // Longest common prefix / suffix.
  let start = 0;
  const minLen = Math.min(before.length, after.length);
  while (start < minLen && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < minLen - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++;
  }
  const insert = after.slice(start, after.length - end);
  return [{ from: start, to: before.length - end, insert }];
}
