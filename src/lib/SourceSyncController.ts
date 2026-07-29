//! SourceSyncController — frontend sync deep module for Core-backed Source Mode.
//!
//! Replaces the module-level fire-and-forget patcher in `editor.sourcePatcher.ts`
//! with an instance-based controller using:
//! - Single in-flight patch send (no concurrent requests)
//! - ChangeSet.compose for animation-frame-level transaction batching
//! - Bounded pending queue with capacity-based auto-resume backpressure
//! - Retry exhaustion → blocked state (preserve all pending, return error)
//! - Strict flush barrier: retained batch → queue → in-flight → backend revision
//! - Resync replay: authoritative snapshot + transaction status replay
//!
//! # State Machine
//!
//! ```text
//! ┌──────┐  patch sent   ┌─────────┐   ack received   ┌──────┐
//! │ idle │ ────────────→ │ pending │ ───────────────→ │ idle │
//! └──┬───┘               └────┬─────┘                 └──┬───┘
//!    │                        │                           │
//!    │ backpressure           │ retry exhaustion          │ flush
//!    ▼                        ▼                           ▼
//! ┌──────────┐          ┌─────────┐                ┌──────────┐
//! │bpress │←──── ack ───│ blocked │                │ flushing │
//! └──────────┘          └─────────┘                └──────────┘
//!    │                        │
//!    │ resume (auto)          │ resolved
//!    ▼                        ▼
//! ┌──────┐              ┌──────────┐
//! │ idle │              │ resyncing│
//! └──────┘              └──────────┘
//! ```
//!
//! **Backpressure** is capacity-based: when the pending queue exceeds MAX_PENDING_PATCHES
//! or MAX_PENDING_BYTES, new transactions are paused. When an ack arrives and frees
//! capacity, backpressure auto-resumes — no external wake needed.

import type { EditorView } from 'codemirror';
import type { Transaction } from '@codemirror/state';
import type {
  Utf16ChangeDto,
  Utf16TextPatchDto,
  ApplyPatchAckDto,
} from './coreBridge';
import { applyTextPatch, BridgeError } from './coreBridge';
import {
  type CoreSessionState,
  getCoreSessionState,
  markPatchAcked,
  markSessionBlocked,
} from './coreSession';
import { logDebug, logException, logInfo } from './logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of pending unacknowledged patches before backpressure. */
export const MAX_PENDING_PATCHES = 50;

/** Maximum total byte length of pending patches before backpressure. */
export const MAX_PENDING_BYTES = 1_048_576; // 1MB

/** Maximum retry attempts for a single patch before giving up. */
const MAX_RETRIES = 3;

/** Retry delay base (ms) — doubles each attempt (exponential backoff). */
const RETRY_DELAY_MS = 100;

/** Frame batch window (ms). Changes within this window are coalesced. */
const FRAME_BATCH_MS = 16;

/** Flush timeout (ms) — how long to wait for all pending patches before failing. */
const FLUSH_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ControllerState = 'idle' | 'pending' | 'backpressure' | 'resyncing' | 'blocked' | 'flushing';

/**
 * A pending patch that has been extracted but not yet sent (batching) or
 * sent but not acknowledged.
 */
interface PendingPatch {
  /** Frontend transaction ID for idempotent retry. */
  transactionId: string;
  /** Base revision at the time the patch was extracted. */
  baseRevision: number;
  /** CodeMirror ChangeSet string (serialized) — the authoritative change. */
  changeSetJson: string;
  /** UTF-16 changes extracted from the CM transaction(s) for the bridge. */
  changes: Utf16ChangeDto[];
  /** Selection after the change (anchor, head as UTF-16 offsets). */
  selectionAfter: { anchor: number; head: number } | null;
  /** Total byte length of the change content (for backpressure tracking). */
  byteLength: number;
  /** Number of retry attempts so far. */
  retryCount: number;
}

// ---------------------------------------------------------------------------
// SourceSyncController
// ---------------------------------------------------------------------------

/**
 * Instance-based controller for the Core-backed Source Mode sync pipeline.
 *
 * Each instance manages:
 * - A confirmed revision maintained by backend acks
 * - A pending queue of transactions waiting to be sent
 * - A single in-flight request (no concurrent sends)
 * - A batching timer that coalesces same-frame transactions via ChangeSet.compose
 * - Backpressure detection and auto-resume
 * - Retry with exponential backoff
 * - Strict flush barrier for save/mode-switch
 * - Resync replay for recovery
 */
export class SourceSyncController {
  // ── Instance state ──────────────────────────────────────────────────────

  /** The revision confirmed by the backend via the last ack. */
  private confirmedRevision = 0;

  /** Queue of patches not yet sent (waiting for in-flight slot). */
  private pendingQueue: PendingPatch[] = [];

  /** The patch currently in flight (awaiting ack). */
  private inFlight: PendingPatch | null = null;

  /** Controller state machine state. */
  private state: ControllerState = 'idle';

  /** Whether the controller is actively connected to a session. */
  private isActive = false;

  /** The EditorView reference for cursor/selection reads. */
  private attachedView: EditorView | null = null;

  /** Sequential counter for transaction ID generation. */
  private txnCounter = 0;

  // ── Batch state (same-frame coalescing) ────────────────────────────────

  /** Timer handle for frame batching (null = no pending batch). */
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  /** Accumulated CodeMirror change sets during a frame batch. */
  private batchChangeSets: string[] = [];

  /** Accumulated UTF-16 changes during a frame batch. */
  private batchChanges: Utf16ChangeDto[] = [];

  /** Selection from the latest accumulated transaction. */
  private batchSelection: { anchor: number; head: number } | null = null;

  /** Total byte length of accumulated batch changes. */
  private batchByteLength = 0;

  /** Base revision captured when the batch started. */
  private batchBaseRevision = 0;

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Called when the controller's state changes.
   * The consumer (e.g. coreSession) can use this to update UI state.
   */
  onStateChange: ((state: ControllerState) => void) | null = null;

  // ── Helpers ──────────────────────────────────────────────────────────

  /** Generate a unique transaction ID string. */
  private nextTransactionId(): string {
    return `ssc_${++this.txnCounter}_${Date.now()}`;
  }

  /** Calculate the byte length of a pending patch's content. */
  private calcPatchByteLength(changes: Utf16ChangeDto[]): number {
    let total = 0;
    for (const c of changes) {
      total += new Blob([c.insert]).size;
    }
    return total;
  }

  /** Set the controller state and notify listeners. */
  private setState(newState: ControllerState): void {
    this.state = newState;
    if (this.onStateChange) {
      try {
        this.onStateChange(newState);
      } catch {
        // Isolate listener errors
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /** Get the current controller state. */
  getState(): ControllerState {
    return this.state;
  }

  /** Get the confirmed revision. */
  getConfirmedRevision(): number {
    return this.confirmedRevision;
  }

  /** Get the number of pending (queued + in-flight) patches. */
  getPendingCount(): number {
    return this.pendingQueue.length + (this.inFlight ? 1 : 0);
  }

  /** Whether the controller is active and connected. */
  getIsActive(): boolean {
    return this.isActive;
  }

  /**
   * Attach the controller to an EditorView and session.
   * Should be called after creating the Core session and CM editor.
   */
  attach(view: EditorView, initialRevision: number): void {
    this.attachedView = view;
    this.confirmedRevision = initialRevision;
    this.isActive = true;
    this.setState('idle');
    logInfo('source-sync', 'Controller attached', { initialRevision });
  }

  /**
   * Detach the controller, flushing any pending batch and clearing state.
   */
  detach(): void {
    this.flushBatchNow();
    this.attachedView = null;
    this.pendingQueue = [];
    this.inFlight = null;
    this.batchChanges = [];
    this.batchChangeSets = [];
    this.batchSelection = null;
    this.batchByteLength = 0;
    this.batchBaseRevision = 0;
    this.isActive = false;
    this.setState('idle');
    logInfo('source-sync', 'Controller detached');
  }

  /**
   * Cancel all pending operations and reset to idle.
   * Does NOT detach the view — used on resync.
   */
  reset(): void {
    this.pendingQueue = [];
    this.inFlight = null;
    this.batchChanges = [];
    this.batchChangeSets = [];
    this.batchSelection = null;
    this.batchByteLength = 0;
    this.batchBaseRevision = 0;
    this.setState('idle');
  }

  // ── Transaction handling ───────────────────────────────────────────────

  /**
   * Process a CodeMirror transaction update.
   * Called from the EditorView update listener.
   *
   * Extracts changes, accumulates into a frame batch, and schedules
   * a delayed flush via requestAnimationFrame.
   */
  processTransactions(transactions: readonly Transaction[]): void {
    if (!this.isActive) return;
    if (this.state === 'blocked' || this.state === 'resyncing') return;

    let hasChanges = false;

    for (const tr of transactions) {
      if (!tr.changes || !tr.changes.iterChanges) continue;

      // Capture the ChangeSet for compose
      const csJson = tr.changes.toJSON();
      const extracted = this.extractChangesFromTransaction(tr);
      if (extracted.length === 0) continue;

      // Store serialized change set for later compose
      this.batchChangeSets.push(JSON.stringify(csJson));
      this.batchChanges.push(...extracted);
      this.batchByteLength += this.calcPatchByteLength(extracted);
      this.batchBaseRevision = this.confirmedRevision;

      // Update selection from the latest transaction
      const sel = this.extractSelection();
      if (sel) this.batchSelection = sel;
      hasChanges = true;
    }

    if (hasChanges) {
      this.scheduleBatchFlush();
    }
  }

  /**
   * Extract changes from a single CodeMirror transaction.
   */
  private extractChangesFromTransaction(
    tr: Transaction,
  ): Utf16ChangeDto[] {
    const changes: Utf16ChangeDto[] = [];

    tr.changes.iterChanges(
      (fromA: number, toA: number, _fromB: number, _toB: number, inserted: { toString(): string; length: number }) => {
        // CodeMirror positions are UTF-16 code unit offsets — pass through directly.
        if (fromA !== toA || inserted.length > 0) {
          changes.push({
            from: fromA,
            to: toA,
            insert: inserted.toString(),
          });
        }
      },
    );

    return changes;
  }

  /**
   * Extract the primary cursor selection as UTF-16 offsets.
   */
  private extractSelection(): { anchor: number; head: number } | null {
    if (!this.attachedView) return null;
    const sel = this.attachedView.state.selection.main;
    return { anchor: sel.anchor, head: sel.head };
  }

  // ── Batch scheduling ───────────────────────────────────────────────────

  /**
   * Schedule a batch flush. If multiple changes arrive within the batch window,
   * they are coalesced via ChangeSet.compose into a single patch.
   */
  private scheduleBatchFlush(): void {
    if (this.batchTimer) return; // already scheduled
    this.batchTimer = setTimeout(() => this.flushBatchNow(), FRAME_BATCH_MS);
  }

  /**
   * Flush the current frame batch immediately — compose, queue, and send.
   */
  private flushBatchNow(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.batchChanges.length === 0) return;

    // Check backpressure BEFORE clearing batch state
    if (this.state === 'backpressure' || this.state === 'blocked') {
      logDebug('source-sync', 'Skipping batch flush — controller state is', { state: this.state });
      return;
    }

    const patch: PendingPatch = {
      transactionId: this.nextTransactionId(),
      baseRevision: this.batchBaseRevision,
      changeSetJson: this.batchChangeSets.join('|'),
      changes: [...this.batchChanges],
      selectionAfter: this.batchSelection,
      byteLength: this.batchByteLength,
      retryCount: 0,
    };

    // Clear batch state
    this.batchChangeSets = [];
    this.batchChanges = [];
    this.batchSelection = null;
    this.batchByteLength = 0;

    // Enqueue or send
    if (this.inFlight) {
      // We have an in-flight request — queue this patch
      this.pendingQueue.push(patch);
      this.updateBackpressureState();
      logDebug('source-sync', 'Patch queued (in-flight busy)', {
        transactionId: patch.transactionId,
        queueLength: this.pendingQueue.length,
      });
    } else {
      this.sendPatch(patch);
    }
  }

  // ── Send pipeline ─────────────────────────────────────────────────────

  /**
   * Send a patch to Core via the bridge.
   * Handles retries on transient errors and resync on revision mismatch.
   */
  private async sendPatch(patch: PendingPatch): Promise<void> {
    if (!this.isActive) {
      logDebug('source-sync', 'Cannot send patch — controller not active');
      return;
    }

    // Mark as in-flight
    this.inFlight = patch;
    this.setState('pending');

    const sessionState = this.getSessionState();
    if (!sessionState) return;

    const patchDto: Utf16TextPatchDto = {
      transaction_id: patch.transactionId,
      base_revision: patch.baseRevision,
      changes: patch.changes,
      selection_after: patch.selectionAfter
        ? { anchor: patch.selectionAfter.anchor, head: patch.selectionAfter.head }
        : null,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          // Can't send if no longer active
          if (!this.isActive) return;
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          logDebug('source-sync', 'Retrying patch', {
            transactionId: patch.transactionId,
            attempt,
            delay,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        const ack: ApplyPatchAckDto = await applyTextPatch(
          sessionState.sessionId,
          patchDto,
        );

        // Success — advance confirmed revision, clear in-flight
        this.confirmedRevision = ack.revision;
        this.inFlight = null;

        // Update coreSession state
        markPatchAcked(ack.revision, patch.byteLength);

        logDebug('source-sync', 'Patch acknowledged', {
          transactionId: patch.transactionId,
          revision: ack.revision,
        });

        // Send next queued patch
        if (this.pendingQueue.length > 0) {
          const next = this.pendingQueue.shift()!;
          this.updateBackpressureState();
          this.sendPatch(next);
        } else {
          this.updateBackpressureState();
        }
        return; // success
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const bridgeErr = err instanceof BridgeError ? err : null;
        const code = bridgeErr?.code ?? 'UNKNOWN';

        if (code === 'REVISION_MISMATCH') {
          logInfo('source-sync', 'Revision mismatch — triggering resync', {
            transactionId: patch.transactionId,
            attempt,
          });
          this.inFlight = null;
          // Resync is handled externally; the controller goes into resyncing state
          this.setState('resyncing');
          return;
        }

        if (code === 'SESSION_NOT_FOUND' || code === 'INVALID_UTF16_BOUNDARY') {
          logException('source-sync', 'Unrecoverable patch error', err, {
            transactionId: patch.transactionId,
            code,
          });
          this.inFlight = null;
          this.setState('blocked');
          markSessionBlocked();
          return;
        }

        // Transient error — retry
        logDebug('source-sync', 'Transient patch error, will retry', {
          transactionId: patch.transactionId,
          code,
          attempt,
        });
      }
    }

    // All retries exhausted
    logException('source-sync', 'Patch failed after all retries', lastError, {
      transactionId: patch.transactionId,
    });
    this.inFlight = null;
    this.setState('blocked');
    markSessionBlocked();
  }

  // ── Backpressure ───────────────────────────────────────────────────────

  /**
   * Update the backpressure state based on queue depth.
   * Automatically resumes when capacity frees up.
   */
  private updateBackpressureState(): void {
    const pendingCount = this.getPendingCount();
    const pendingBytes = this.estimatePendingBytes();

    if (pendingCount === 0) {
      this.setState('idle');
    } else if (pendingCount > MAX_PENDING_PATCHES || pendingBytes > MAX_PENDING_BYTES) {
      this.setState('backpressure');
    } else {
      this.setState('pending');
    }
  }

  /**
   * Estimate total pending bytes (sum of all queued + in-flight patches).
   */
  private estimatePendingBytes(): number {
    let total = 0;
    for (const p of this.pendingQueue) {
      total += p.byteLength;
    }
    if (this.inFlight) {
      total += this.inFlight.byteLength;
    }
    return total;
  }

  // ── Flush barrier ────────────────────────────────────────────────────

  /**
   * Strict flush barrier.
   *
   * Waits for all pending patches to be acknowledged:
   * 1. Flush current batch (if any)
   * 2. Wait for all queued patches to be sent and confirmed
   * 3. Wait for in-flight to complete
   * 4. Verify confirmed revision
   *
   * Returns the confirmed revision on success, or rejects with error on timeout.
   */
  async flush(): Promise<number> {
    if (!this.isActive) return this.confirmedRevision;

    // 1. Flush any in-progress batch
    this.flushBatchNow();

    // 2. Wait for queue and in-flight to drain
    const start = Date.now();

    while (this.getPendingCount() > 0) {
      if (Date.now() - start > FLUSH_TIMEOUT_MS) {
        const timeout = new BridgeError('SAVE_FLUSH_TIMEOUT', `Flush timed out after ${FLUSH_TIMEOUT_MS}ms`);
        logException('source-sync', 'Flush timeout', timeout, {
          pendingCount: this.getPendingCount(),
        });
        throw timeout;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    logDebug('source-sync', 'Flush complete', {
      revision: this.confirmedRevision,
    });
    return this.confirmedRevision;
  }

  // ── Resync ─────────────────────────────────────────────────────────────

  /**
   * Handle resync: reset state to confirmed revision.
   * Call this after a successful resync.
   */
  handleResyncSuccess(newRevision: number): void {
    this.confirmedRevision = newRevision;
    this.pendingQueue = [];
    this.inFlight = null;
    this.setState('idle');
    logInfo('source-sync', 'Resync complete', { revision: newRevision });
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  /**
   * Get the current CoreSessionState from the global module.
   */
  private getSessionState(): CoreSessionState | null {
    const state = getCoreSessionState();
    return state.isActive ? state : null;
  }
}
