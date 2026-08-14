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
} from './types';
import { SourceSyncController, type FlushOutcome, type LocalChange } from './sourceSyncController';
import { createLosslessSourceEditor, type LosslessSourceEditorHandle } from './losslessSourceEditor';

export type LosslessSaveResult = 'saved' | 'skipped' | 'failed' | 'conflict';

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
      applyLocalChanges: (changes) => binding!.applyLocalChanges(changes),
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
    return changes;
  }

  private applyLocalChanges(changes: LocalChange[]): void {
    // Resync replay: programmatic, must not re-enter the user pipeline.
    this.programmaticDispatch = true;
    try {
      this.editor.view.dispatch({ changes });
    } finally {
      this.programmaticDispatch = false;
    }
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

  /** Dirty = pending edits OR confirmed != persisted (design 02 §5). */
  isDirty(): boolean {
    if (this.disposed) return false;
    return this.controller.pending > 0 || this.controller.revision !== this.persistedRevision;
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

  // ── Save lifecycle (design 04 §2) ───────────────────────────────────

  async save(options: { interactive?: boolean } = {}): Promise<LosslessSaveResult> {
    const { interactive = true } = options;
    if (this.saving) return 'skipped';
    if (this.disposed) return 'failed';
    this.saving = true;
    try {
      // ── Flush barrier: all local edits must be confirmed before save ──
      const flush = await this.controller.flush();
      if (flush.status === 'disposed') return 'failed';
      if (flush.status === 'blocked') {
        if (interactive) store.setState({ autosaveErrorCount: store.getState().autosaveErrorCount + 1 });
        return 'failed';
      }
      if (flush.status === 'cancelled-by-user') return 'skipped';
      if (flush.status === 'flushed') {
        this.confirmedRevision = flush.revision;
        this.confirmedHash = flush.confirmedHash;
      }

      // ── Clean-session guard: no confirmed-vs-persisted difference → no write ──
      if (this.confirmedRevision === this.persistedRevision) {
        return 'skipped';
      }

      // ── Prepare → guarded write → commit ─────────────────────────────
      const saveOperationId = crypto.randomUUID();
      const prepared = await invoke<PrepareSaveResponse>('prepare_document_save', {
        req: {
          sessionId: this.sessionId,
          documentId: this.documentId,
          expectedRevision: this.confirmedRevision,
          expectedFileIdentity: this.fileIdentity,
          saveOperationId,
          path: this.path,
        },
      });

      const written = await invoke<GuardedWriteResponse>('guarded_atomic_write', {
        req: {
          path: this.path,
          payloadBase64: prepared.payloadBase64,
          expectedFileIdentity: this.fileIdentity,
          saveOperationId,
        },
      });

      if (written.outcome === 'conflict') {
        if (interactive) store.setState({ autosaveErrorCount: store.getState().autosaveErrorCount + 1 });
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
          },
        });
        // Bind the post-write identity for the next guarded write.
        this.fileIdentity = newIdentity;
        this.persistedRevision = prepared.revision;
      }
      this.syncDirty();
      return 'saved';
    } catch (err) {
      // Outcome unknown after a lost write response → reconcile, never blind-rewrite.
      void this.reconcileOutcomeUnknown();
      if (interactive) store.setState({ autosaveErrorCount: store.getState().autosaveErrorCount + 1 });
      return 'failed';
    } finally {
      this.saving = false;
    }
  }

  private async reconcileOutcomeUnknown(): Promise<void> {
    // Best-effort: mark dirty stays; the next save re-prepares with a fresh
    // operation id, which is safe because guarded writes are per-operation.
  }

  /**
   * Save As: write the confirmed payload to a NEW path (target expected
   * absent). After the write the session binds the new path + identity.
   */
  async saveAs(targetPath: string): Promise<LosslessSaveResult> {
    if (this.saving) return 'skipped';
    if (this.disposed) return 'failed';
    this.saving = true;
    try {
      const flush = await this.controller.flush();
      if (flush.status !== 'flushed') return 'failed';
      this.confirmedRevision = flush.revision;
      this.confirmedHash = flush.confirmedHash;

      if (this.confirmedRevision === this.persistedRevision && this.path === targetPath) {
        return 'skipped';
      }

      const saveOperationId = crypto.randomUUID();
      const prepared = await invoke<PrepareSaveResponse>('prepare_document_save', {
        req: {
          sessionId: this.sessionId,
          documentId: this.documentId,
          expectedRevision: this.confirmedRevision,
          // Save As: target is expected to be ABSENT.
          expectedFileIdentity: null,
          saveOperationId,
          path: targetPath,
        },
      });
      const written = await invoke<GuardedWriteResponse>('guarded_atomic_write', {
        req: {
          path: targetPath,
          payloadBase64: prepared.payloadBase64,
          expectedFileIdentity: null,
          saveOperationId,
        },
      });
      if (written.outcome === 'conflict' || !written.newFileIdentity) {
        return 'conflict';
      }
      await invoke('commit_document_save', {
        req: {
          sessionId: this.sessionId,
          documentId: this.documentId,
          persistedRevision: prepared.revision,
          newFileIdentity: written.newFileIdentity,
        },
      });
      // Rebind the session to the new path + identity for future saves.
      this.path = targetPath;
      this.fileIdentity = written.newFileIdentity;
      this.persistedRevision = prepared.revision;
      this.syncDirty();
      return 'saved';
    } catch {
      return 'failed';
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
    this.editor.replaceDoc(reloaded.logicalText);
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
      applyLocalChanges: (changes) => this.applyLocalChanges(changes),
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
