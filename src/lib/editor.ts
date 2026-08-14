import { showToast } from '../components/toast';
import { logException } from './logger';
import { checkSerializationIntegrity } from './editor.helpers';
import {
  normalizeImageMarkdown,
  replaceAssetUrlsWithOriginal,
  extractDocAsFallback,
} from './editor.serializer';

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
  getDocumentGeneration,
  markDocumentPersistedRevision,
  resetDocumentRevision,
  hasUnpersistedUserChanges,
  TRANSACTION_ORIGIN_META,
  type TransactionOrigin,
  getLastReadMtime,
  getLastReadSize,
  setLastReadStats,
} from './editor.state';
import { store } from './store';
import { scheduler } from './taskScheduler';
import {
  createSourceEditor,
  destroySourceEditor,
  getSourceContent,
  setSourceContent,
} from './editor.source';
import { getActiveLosslessBinding } from './lossless/registry';

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
  getDocumentGeneration,
  resetDocumentRevision,
  markDocumentPersistedRevision,
  hasUnpersistedUserChanges,
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

// ── Markdown serialization ────────────────────────────────────────────

export function getMarkdown(): string {
  if (getMode() === 'source') {
    const src = normalizeImageMarkdown(getSourceContent());
    // If the user typed trailing newlines in source mode, preserve them
    // directly.  Otherwise fall back to the metadata captured on open
    // (e.g. after WYSIWYG→source switch, where the CodeMirror content
    // was populated from the ProseMirror serializer which drops them).
    if (/\n$/.test(src)) return src;
    const tn = getDocumentState().trailingNewlines;
    return tn > 0 ? src + '\n'.repeat(tn) : src;
  }
  if (!getEditor()) return '';
  const md = getEditor()!.storage.markdown.getMarkdown();
  const normalized = normalizeImageMarkdown(replaceAssetUrlsWithOriginal(md));
  // ProseMirror serializer discards trailing newlines — restore from metadata.
  const tn = getDocumentState().trailingNewlines;
  return tn > 0 ? normalized + '\n'.repeat(tn) : normalized;
}

// ── Scroll reset ──────────────────────────────────────────────────────

export function resetEditorScroll() {
  document.getElementById('editor-area')?.scrollTo({ top: 0, behavior: 'auto' });
}

export function markDocumentPersisted(markdown: string, persistedRevision?: number) {
  // ── P0S revision-driven persisted baseline ────────────────────────
  // Store a serializer-friendly string for legacy status reads, but dirty is
  // now decided ONLY by userRevision vs persistedRevision — never by comparing
  // the ProseMirror serializer output against a normalized Markdown string.
  getDocumentState().lastPersistedMarkdown = stripTrailingNewlines(markdown);

  // `persistedRevision` (captured at save-start) is the userRevision at the
  // moment the save read its content. Only clear dirty if no newer user edit
  // landed during the write. If a caller passes a revision that is stale
  // (e.g. after hydration reset), keep dirty conservatively.
  if (persistedRevision !== undefined) {
    const settled = markDocumentPersistedRevision(persistedRevision);
    if (!settled) return; // newer edits landed — keep dirty for next save
  } else {
    // Legacy callers (conflict restore / save-as) have no save-start revision.
    // Mark the current userRevision as persisted (this is a deliberate save).
    getDocumentState().persistedRevision = getRevision();
  }

  // A successful save clears the persistent autosave-failure banner.
  store.setState({ dirty: hasUnpersistedUserChanges(), autosaveErrorCount: 0 });
  getDocumentState().externallyModified = false;
}

export function setMarkdown(
  content: string,
  origin: Extract<TransactionOrigin, 'hydration' | 'reloadSync'> = 'hydration',
) {
  const ed = getEditor();
  if (ed) {
    // A stale pre-P0S dirty task must never run against the newly-opened doc.
    scheduler.cancel('dirty-check');
    assetToOriginalMap.clear();
    // Capture trailing newlines before ProseMirror strips them
    const match = content.match(/\n+$/);
    getDocumentState().trailingNewlines = match ? match[0].length : 0;
    const stripped = stripTrailingNewlines(content);
    const normalized = normalizeImageMarkdown(stripped);
    // ── P0S: hydration must NOT count as a user transaction ──────────
    // A fresh (or reloaded) document starts clean: userRevision and
    // persistedRevision are both 0, dirty=false. setContent still dispatches a
    // transaction, so it carries explicit origin meta and cannot be mistaken
    // for user input; stale persisted state is cleared before dispatch.
    resetDocumentRevision();
    // Origin is carried by the same ProseMirror transaction; no later callback
    // reads a mutable module boolean to guess whether this was user input.
    ed.chain()
      .setMeta(TRANSACTION_ORIGIN_META, origin)
      .setContent(normalized, false)
      .run();
    if (getMode() === 'source') {
      setSourceContent(normalized);
    }
    store.setState({ dirty: false });
    // Store the serializer-friendly version (no trailing newlines) as
    // the legacy status baseline; dirty stays revision-driven.
    getDocumentState().lastPersistedMarkdown = stripTrailingNewlines(normalized);
  }
}

// ── Mode switching ────────────────────────────────────────────────────

export function switchToSource() {
  // Lossless Core docs are already in Source mode with Core logical text; never
  // rebuild a PM-backed source (owner isolation, design P1B §5).
  if (getActiveLosslessBinding()) {
    const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
    if (wrapper) wrapper.hidden = false;
    const wysiwygEditor = document.getElementById('wysiwyg-editor');
    if (wysiwygEditor) wysiwygEditor.hidden = true;
    setMode('source');
    return;
  }
  const ed = getEditor();
  if (!ed) return;
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  if (!wysiwygEditor || !wrapper) return;

  const rawMarkdown = replaceAssetUrlsWithOriginal(ed.storage.markdown.getMarkdown());
  const normalized = normalizeImageMarkdown(rawMarkdown);

  // Determine the content to populate CM6 with
  let content: string;
  const docText = ed.state.doc.textContent;
  const integrity = checkSerializationIntegrity(docText, normalized);

  if (integrity.truncated) {
    logException('editor.serialize', 'Markdown serialization integrity failure', undefined, {
      reason: integrity.reason,
      docLen: docText.length,
      mdLen: normalized.length,
    });
    showToast('Markdown 序列化异常，已保存全部内容');
    content = normalizeImageMarkdown(extractDocAsFallback(ed.state.doc));
  } else {
    content = normalized;
  }

  wysiwygEditor.hidden = true;
  wrapper.hidden = false;
  setMode('source');

  // Clear stale scheduler task from any previous CM6 session
  scheduler.cancel('source-update');

  // Create CM6 inside wrapper (respecting read-only state)
  const isReadOnly = store.getState().readOnly;
  const view = createSourceEditor(wrapper, content, () => {
    // ── P0S: real source-mode user edits increment userRevision only when the
    // change is a genuine user transaction (programmatic fill is suppressed by
    // the source editor's own programmaticUpdate guard). dirty is revision-driven.
    bumpRevision();
    store.setState({ dirty: hasUnpersistedUserChanges() });
    scheduler.schedule('source-update', 50, () => {
      store.emit({ type: 'editor:update' });
    });
  }, isReadOnly);

  // Focus CM6 editor so user can type immediately
  view.focus();
}

export function switchToWysiwyg() {
  // Lossless Core docs stay in Source mode (P1B vertical slice); switching would
  // require populating ProseMirror from a serializer, which the lossless session
  // never touches. Block the switch so PM is never made the owner.
  if (getActiveLosslessBinding()) {
    showToast('Lossless 模式当前仅支持源码编辑');
    return;
  }
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
  if (!wysiwygEditor || !wrapper) return;

  try {
    const ed = getEditor();
    if (ed) {
      ed.chain()
        .setMeta(TRANSACTION_ORIGIN_META, 'modeSync')
        .setContent(normalizeImageMarkdown(getSourceContent()), false)
        .run();
    }
  } finally {
    wysiwygEditor.hidden = false;
    wrapper.hidden = true;
    destroySourceEditor();
    setMode('wysiwyg');
    getEditor()?.commands.focus();
    // Immediate refresh so outline/statusbar show WYSIWYG data right away
    store.emit({ type: 'editor:update' });
  }
}

export { ensureContinuationParagraph } from './editor.continuation';

// ── Image settings (re-export for external use if needed) ──────────────

export { DEFAULT_IMAGE_SETTINGS } from './imageUtils';
