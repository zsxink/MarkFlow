import { showToast } from '../components/toast';
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
  setLastReadStats,
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
  setLastReadStats,
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

// ── Markdown serialization ────────────────────────────────────────────

export function getMarkdownResult(): MarkdownSerializeResult {
  if (getMode() === 'source') {
    const src = normalizeImageMarkdown(getSourceContent());
    // If the user typed trailing newlines in source mode, preserve them
    // directly.  Otherwise fall back to the metadata captured on open
    // (e.g. after WYSIWYG→source switch, where the CodeMirror content
    // was populated from the ProseMirror serializer which drops them).
    return { ok: true, markdown: appendTrailingNewlines(src) };
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
        currentSourceRevision: 1,
        currentUserRevision: getRevision(),
        pipelineMode: getMarkdownPipelineMode(),
      });
      if (decision.kind === 'safe-edit') {
        return { ok: true, markdown: appendTrailingNewlines(decision.markdown) };
      }
      if (decision.kind === 'unchanged') {
        return { ok: true, markdown: appendTrailingNewlines(session.sourceBaseline) };
      }
      if (decision.kind === 'conflict') {
        return { ok: false, error: { stage: 'serialize', code: `reconcile-${decision.code}` } };
      }
    }
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
export function getSavePlan(): SavePlan {
  const mode = getMarkdownPipelineMode();
  if (!shouldUseReconcileBoundary(mode)) return { kind: 'legacy' };
  const editor = getEditor();
  const session = getOpaqueSession();
  const registry = getOpaqueRegistry();
  if (!editor || !session || !registry) return { kind: 'legacy' };

  const decision = runSaveBoundary(editor, {
    session,
    registry,
    currentSourceRevision: 1,
    currentUserRevision: getRevision(),
    pipelineMode: mode,
  });

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
  // Store the persisted content as the new baseline, without trailing newlines.
  // ProseMirror's serializer never produces trailing newlines, so all dirty
  // comparisons deal with content trimmed of them on both sides.
  getDocumentState().lastPersistedMarkdown = stripTrailingNewlines(markdown);

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
  const currentMd = stripTrailingNewlines(normalizeImageMarkdown(current.markdown));
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
    // Task 7.6: opening/switching a document ends any previous opaque session so
    // old slots from the prior document can never resolve in this one.
    endOpaqueSession();
    assetToOriginalMap.clear();
    // Capture trailing newlines before ProseMirror strips them
    const match = content.match(/\n+$/);
    getDocumentState().trailingNewlines = match ? match[0].length : 0;
    const normalized = normalizeImageMarkdown(content);
    const stripped = stripTrailingNewlines(normalized);
    const parsed = withProgrammaticUpdate(() => parseMarkdown(ed, stripped));
    if (!parsed.ok) {
      setMarkdownPipelineMode('source-only');
      showToast('Markdown 无法安全转换，已保留源码模式');
      enterSourceMode(normalized);
      // The freshly loaded source-only document is the persisted baseline:
      // reset dirty/externallyModified so a prior dirty document does not
      // leak into this one.
      getDocumentState().lastPersistedMarkdown = normalized;
      getDocumentState().externallyModified = false;
      store.setState({ dirty: false, autosaveErrorCount: 0, reconcileError: null });
      return;
    }
    // Stage-two admission (6.5 + 8.1): only fully-supported documents advance
    // to WYSIWYG (`gated`); `eligible-with-opaque` documents advance to `opaque`
    // (section 7) with a verified session; `source-only` documents stay in
    // Source with a stable reason, never destroying the CM6 editor or rewriting
    // disk. The verification re-parse is programmatic, so it must not register
    // as a user edit, bump the revision, or mark the document dirty.
    const admission = withProgrammaticUpdate(() =>
      decideAdmission(ed, stripped, { sourceRevision: 1, userRevisionAtAdmission: getRevision() }),
    );
    if (admission.mode === 'source-only') {
      setMarkdownPipelineMode('source-only');
      showToast(`已保留源码模式：${admissionReasonLabel(admission.reason)}`);
      enterSourceMode(normalized);
      // Same baseline reset as the parse-failure branch above: a document
      // admitted to source-only is loaded clean and must not inherit a prior
      // document's dirty state or stale lastPersistedMarkdown.
      getDocumentState().lastPersistedMarkdown = normalized;
      getDocumentState().externallyModified = false;
      store.setState({ dirty: false, autosaveErrorCount: 0, reconcileError: null });
      return;
    }
    setMarkdownPipelineMode(admission.mode); // 'gated' | 'opaque'
    if (getMode() === 'source') {
      setSourceContent(admission.mode === 'opaque' ? admission.renderedSource ?? normalized : normalized);
    }
    // Opening/reloading establishes a source baseline. Do not reserialize it
    // here: v3 canonicalization is representation work, not a user edit.
    getDocumentState().lastPersistedMarkdown = admission.mode === 'opaque'
      ? (admission.session?.sourceBaseline ?? stripped)
      : stripped;
    getDocumentState().externallyModified = false;
    store.setState({ dirty: false, autosaveErrorCount: 0, reconcileError: null });
  }
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

  // Clear stale scheduler task from any previous CM6 session
  scheduler.cancel('source-update');

  // Create CM6 inside wrapper (respecting read-only state)
  const isReadOnly = store.getState().readOnly;
  const view = createSourceEditor(wrapper, content, (doc) => {
    bumpRevision();
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
    decideAdmission(editor, stripped, { sourceRevision: 1, userRevisionAtAdmission: getRevision() }),
  );
  if (admission.mode === 'source-only') {
    setMarkdownPipelineMode('source-only');
    store.setState({ reconcileError: null });
    showToast(`已保留源码模式：${admissionReasonLabel(admission.reason)}`);
    return;
  }
  setMarkdownPipelineMode(admission.mode);
  if (admission.mode === 'opaque') {
    // admitOpaque already parsed the sentinel source into the editor.
    getDocumentState().lastPersistedMarkdown = admission.session?.sourceBaseline ?? stripped;
  }
  wysiwygEditor.hidden = false;
  wrapper.hidden = true;
  destroySourceEditor();
  setMode('wysiwyg');
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
