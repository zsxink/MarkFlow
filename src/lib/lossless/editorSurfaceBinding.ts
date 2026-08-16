// EditorSurfaceBinding — P1B task 3.2/3.4/3.5/3.6.
//
// Bridges one lossless Core session to one CodeMirror Source editor:
//
//   - opens the session via `open_lossless_document` (Core logical text only;
//     never `setMarkdown` / serializer);
//   - observes user CodeMirror transactions, composes their change sets, and
//     feeds the single-in-flight SourceSyncController;
//   - owns the confirmed/persisted revisions and the pipeline state;
//   - performs the save lifecycle: flush barrier → prepare_document_save →
//     guarded_atomic_write → commit_document_save;
//   - reload / close / disposal cancel every timer and request (identity matrix
//     drops stale responses, design 02 §9).

import { invoke } from '@tauri-apps/api/core';
import type { ChangeSet, Transaction } from '@codemirror/state';
import { store } from '../store';
import type {
  BridgeTextPatch,
  DocumentSnapshot,
  FileIdentity,
  GuardedWriteResponse,
  LosslessOpenResponse,
  OriginalSnapshot,
  PatchOutcome,
  PrepareSaveResponse,
  ReconcileResponse,
} from './types';
import { SourceSyncController, type FlushOutcome, type LocalChange } from './sourceSyncController';
import { createLosslessSourceEditor, type LosslessSourceEditorHandle } from './losslessSourceEditor';

/** `blocked`/`conflict` are safe, explainable skips — never write failures. */
export type LosslessSaveResult = 'saved' | 'skipped' | 'blocked' | 'failed' | 'conflict';

/**
 * Bind a lossless Core session to a CodeMirror Source editor in `container`.
 * Callers must call `dispose()` when the document is closed/switched.
 */
export class EditorSurfaceBinding {
  readonly sessionId: number;
  readonly documentId: number;
  bindingGeneration: number;
  path: string;
  original: OriginalSnapshot;
  confirmedRevision: number;
  confirmedHash: string;
  persistedRevision: number;
  /** The known file identity used as the guarded-write expected identity. */
  fileIdentity: FileIdentity;
  private editor: LosslessSourceEditorHandle;
  private controller: SourceSyncController;
  private pendingChangeSets: ChangeSet[] = [];
  private pendingPasteProvenance: Array<{ logicalText: string; endings: Array<'lf' | 'crlf' | 'cr'> }> = [];
  private programmaticDispatch = false;
  private saving = false;
  private disposed = false;

  private constructor(opts: {
    sessionId: number;
    documentId: number;
    bindingGeneration: number;
    path: string;
    original: OriginalSnapshot;
    confirmedRevision: number;
    confirmedHash: string;
    persistedRevision: number;
    editor: LosslessSourceEditorHandle;
    controller: SourceSyncController;
  }) {
    this.sessionId = opts.sessionId;
    this.documentId = opts.documentId;
    this.bindingGeneration = opts.bindingGeneration;
    this.path = opts.path;
    this.original = opts.original;
    this.confirmedRevision = opts.confirmedRevision;
    this.confirmedHash = opts.confirmedHash;
    this.persistedRevision = opts.persistedRevision;
    this.fileIdentity = opts.original.fileIdentity;
    this.editor = opts.editor;
    this.controller = opts.controller;
  }

  // ── Open ────────────────────────────────────────────────────────────

  static async open(
    path: string,
    container: HTMLElement,
    defaultEol = 'lf',
    onStateChange?: (state: string) => void,
  ): Promise<EditorSurfaceBinding> {
    const opened = await invoke<LosslessOpenResponse>('open_lossless_document', {
      req: { path, defaultEol },
    });

    // `binding` is assigned after construction because the editor and the
    // controller reference its methods. Neither fires until construction is
    // complete (transactions need a user edit; sends need a controller).
    let binding: EditorSurfaceBinding | null = null;
    const editor = createLosslessSourceEditor(container, opened.logicalText, {
      readOnly: false,
      onTransaction: (transactions) => binding?.handleTransactions(transactions),
      onDocChanged: () => store.emit({ type: 'editor:update' }),
      onRawPasteText: (text) => binding?.recordRawPaste(text),
    });

    const controller = new SourceSyncController({
      sessionId: opened.sessionId,
      documentId: opened.documentId,
      bindingGeneration: opened.bindingGeneration,
      confirmedRevision: opened.revision,
      confirmedHash: opened.confirmedHash,
      applyPatch: (patch) => binding!.applyPatch(patch as BridgeTextPatch),
      getSnapshot: () => binding!.getSnapshot(),
      composePending: () => binding!.composePending(),
      currentDoc: () => binding!.editor.doc(),
      discardPending: () => binding!.discardPendingChanges(),
      onStateChange: (state) => {
        binding?.syncDirty();
        onStateChange?.(state);
      },
    });

    binding = new EditorSurfaceBinding({
      sessionId: opened.sessionId,
      documentId: opened.documentId,
      bindingGeneration: opened.bindingGeneration,
      path,
      original: opened.original,
      confirmedRevision: opened.revision,
      confirmedHash: opened.confirmedHash,
      persistedRevision: opened.persistedRevision,
      editor,
      controller,
    });
    return binding;
  }

  // ── Controller plumbing ─────────────────────────────────────────────

  private async applyPatch(patch: BridgeTextPatch): Promise<PatchOutcome> {
    if (this.disposed) throw { code: 'session-missing', message: 'disposed' };
    const outcome = await invoke<PatchOutcome>('apply_document_patch', { req: { patch } });
    // Identity guard: if the document changed while in flight, drop the result.
    if (this.disposed) throw { code: 'session-missing', message: 'disposed' };
    return outcome;
  }

  private async getSnapshot(): Promise<DocumentSnapshot> {
    if (this.disposed) throw { code: 'session-missing', message: 'disposed' };
    const snapshot = await invoke<DocumentSnapshot>('get_document_snapshot', {
      req: { sessionId: this.sessionId },
    });
    if (this.disposed) throw { code: 'session-missing', message: 'disposed' };
    return snapshot;
  }

  private composePending(): LocalChange[] {
    if (this.pendingChangeSets.length === 0) return [];
    let composed = this.pendingChangeSets[0];
    for (let i = 1; i < this.pendingChangeSets.length; i++) {
      composed = composed.compose(this.pendingChangeSets[i]);
    }
    this.pendingChangeSets = [];
    const changes: LocalChange[] = [];
    composed.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      changes.push({ from: fromA, to: toA, insert: inserted.toString() });
    });
    // Attach raw clipboard EOLs to their normalized logical insertion. A paste
    // may batch with adjacent typing, so annotate the exact contained slice
    // rather than assuming the whole ChangeSet is clipboard data.
    for (const provenance of this.pendingPasteProvenance) {
      for (const change of changes) {
        const at = change.insert.indexOf(provenance.logicalText);
        if (at < 0) continue;
        const logicalBreaksBefore = (change.insert.slice(0, at).match(/\n/g) ?? []).length;
        const totalBreaks = (change.insert.match(/\n/g) ?? []).length;
        const endings = Array<'inherit' | 'lf' | 'crlf' | 'cr'>(totalBreaks).fill('inherit');
        endings.splice(logicalBreaksBefore, provenance.endings.length, ...provenance.endings);
        change.insertedLineEndings = endings;
        break;
      }
    }
    this.pendingPasteProvenance = [];
    return changes;
  }

  private recordRawPaste(rawText: string): void {
    const endings: Array<'lf' | 'crlf' | 'cr'> = [];
    for (const eol of rawText.match(/\r\n|\r|\n/g) ?? []) {
      endings.push(eol === '\r\n' ? 'crlf' : eol === '\r' ? 'cr' : 'lf');
    }
    if (endings.length === 0) return;
    this.pendingPasteProvenance.push({
      logicalText: rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
      endings,
    });
  }

  private discardPendingChanges(): void {
    // The controller's confirmed→optimistic rebase already incorporates every
    // queued CodeMirror change. Keeping their ChangeSets would replay them.
    this.pendingChangeSets = [];
  }

  /** Called by the CM editor on every doc-changing transaction. */
  private handleTransactions(transactions: readonly Transaction[]): void {
    if (this.disposed || this.programmaticDispatch) return;
    for (const tr of transactions) {
      if (tr.docChanged) this.pendingChangeSets.push(tr.changes);
    }
    // Never drop input: the controller accumulates; the cap forces a flush.
    this.controller.onUserEdit();
    this.syncDirty();
  }

  /** Keep the app-wide store dirty flag in sync with the binding (P1B 3.5). */
  private syncDirty(): void {
    const dirty = this.isDirty();
    if (store.getState().dirty !== dirty) store.setState({ dirty });
  }

  // ── Dirty / status ──────────────────────────────────────────────────

  /** Dirty = pending edits OR in-flight patch OR confirmed != persisted
   *  (design 02 §5). An in-flight patch that has not yet acked must count as
   *  dirty so close/switch can never silently drop it (P1 reviewer finding). */
  isDirty(): boolean {
    if (this.disposed) return false;
    return (
      this.controller.pending > 0 ||
      this.controller.isInFlight() ||
      this.controller.hasUnresolvedOptimisticChanges() ||
      this.controller.revision !== this.persistedRevision
    );
  }

  get pipelineState(): string {
    return this.controller.pipelineState;
  }

  get hash(): string {
    return this.controller.hash;
  }

  /** The current optimistic logical text (CodeMirror doc). */
  get logicalText(): string {
    return this.editor.doc();
  }

  isBlocked(): boolean {
    return this.controller.isBlocked();
  }

  /** Flush the pipeline and update confirmed revision/hash. */
  async flushNow(): Promise<FlushOutcome> {
    const flush = await this.controller.flush();
    if (flush.status === 'flushed') {
      this.confirmedRevision = flush.revision;
      this.confirmedHash = flush.confirmedHash;
    }
    return flush;
  }

  /**
   * Apply an explicit local image-migration patch as a real doc transaction and
   * flush it to the confirmed revision (design 04 §6: images are migrated as a
   * local patch, never a full-text rewrite before save).
   */
  async applyImagePatches(patches: LocalChange[]): Promise<void> {
    if (this.disposed || patches.length === 0) return;
    this.editor.view.dispatch({ changes: patches });
    await this.flushNow();
  }

  /** Insert `text` at the current cursor (E2E driver hook). */
  typeAtCursor(text: string): void {
    const { view } = this.editor;
    const pos = view.state.selection.main.head;
    view.dispatch({ changes: { from: pos, to: pos, insert: text } });
  }

  /** E2E/desktop automation hook: follows the same raw-paste provenance path. */
  pasteRawAtCursor(rawText: string): void {
    this.recordRawPaste(rawText);
    this.typeAtCursor(rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
  }

  // ── Save lifecycle (design 04 §2) ───────────────────────────────────

  async save(options: { interactive?: boolean } = {}): Promise<LosslessSaveResult> {
    const { interactive = true } = options;
    if (this.saving) return 'skipped';
    if (this.disposed) return 'failed';
    this.saving = true;
    let opId: string | null = null;
    let preparedRevision: number | null = null;
    // P0-3: a reload/close advances the binding generation. If it changes while
    // this save is in flight, the prepare/write/commit belongs to a discarded
    // document image and must be aborted locally (the Host additionally rejects
    // the write/commit by receipt generation).
    const saveGen = this.bindingGeneration;
    const generationAlive = () => !this.disposed && saveGen === this.bindingGeneration;
    try {
      // ── Flush barrier: all local edits must be confirmed before save ──
      const flush = await this.controller.flush();
      if (flush.status === 'disposed') return 'failed';
      if (flush.status === 'blocked') {
        return 'blocked';
      }
      if (flush.status === 'cancelled-by-user') return 'skipped';
      if (flush.status === 'flushed') {
        this.confirmedRevision = flush.revision;
        this.confirmedHash = flush.confirmedHash;
      }
      if (!generationAlive()) return 'failed';

      // ── Clean-session guard: no confirmed-vs-persisted difference → no write ──
      if (this.confirmedRevision === this.persistedRevision) {
        return 'skipped';
      }

      // ── Prepare → guarded write → commit ─────────────────────────────
      const saveOperationId = crypto.randomUUID();
      opId = saveOperationId;
      const prepared = await invoke<PrepareSaveResponse>('prepare_document_save', {
        req: {
          sessionId: this.sessionId,
          documentId: this.documentId,
          bindingGeneration: this.bindingGeneration,
          expectedRevision: this.confirmedRevision,
          expectedFileIdentity: this.fileIdentity,
          saveOperationId,
          path: this.path,
        },
      });
      preparedRevision = prepared.revision;
      if (!generationAlive()) return 'failed';

      const written = await invoke<GuardedWriteResponse>('guarded_atomic_write', {
        req: {
          path: this.path,
          payloadBase64: prepared.payloadBase64,
          expectedFileIdentity: this.fileIdentity,
          saveOperationId,
        },
      });
      if (!generationAlive()) return 'failed';

      if (written.outcome === 'conflict') {
        return 'conflict';
      }

      const newIdentity = written.newFileIdentity;
      if (newIdentity) {
        await invoke('commit_document_save', {
          req: {
            sessionId: this.sessionId,
            documentId: this.documentId,
            persistedRevision: prepared.revision,
            newFileIdentity: newIdentity,
            saveOperationId,
          },
        });
        // Bind the post-write identity for the next guarded write.
        this.fileIdentity = newIdentity;
        this.persistedRevision = prepared.revision;
      }
      this.syncDirty();
      return 'saved';
    } catch (err) {
      if (!generationAlive()) return 'failed';
      // Outcome unknown after a lost write/commit response → reconcile the
      // durable receipt, never blind-rewrite (design 04 §10).
      const outcome = await this.reconcileOutcomeUnknown(opId, preparedRevision);
      if (outcome === 'persisted') return 'saved';
      if (outcome === 'conflict') return 'conflict';
      if (interactive) store.setState({ autosaveErrorCount: store.getState().autosaveErrorCount + 1 });
      return 'failed';
    } finally {
      this.saving = false;
    }
  }

  private async reconcileOutcomeUnknown(
    opId: string | null,
    revision: number | null,
    saveAsTargetPath?: string,
  ): Promise<'persisted' | 'not-written' | 'conflict' | 'unknown'> {
    const operationId = opId;
    if (!opId || revision === null) return 'unknown';
    try {
      const reconciled = await invoke<ReconcileResponse>('reconcile_document_save', {
        saveOperationId: opId,
      });
      if (
        (reconciled.state === 'written-and-commit-pending' || reconciled.state === 'committed') &&
        reconciled.newFileIdentity
      ) {
        // The write actually landed; commit the corresponding persisted revision.
        await invoke('commit_document_save', {
          req: {
            sessionId: this.sessionId,
            documentId: this.documentId,
            persistedRevision: revision,
            newFileIdentity: reconciled.newFileIdentity,
            saveOperationId: operationId,
          },
        });
        this.fileIdentity = reconciled.newFileIdentity;
        this.persistedRevision = revision;
        if (saveAsTargetPath) this.path = saveAsTargetPath;
        this.syncDirty();
        return 'persisted';
      }
      if (reconciled.state === 'not-written') return 'not-written';
      if (reconciled.state === 'conflict') return 'conflict';
      return 'unknown';
    } catch {
      // Reconciliation failed (e.g. receipt gone): keep dirty; the next save
      // re-prepares with a fresh operation id (guarded writes are per-operation).
      return 'unknown';
    }
  }

  /**
   * Save As: write the confirmed payload to a NEW path (target expected
   * absent). After the write the session binds the new path + identity.
   */
  async saveAs(targetPath: string): Promise<LosslessSaveResult> {
    if (this.saving) return 'skipped';
    if (this.disposed) return 'failed';
    this.saving = true;
    let opId: string | null = null;
    let preparedRevision: number | null = null;
    const saveGen = this.bindingGeneration;
    const generationAlive = () => !this.disposed && saveGen === this.bindingGeneration;
    try {
      const flush = await this.controller.flush();
      if (flush.status !== 'flushed') return 'failed';
      this.confirmedRevision = flush.revision;
      this.confirmedHash = flush.confirmedHash;
      if (!generationAlive()) return 'failed';

      if (this.confirmedRevision === this.persistedRevision && this.path === targetPath) {
        return 'skipped';
      }

      const saveOperationId = crypto.randomUUID();
      opId = saveOperationId;
      const prepared = await invoke<PrepareSaveResponse>('prepare_document_save', {
        req: {
          sessionId: this.sessionId,
          documentId: this.documentId,
          bindingGeneration: this.bindingGeneration,
          expectedRevision: this.confirmedRevision,
          // Save As: target is expected to be ABSENT.
          expectedFileIdentity: null,
          saveOperationId,
          path: targetPath,
        },
      });
      preparedRevision = prepared.revision;
      if (!generationAlive()) return 'failed';
      const written = await invoke<GuardedWriteResponse>('guarded_atomic_write', {
        req: {
          path: targetPath,
          payloadBase64: prepared.payloadBase64,
          expectedFileIdentity: null,
          saveOperationId,
        },
      });
      if (!generationAlive()) return 'failed';
      if (written.outcome === 'conflict' || !written.newFileIdentity) {
        return 'conflict';
      }
      await invoke('commit_document_save', {
        req: {
          sessionId: this.sessionId,
          documentId: this.documentId,
          persistedRevision: prepared.revision,
          newFileIdentity: written.newFileIdentity,
          saveOperationId,
        },
      });
      // Rebind the session to the new path + identity for future saves.
      this.path = targetPath;
      this.fileIdentity = written.newFileIdentity;
      this.persistedRevision = prepared.revision;
      this.syncDirty();
      return 'saved';
    } catch {
      if (!generationAlive()) return 'failed';
      // Lost response after a Save As write: reconcile the new target's receipt.
      const outcome = await this.reconcileOutcomeUnknown(opId, preparedRevision, targetPath);
      if (outcome === 'persisted') return 'saved';
      return outcome === 'conflict' ? 'conflict' : 'failed';
    } finally {
      this.saving = false;
    }
  }

  // ── Reload ──────────────────────────────────────────────────────────

  async reload(path: string, defaultEol = 'lf'): Promise<void> {
    if (this.disposed) return;
    // Pause the pipeline; the reload resets confirmed/persisted to revision 0.
    this.controller.dispose();
    this.pendingChangeSets = [];
    this.pendingPasteProvenance = [];
    const reloaded = await invoke<LosslessOpenResponse>('reload_lossless_document', {
      req: { sessionId: this.sessionId, path, defaultEol },
    });
    this.path = path;
    this.bindingGeneration = reloaded.bindingGeneration;
    this.original = reloaded.original;
    this.fileIdentity = reloaded.original.fileIdentity;
    this.confirmedRevision = reloaded.revision;
    this.confirmedHash = reloaded.confirmedHash;
    this.persistedRevision = reloaded.persistedRevision;
    // replaceDoc fires the editor updateListener (docChanged) — suppress it so
    // the reload content is never re-queued as a user edit.
    this.programmaticDispatch = true;
    try {
      this.editor.replaceDoc(reloaded.logicalText);
    } finally {
      this.programmaticDispatch = false;
    }
    this.controller = new SourceSyncController({
      sessionId: reloaded.sessionId,
      documentId: reloaded.documentId,
      bindingGeneration: reloaded.bindingGeneration,
      confirmedRevision: reloaded.revision,
      confirmedHash: reloaded.confirmedHash,
      applyPatch: (patch) => this.applyPatch(patch as BridgeTextPatch),
      getSnapshot: () => this.getSnapshot(),
      composePending: () => this.composePending(),
      currentDoc: () => this.editor.doc(),
      discardPending: () => this.discardPendingChanges(),
    });
  }

  // ── Close / disposal ────────────────────────────────────────────────

  async close(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.dispose();
    this.pendingChangeSets = [];
    this.editor.destroy();
    try {
      await invoke('close_lossless_document', { req: { sessionId: this.sessionId } });
    } catch {
      // Closing a missing session is idempotent; ignore.
    }
  }

  isDisposed(): boolean {
    return this.disposed;
  }
}
