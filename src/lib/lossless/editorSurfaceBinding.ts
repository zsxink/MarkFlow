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
import { MapMode, type ChangeSet, type Transaction } from '@codemirror/state';
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
import { classifyError, UNSUPPORTED_PLATFORM_CODE } from '../error';
import { isLivePreviewEnabled } from './livePreviewFlag';
import { getPreferredMode } from './modePreference';
import { setProjectionDisposed } from './projection';

/**
 * `blocked`/`conflict` are safe, explainable skips — never write failures.
 * `unsupported` is neither: the write was REFUSED because this platform cannot
 * do a guarded replace, so the caller must offer Save Copy / an explicitly
 * confirmed Force overwrite instead of retrying (spec atomic-save).
 */
export type LosslessSaveResult =
  | 'saved'
  | 'skipped'
  | 'blocked'
  | 'failed'
  | 'conflict'
  | 'unsupported';

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
  /** The single CodeMirror view backing this session (P2: one EditorView per
   *  document; mode switching reconfigures compartments on it). Exposed so UI
   *  consumers (outline/stats/settings/read-only) read the active binding. */
  readonly editor: LosslessSourceEditorHandle;
  private controller: SourceSyncController;
  private pendingChangeSets: ChangeSet[] = [];
  /** Browser paste event observed before CodeMirror normalizes EOLs. */
  private pendingRawPasteProvenance: Array<{ logicalText: string; endings: Array<'lf' | 'crlf' | 'cr'> }> = [];
  /**
   * Explicit paste EOLs anchored to their individual LF character in the
   * optimistic CodeMirror document. A range plus its original paste string is
   * insufficient: typing at a range boundary changes the paste-relative
   * offset, even though the pasted LF itself is still present. Individual
   * anchors are mapped through every ChangeSet and are discarded only when
   * that actual LF is replaced/deleted.
   */
  private pasteProvenance: Array<{ position: number; ending: 'lf' | 'crlf' | 'cr' }> = [];
  private programmaticDispatch = false;
  private saving = false;
  private disposed = false;
  /**
   * Set by the file watcher when this file changed outside the session. The
   * guarded write remains the authority (identity is verified at the replace
   * point), but the flag is consumed so that:
   *   - autosave does not spend a doomed attempt every tick — each refusal
   *     keeps the displaced bytes as a recovery copy on disk;
   *   - the conflict UI can tell "external change" from "save refused".
   * Cleared once the conflict is resolved (save / reload / save-as / force).
   */
  private externalConflict = false;

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
    const livePreviewEnabled = isLivePreviewEnabled();
    const editor = createLosslessSourceEditor(container, opened.logicalText, {
      readOnly: false,
      // P2: the single EditorView starts in the user's preferred mode (Source or
      // Live Preview). Live Preview is only reachable when the
      // `codemirrorLivePreview` flag is on; otherwise the preference is forced
      // back to Source. Switching mode is a compartment reconfigure, never a
      // rebuild.
      livePreview: livePreviewEnabled,
      mode: getPreferredMode(livePreviewEnabled),
      onTransaction: (transactions) => binding?.handleTransactions(transactions),
      onDocChanged: () => store.emit({ type: 'editor:update' }),
      onRawPasteText: (text) => binding?.recordRawPaste(text),
      // P3 5.5: image-file paste/drop → resource pipeline → local reference
      // Markdown transaction (design 04 §6: resource prepared BEFORE the doc
      // range is touched; failure inserts nothing).
      onImageFiles: async (files, mode) => {
        if (!binding) return null;
        const { pasteImageFile, copyLocalFileToStorage, getImageSettings, imagePathToSrc } =
          await import('../imageUtils');
        const settings = await getImageSettings();
        const docPath = binding.path;
        const references: string[] = [];
        for (const file of files) {
          try {
            const localPath =
              mode === 'drop'
                ? (file as File & { path?: string }).path
                : undefined;
            const reference = localPath
              ? await copyLocalFileToStorage(localPath, docPath, settings)
              : await pasteImageFile(file, docPath, settings);
            references.push(reference);
          } catch {
            // Skip a single failed image; the rest still insert.
          }
        }
        if (references.length === 0) return null;
        // Convert stored references to display src (asset: URLs keep editing
        // the SAME source range on next save; the migration runs at save time).
        return references.map((ref) => {
          if (/^(?:https?:|data:|asset:)/.test(ref)) return `![](${ref})`;
          const src = imagePathToSrc(ref, docPath);
          return `![](${src})`;
        });
      },
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
      selectionAfter: () => {
        const selection = binding!.editor.view.state.selection.main;
        return { anchorUtf16: selection.anchor, headUtf16: selection.head };
      },
      discardPending: () => binding!.discardPendingChanges(),
      annotateChanges: (changes) => binding!.annotatePasteProvenance(changes),
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
    composed.iterChanges((fromA, toA, fromB, _toB, inserted) => {
      changes.push({ from: fromA, to: toA, fromAfter: fromB, insert: inserted.toString() });
    });
    return this.annotatePasteProvenance(changes);
  }

  private recordRawPaste(rawText: string): void {
    const endings: Array<'lf' | 'crlf' | 'cr'> = [];
    for (const eol of rawText.match(/\r\n|\r|\n/g) ?? []) {
      endings.push(eol === '\r\n' ? 'crlf' : eol === '\r' ? 'cr' : 'lf');
    }
    if (endings.length === 0) return;
    this.pendingRawPasteProvenance.push({
      logicalText: rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
      endings,
    });
  }

  private annotatePasteProvenance(changes: LocalChange[]): LocalChange[] {
    return changes.map((change) => {
      const insertionStart = change.fromAfter ?? change.from;
      const endings = Array<'inherit' | 'lf' | 'crlf' | 'cr'>(
        (change.insert.match(/\n/g) ?? []).length,
      ).fill('inherit');
      let breakIndex = 0;
      for (let offset = 0; offset < change.insert.length; offset++) {
        if (change.insert[offset] !== '\n') continue;
        const absolute = insertionStart + offset;
        const provenance = this.pasteProvenance.find((item) => item.position === absolute);
        if (provenance) {
          endings[breakIndex] = provenance.ending;
        }
        breakIndex++;
      }
      return endings.some((ending) => ending !== 'inherit')
        ? { ...change, insertedLineEndings: endings }
        : change;
    });
  }

  private mapPasteProvenance(changes: ChangeSet): void {
    this.pasteProvenance = this.pasteProvenance
      .flatMap((item) => {
        // `TrackAfter` follows an insertion immediately before the LF (the
        // normal "type at line start" case), but returns null when the LF
        // character itself is deleted/replaced. This prevents stale clipboard
        // provenance from contaminating a later, unrelated newline.
        const position = changes.mapPos(item.position, 1, MapMode.TrackAfter);
        return position === null ? [] : [{ ...item, position }];
      });
  }

  private bindRawPasteToTransaction(changes: ChangeSet): void {
    const raw = this.pendingRawPasteProvenance.shift();
    if (!raw) return;
    const matches: Array<{ from: number; to: number }> = [];
    changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
      // Exact transaction attachment is intentional. `indexOf` would attach a
      // clipboard EOL family to unrelated typed text after a resync/rebase.
      if (matches.length === 0 && inserted.toString() === raw.logicalText) {
        matches.push({ from: fromB, to: toB });
      }
    });
    const range = matches[0];
    if (range) {
      let endingIndex = 0;
      for (let offset = 0; offset < raw.logicalText.length; offset++) {
        if (raw.logicalText[offset] !== '\n') continue;
        const ending = raw.endings[endingIndex++];
        if (ending) this.pasteProvenance.push({ position: range.from + offset, ending });
      }
    }
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
      if (tr.docChanged) {
        this.mapPasteProvenance(tr.changes);
        this.bindRawPasteToTransaction(tr.changes);
        this.pendingChangeSets.push(tr.changes);
      }
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

  /** File watcher observed an external change to this binding's file. */
  markExternalConflict(): void {
    if (!this.disposed) this.externalConflict = true;
  }

  hasExternalConflict(): boolean {
    return !this.disposed && this.externalConflict;
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

  /**
   * P2: switch the single EditorView between Source and Live Preview. This is a
   * compartment reconfiguration ONLY — no doc rewrite, no History entry, no
   * EditorView rebuild, so selection/scroll/focus/dirty/revision all survive.
   */
  setMode(mode: 'source' | 'preview'): void {
    if (this.disposed) return;
    this.editor.setMode(mode);
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

      // ── Known external change: autosave must not spend a doomed write ──
      // The guarded replace would refuse at the replacement point and keep the
      // displaced bytes as yet another recovery copy. Autosave never forces, so
      // report the structured conflict and let the next INTERACTIVE save
      // surface the choice (design 04 §4/§5). An interactive save still
      // attempts the write: only the replace-point identity check is
      // authoritative, so a watcher false positive (e.g. a bare `touch`) can
      // never turn into a spurious conflict dialog.
      if (this.externalConflict && !interactive) return 'conflict';

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
      // The write landed against the identity we now hold; any earlier
      // external-change flag has been superseded by it.
      this.externalConflict = false;
      this.syncDirty();
      return 'saved';
    } catch (err) {
      if (!generationAlive()) return 'failed';
      const code = classifyError(err).code;
      // Outcome unknown after a lost write/commit response → reconcile the
      // durable receipt, never blind-rewrite (design 04 §10).
      const outcome = await this.reconcileOutcomeUnknown(opId, preparedRevision);
      if (outcome === 'persisted') return 'saved';
      if (outcome === 'conflict') return 'conflict';
      // The platform refused the replace, so nothing reached the target and
      // retrying can only fail the same way. Report it as its own outcome so
      // the caller offers Save Copy / a confirmed Force overwrite instead of a
      // bare "save failed" (spec atomic-save).
      if (code === UNSUPPORTED_PLATFORM_CODE) return 'unsupported';
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
      // The session no longer writes to the conflicted path.
      this.externalConflict = false;
      this.syncDirty();
      return 'saved';
    } catch (err) {
      if (!generationAlive()) return 'failed';
      const code = classifyError(err).code;
      // Lost response after a Save As write: reconcile the new target's receipt.
      const outcome = await this.reconcileOutcomeUnknown(opId, preparedRevision, targetPath);
      if (outcome === 'persisted') return 'saved';
      if (outcome === 'conflict') return 'conflict';
      // create-if-absent is unavailable: the caller may still Save Copy via a
      // plain write to a target it has verified as absent.
      if (code === UNSUPPORTED_PLATFORM_CODE) return 'unsupported';
      return 'failed';
    } finally {
      this.saving = false;
    }
  }

  // ── Reload ──────────────────────────────────────────────────────────

  async reload(path: string, defaultEol = 'lf'): Promise<void> {
    if (this.disposed) return;
    // Reload changes Core's binding generation. Keep the existing controller
    // and queued CM changes alive until the Host has successfully constructed
    // that new image. Otherwise a read/UTF-8 failure would strand the visible
    // editor with a disposed controller and no way to save/recover its text.
    this.editor.setReadOnly(true);
    let reloaded: LosslessOpenResponse;
    try {
      reloaded = await invoke<LosslessOpenResponse>('reload_lossless_document', {
        req: { sessionId: this.sessionId, path, defaultEol },
      });
    } catch (error) {
      this.editor.setReadOnly(false);
      this.syncDirty();
      throw error;
    }

    // Host transition succeeded. It is now safe to retire the former
    // controller and discard its ChangeSets; Core has invalidated its binding
    // generation and the editor will be replaced from the returned snapshot.
    this.controller.dispose();
    this.pendingChangeSets = [];
    this.pendingRawPasteProvenance = [];
    this.pasteProvenance = [];
    this.path = path;
    this.bindingGeneration = reloaded.bindingGeneration;
    this.original = reloaded.original;
    this.fileIdentity = reloaded.original.fileIdentity;
    this.confirmedRevision = reloaded.revision;
    this.confirmedHash = reloaded.confirmedHash;
    this.persistedRevision = reloaded.persistedRevision;
    // The editor now shows the disk bytes, so the external change is consumed.
    this.externalConflict = false;
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
      selectionAfter: () => {
        const selection = this.editor.view.state.selection.main;
        return { anchorUtf16: selection.anchor, headUtf16: selection.head };
      },
      discardPending: () => this.discardPendingChanges(),
      annotateChanges: (changes) => this.annotatePasteProvenance(changes),
    });
    this.editor.setReadOnly(false);
    this.syncDirty();
  }

  // ── Close / disposal ────────────────────────────────────────────────

  async close(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    // Task 4.9: the projection debug state must reflect the teardown, never
    // reuse a stale rendered/stale/composing value for the next document.
    setProjectionDisposed();
    this.controller.dispose();
    this.pendingChangeSets = [];
    this.pendingRawPasteProvenance = [];
    this.pasteProvenance = [];
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
