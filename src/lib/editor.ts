import { showToast } from '../components/toast';
import { refreshFrontmatterPanel } from '../components/frontmatterPanel';
import {
  normalizeImageMarkdown,
} from './editor.serializer';
import { parseMarkdown, serializeMarkdown, type MarkdownSerializeResult } from './editor.markdown.bridge';
import { decideAdmission, admissionReasonLabel } from './editor.markdown.admission';
import { endOpaqueSession, getOpaqueRegistry, getOpaqueSession } from './editor.markdown.opaque.session';
import { runSaveBoundary, shouldUseReconcileBoundary } from './editor.save.reconcile';

// Shared state
import {
  assetToOriginalMap,
  getEditor,
  getDocumentState,
  getMode,
  setMode,
  isDocumentDirty,
  hasExternalModification,
  markExternalModification,
  setActiveDocumentPath,
  bumpRevision,
  getRevision,
  getLastReadMtime,
  getLastReadSize,
  hasLastReadStats,
  setLastReadStats,
  clearLastReadStats,
  bumpSourceRevision,
  getSourceRevision,
  setMarkdownPipelineMode,
  getMarkdownPipelineMode,
  withProgrammaticUpdate,
} from './editor.state';
import { store } from './store';
import { scheduler } from './taskScheduler';
import {
  createSourceEditor,
  destroySourceEditor,
  getSourceContent,
  setSourceContent,
} from './editor.source';

// ── Barrel re-exports for API compatibility ───────────────────────────

export {
  getEditor,
  getMode,
  setMode,
  isDocumentDirty,
  hasExternalModification,
  markExternalModification,
  setActiveDocumentPath,
  bumpRevision,
  getRevision,
  getLastReadMtime,
  getLastReadSize,
  hasLastReadStats,
  setLastReadStats,
  clearLastReadStats,
  getSourceRevision,
};
export { getWordCount, getLineCount, getCursorPos } from './editor.stats';
export { initEditor } from './editor.init';

// ── Trailing newline helpers ──────────────────────────────────────────

/**
 * Strip trailing \n characters. ProseMirror serializer discards them,
 * so comparisons against serialized output must be agnostic to them.
 */
function stripTrailingNewlines(s: string): string {
  return s.replace(/\n+$/, '');
}

function appendTrailingNewlines(markdown: string): string {
  if (/\n$/.test(markdown)) return markdown;
  const trailingNewlines = getDocumentState().trailingNewlines;
  return trailingNewlines > 0 ? markdown + '\n'.repeat(trailingNewlines) : markdown;
}

function restoreWysiwygTrailingNewlines(markdown: string): string {
  return markdown.replace(/(?:\r?\n)+$/, '');
}

// ── Markdown serialization ────────────────────────────────────────────

export function getMarkdownResult(): MarkdownSerializeResult {
  if (getMode() === 'source') {
    // CM6 holds authored text. Never add WYSIWYG tail metadata here: doing so
    // resurrects removed/newline-count-edited text on the next save.
    return { ok: true, markdown: normalizeImageMarkdown(getSourceContent()) };
  }
  const editor = getEditor();
  if (!editor) return { ok: false, error: { stage: 'serialize', code: 'editor-unavailable' } };

  // Opaque-aware modes serialize through the reconcile boundary so opaque
  // sentinels are restored to RAW spans — Source mode / save must never see an
  // internal token. A conflict surfaces as a failed conversion (no candidate).
  if (shouldUseReconcileBoundary(getMarkdownPipelineMode())) {
    const session = getOpaqueSession();
    const registry = getOpaqueRegistry();
    if (session && registry) {
      const decision = runSaveBoundary(editor, {
        session,
        registry,
        currentSourceRevision: getSourceRevision(),
        currentUserRevision: getRevision(),
        pipelineMode: getMarkdownPipelineMode(),
      });
      if (decision.kind === 'safe-edit') {
        return { ok: true, markdown: restoreWysiwygTrailingNewlines(decision.markdown) };
      }
      if (decision.kind === 'unchanged') {
        return { ok: true, markdown: appendTrailingNewlines(session.sourceBaseline) };
      }
      if (decision.kind === 'conflict') {
        return { ok: false, error: { stage: 'serialize', code: `reconcile-${decision.code}` } };
      }
    }
    // A verified pipeline without its session or registry is unsafe: the raw
    // serializer may emit an opaque sentinel. Do not silently fall back.
    return { ok: false, error: { stage: 'serialize', code: 'reconcile-session-missing' } };
  }

  const result = serializeMarkdown(editor);
  return result.ok ? { ok: true, markdown: appendTrailingNewlines(result.markdown) } : result;
}

/** Compatibility API for read-only consumers. Save callers use getMarkdownResult. */
export function getMarkdown(): string {
  const result = getMarkdownResult();
  return result.ok ? result.markdown : '';
}

// ── Reconcile save plan (tasks 8.5–8.8) ─────────────────────────────────

export type SavePlan =
  | { kind: 'legacy' } // opaque/reconcile not active → caller uses getMarkdownResult
  | { kind: 'unchanged'; write: false }
  | { kind: 'safe-edit'; write: true; markdown: string }
  | { kind: 'conflict'; write: false; code: string };

/**
 * Compute the save decision when the pipeline is in an opaque-aware mode.
 * `unchanged` → skip disk write (keep exact source bytes); `safe-edit` → write
 * the verified candidate; `conflict` → suppress the write, keep dirty, set the
 * store's `reconcileError` (8.5). Returns `legacy` when the boundary is not
 * active so the existing serialization path is untouched.
 */
export function getSavePlan(options: { allowConfirmedExternalOverwrite?: boolean } = {}): SavePlan {
  const mode = getMarkdownPipelineMode();
  if (!shouldUseReconcileBoundary(mode)) return { kind: 'legacy' };
  const editor = getEditor();
  const session = getOpaqueSession();
  const registry = getOpaqueRegistry();
  if (!editor || !session || !registry) {
    store.setState({ dirty: true, reconcileError: 'session-missing' });
    return { kind: 'conflict', write: false, code: 'session-missing' };
  }

  const decision = runSaveBoundary(editor, {
    session,
    registry,
    currentSourceRevision: options.allowConfirmedExternalOverwrite ? session.sourceRevision : getSourceRevision(),
    currentUserRevision: getRevision(),
    pipelineMode: mode,
  });

  // A Source→WYSIWYG admission deliberately captures the current Source text
  // (so it can prove it is safe) without changing the disk baseline. The
  // reconcile classifier correctly calls this session "unchanged" because no
  // WYSIWYG transaction followed admission, but it is still a pending disk
  // edit when its exact authored text differs from the persisted file.
  if (decision.kind === 'unchanged') {
    const admissionSource = appendTrailingNewlines(session.sourceBaseline);
    // A byte comparison alone is insufficient: parser/render normalization can
    // make an untouched CRLF baseline look different. Source edits set dirty
    // before admission; only that pending edit may turn reconcile's no-WYS
    // transaction result into a disk write.
    if (isDocumentDirty()
      && normalizeImageMarkdown(admissionSource) !== getDocumentState().lastPersistedMarkdown) {
      store.setState({ reconcileError: null });
      return { kind: 'safe-edit', write: true, markdown: admissionSource };
    }
  }

  if (decision.kind === 'safe-edit') {
    return { ...decision, markdown: restoreWysiwygTrailingNewlines(decision.markdown) };
  }

  if (decision.kind === 'conflict') {
    store.setState({ dirty: true, reconcileError: decision.code });
  } else {
    store.setState({ reconcileError: null });
  }
  return decision;
}

/** Convenience: the current pipeline mode (re-export for callers). */
export function getPipelineMode() {
  return getMarkdownPipelineMode();
}

// ── Scroll reset ──────────────────────────────────────────────────────

export function resetEditorScroll() {
  document.getElementById('editor-area')?.scrollTo({ top: 0, behavior: 'auto' });
}

export function markDocumentPersisted(markdown: string, persistedRevision?: number) {
  // The disk baseline is exact authored text, including EOF newline count.
  // Source owns that count; stripping it here would make a subsequent
  // Source→WYSIWYG save restore stale metadata.
  getDocumentState().lastPersistedMarkdown = normalizeImageMarkdown(markdown);

  // If a revision was captured at save-start, only clear dirty when no newer
  // edits arrived during the write.  Without a revision (legacy callers) we
  // always clear dirty for backward compatibility.
  if (persistedRevision !== undefined && persistedRevision !== getRevision()) {
    // Newer edits landed — keep dirty so the next save picks them up.
    return;
  }

  // Content-based sanity check: compare actual current content against what
  // was just persisted.  This handles edge cases where the revision counter
  // incremented (e.g. from a debounced onUpdate) but the current editor
  // content hasn't materially changed (just the debounce timer caught up).
  const current = getMarkdownResult();
  // A failed conversion is never considered persisted or clean.
  if (!current.ok) {
    store.setState({ dirty: true });
    return;
  }
  const currentMd = normalizeImageMarkdown(current.markdown);
  // A successful save clears the persistent autosave-failure banner, regardless
  // of whether the save came from autosave or an interactive (Ctrl+S) save.
  store.setState({
    dirty: currentMd !== getDocumentState().lastPersistedMarkdown,
    autosaveErrorCount: 0,
  });
  getDocumentState().externallyModified = false;
}

export function setMarkdown(content: string) {
  const ed = getEditor();
  if (ed) {
    // Cancel any pending dirty-check from a previous document's onUpdate.
    // Without this, a stale task captures old content and, when it fires
    // 400 ms later, compares it against the new baseline — incorrectly
    // marking the freshly loaded document dirty.
    scheduler.cancel('dirty-check');
    // Task 7.6: opening/switching a document ends any previous opaque session so
    // old slots from the prior document can never resolve in this one.
    endOpaqueSession();
    const sourceRevision = bumpSourceRevision();
    clearLastReadStats();
    assetToOriginalMap.clear();
    // Capture trailing newlines before ProseMirror strips them
    const match = content.match(/\n+$/);
    getDocumentState().trailingNewlines = match ? match[0].length : 0;
    // Keep the persisted/admission source byte-faithful. Image normalization
    // belongs to an actual write candidate, not an open-time baseline: it
    // would otherwise erase CRLF spelling before an untouched save decision.
    const stripped = stripTrailingNewlines(content);
    // When Source is active it is the authoritative surface.  In particular,
    // do not place opaque sentinels in CM6 and do not retain an opaque session
    // that would make a later Source save read stale WYSIWYG content.
    if (getMode() === 'source') {
      setMarkdownPipelineMode('source-only');
      setSourceContent(content);
      getDocumentState().lastPersistedMarkdown = content;
      getDocumentState().externallyModified = false;
      store.setState({ dirty: false, autosaveErrorCount: 0, reconcileError: null });
      refreshFrontmatterPanel(content);
      return;
    }
    const parsed = withProgrammaticUpdate(() => parseMarkdown(ed, stripped));
    if (!parsed.ok) {
      setMarkdownPipelineMode('source-only');
      showToast('Markdown 无法安全转换，已保留源码模式');
      enterSourceMode(content);
      // The freshly loaded source-only document is the persisted baseline:
      // reset dirty/externallyModified so a prior dirty document does not
      // leak into this one.
      getDocumentState().lastPersistedMarkdown = content;
      getDocumentState().externallyModified = false;
      store.setState({ dirty: false, autosaveErrorCount: 0, reconcileError: null });
      refreshFrontmatterPanel(content);
      return;
    }
    // Stage-two admission (6.5 + 8.1): only fully-supported documents advance
    // to WYSIWYG (`gated`); `eligible-with-opaque` documents advance to `opaque`
    // (section 7) with a verified session; `source-only` documents stay in
    // Source with a stable reason, never destroying the CM6 editor or rewriting
    // disk. The verification re-parse is programmatic, so it must not register
    // as a user edit, bump the revision, or mark the document dirty.
    const admission = withProgrammaticUpdate(() =>
      decideAdmission(ed, content, { sourceRevision, userRevisionAtAdmission: getRevision() }),
    );
    if (admission.mode === 'source-only') {
      setMarkdownPipelineMode('source-only');
      showToast(`已保留源码模式：${admissionReasonLabel(admission.reason)}`);
      enterSourceMode(content);
      // Same baseline reset as the parse-failure branch above: a document
      // admitted to source-only is loaded clean and must not inherit a prior
      // document's dirty state or stale lastPersistedMarkdown.
      getDocumentState().lastPersistedMarkdown = content;
      getDocumentState().externallyModified = false;
      store.setState({ dirty: false, autosaveErrorCount: 0, reconcileError: null });
      refreshFrontmatterPanel(content);
      return;
    }
    setMarkdownPipelineMode(admission.mode);
    // Opening/reloading establishes a source baseline. Do not reserialize it
    // here: v3 canonicalization is representation work, not a user edit.
    // This is the on-disk baseline, not the admission render baseline. Keep
    // the normalized file text intact (including CRLF/EOF newline count) so
    // an untouched WYSIWYG open remains `unchanged` and never rewrites mtime.
    getDocumentState().lastPersistedMarkdown = content;
    getDocumentState().externallyModified = false;
    store.setState({ dirty: false, autosaveErrorCount: 0, reconcileError: null });
    refreshFrontmatterPanel(content);
  }
}

/** Applies a user-authored frontmatter patch through the normal admission path. */
export function applyFrontmatterMarkdown(content: string): void {
  if (store.getState().readOnly || content === getMarkdown()) return;
  const persistedBaseline = getDocumentState().lastPersistedMarkdown;
  // Advance the user revision before admission so the rebuilt opaque session
  // captures it as its baseline. Advancing it afterwards makes reconciliation
  // mistake this programmatic re-admission for an untracked WYSIWYG edit.
  bumpRevision();
  setMarkdown(content);
  // `setMarkdown` is also the document-load path and therefore establishes a
  // clean baseline. A panel patch is a user edit, so retain the disk baseline.
  getDocumentState().lastPersistedMarkdown = persistedBaseline;
  store.setState({ dirty: normalizeImageMarkdown(content) !== persistedBaseline });
  store.emit({ type: 'editor:update' });
}

// ── Mode switching ────────────────────────────────────────────────────

export function switchToSource() {
  const ed = getEditor();
  if (!ed) return;
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  if (!wysiwygEditor || !wrapper) return;

  const serialized = getMarkdownResult();
  if (!serialized.ok) {
    setMarkdownPipelineMode('source-only');
    // Never turn a lossy fallback into a source/save candidate. The last
    // persisted baseline is the only safe recovery text in reduced-risk mode.
    showToast('Markdown 序列化失败，已恢复到上次安全源码');
    endOpaqueSession();
    enterSourceMode(getDocumentState().lastPersistedMarkdown);
    return;
  }
  // Task 8.7: once committed to Source, the opaque session is invalid — a
  // subsequent source edit (or external reload) must re-admit from scratch.
  endOpaqueSession();
  enterSourceMode(serialized.markdown);
}

function enterSourceMode(content: string) {
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement | null;
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  if (!wysiwygEditor || !wrapper) return;
  wysiwygEditor.hidden = true;
  wrapper.hidden = false;
  setMode('source');
  refreshFrontmatterPanel(content);

  // Clear stale scheduler task from any previous CM6 session
  scheduler.cancel('source-update');

  // Create CM6 inside wrapper (respecting read-only state)
  const isReadOnly = store.getState().readOnly;
  const view = createSourceEditor(wrapper, content, (doc) => {
    bumpRevision();
    bumpSourceRevision();
    store.setState({ dirty: normalizeImageMarkdown(doc) !== getDocumentState().lastPersistedMarkdown });
    scheduler.schedule('source-update', 50, () => {
      store.emit({ type: 'editor:update' });
    });
  }, isReadOnly);

  // Focus CM6 editor so user can type immediately
  view.focus();
}

export function switchToWysiwyg() {
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
  if (!wysiwygEditor || !wrapper) return;

  const editor = getEditor();
  if (!editor) return;
  const source = getSourceContent();
  // Source owns exact EOF newlines. Capture its current metadata before
  // parsing so the first WYSIWYG save cannot restore a stale open-time count.
  const trailing = source.match(/\n+$/);
  getDocumentState().trailingNewlines = trailing ? trailing[0].length : 0;
  const stripped = stripTrailingNewlines(source);
  const parsed = withProgrammaticUpdate(() => parseMarkdown(editor, stripped));
  if (!parsed.ok) {
    setMarkdownPipelineMode('source-only');
    showToast('Markdown 无法安全转换，请继续在源码模式编辑');
    return;
  }
  // Stage-two admission (6.5 + 8.1): reject source-only docs without destroying
  // the CM6 editor (no disk rewrite, no WYSIWYG surface); admit opaque docs to
  // `opaque` with a verified session.
  const admission = withProgrammaticUpdate(() =>
    decideAdmission(editor, source, { sourceRevision: getSourceRevision(), userRevisionAtAdmission: getRevision() }),
  );
  if (admission.mode === 'source-only') {
    setMarkdownPipelineMode('source-only');
    store.setState({ reconcileError: null });
    showToast(`已保留源码模式：${admissionReasonLabel(admission.reason)}`);
    return;
  }
  setMarkdownPipelineMode(admission.mode);
  // Keep `lastPersistedMarkdown` as the disk baseline. The current Source
  // value is only an admission baseline; replacing this would make its first
  // save appear unchanged and lose the edit.
  wysiwygEditor.hidden = false;
  wrapper.hidden = true;
  destroySourceEditor();
  setMode('wysiwyg');
  refreshFrontmatterPanel(source);
  editor.commands.focus();
  // Immediate refresh so outline/statusbar show WYSIWYG data right away
  store.emit({ type: 'editor:update' });
}

/**
 * Emergency kill-switch (design Decision 4 / task 6.6): degrade any stage-two
 * pipeline mode (`gated` and above) to `source-only`. This clears higher-mode
 * session state and reloads the Source editor from the LAST ORIGINAL SOURCE
 * baseline captured on open — never from the canonicalized editor content — so
 * a forced downgrade can never feed representation work back into Source or
 * write it to disk. Session-state teardown for `opaque`/`reconcile` sessions is
 * added in sections 7–8.
 */
export function degradeToSourceOnly(): void {
  setMarkdownPipelineMode('source-only');
  // Re-enter Source from the last original source baseline.
  enterSourceMode(getDocumentState().lastPersistedMarkdown);
}

export { ensureContinuationParagraph } from './editor.continuation';

// ── Image settings (re-export for external use if needed) ──────────────

export { DEFAULT_IMAGE_SETTINGS } from './imageUtils';
