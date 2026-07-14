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
  getLastReadMtime,
  getLastReadSize,
  setLastReadStats,
} from './editor.state';
import { store } from './store';
import {
  createSourceEditor,
  destroySourceEditor,
  getSourceContent,
  setSourceContent,
} from './editor.source';

// ── Source editor debounce timer (module-level to allow cleanup on re-entry) ─

let sourceUpdateTimer: ReturnType<typeof setTimeout> | null = null;

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

// ── Markdown serialization ────────────────────────────────────────────

export function getMarkdown(): string {
  if (getMode() === 'source') {
    return normalizeImageMarkdown(getSourceContent());
  }
  if (!getEditor()) return '';
  const md = getEditor()!.storage.markdown.getMarkdown();
  return normalizeImageMarkdown(replaceAssetUrlsWithOriginal(md));
}

// ── Scroll reset ──────────────────────────────────────────────────────

export function resetEditorScroll() {
  document.getElementById('editor-area')?.scrollTo({ top: 0, behavior: 'auto' });
}

export function markDocumentPersisted(markdown: string, persistedRevision?: number) {
  // Store the persisted content as the new baseline.
  // Callers pass already-normalized content (from getMarkdown()), so no
  // re-normalization needed — that would risk non-idempotent transforms.
  getDocumentState().lastPersistedMarkdown = markdown;

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
  const currentMd = normalizeImageMarkdown(getMarkdown());
  store.setState({ dirty: currentMd !== getDocumentState().lastPersistedMarkdown });
  getDocumentState().externallyModified = false;
}

export function setMarkdown(content: string) {
  const ed = getEditor();
  if (ed) {
    assetToOriginalMap.clear();
    const normalized = normalizeImageMarkdown(content);
    getDocumentState().programmaticUpdate = true;
    ed.commands.setContent(normalized);
    if (getMode() === 'source') {
      setSourceContent(normalized);
    }
    getDocumentState().programmaticUpdate = false;
    markDocumentPersisted(normalized);
  }
}

// ── Mode switching ────────────────────────────────────────────────────

export function switchToSource() {
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

  // Clear stale debounce timer from any previous CM6 session
  if (sourceUpdateTimer) clearTimeout(sourceUpdateTimer);

  // Create CM6 inside wrapper
  const view = createSourceEditor(wrapper, content, (doc) => {
    bumpRevision();
    store.setState({ dirty: normalizeImageMarkdown(doc) !== getDocumentState().lastPersistedMarkdown });
    if (!sourceUpdateTimer) {
      sourceUpdateTimer = setTimeout(() => {
        sourceUpdateTimer = null;
        store.emit({ type: 'editor:update' });
      }, 50);
    }
  });

  // Focus CM6 editor so user can type immediately
  view.focus();
}

export function switchToWysiwyg() {
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
  if (!wysiwygEditor || !wrapper) return;

  try {
    const ed = getEditor();
    if (ed) {
      getDocumentState().programmaticUpdate = true;
      ed.commands.setContent(normalizeImageMarkdown(getSourceContent()));
    }
  } finally {
    getDocumentState().programmaticUpdate = false;
    wysiwygEditor.hidden = false;
    wrapper.hidden = true;
    destroySourceEditor();
    setMode('wysiwyg');
    getEditor()?.commands.focus();
    // Immediate refresh so outline/statusbar show WYSIWYG data right away
    store.emit({ type: 'editor:update' });
  }
}

// ── Image settings (re-export for external use if needed) ──────────────

export { DEFAULT_IMAGE_SETTINGS } from './imageUtils';
