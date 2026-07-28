import { showToast } from '../components/toast';
import { logException, logDebug } from './logger';
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
  getActiveDocPath,
} from './editor.state';
import { store } from './store';
import { scheduler } from './taskScheduler';
import {
  createSourceEditor,
  destroySourceEditor,
  getSourceContent,
  setSourceContent,
} from './editor.source';
import {
  openCoreSession,
  closeCoreSession,
  isCoreBackedSourceModeEnabled,
  getCoreSessionState,
} from './coreSession';
import {
  attachPatcher,
  detachPatcher,
  createPatcherCallback,
  flushPendingPatches,
} from './editor.sourcePatcher';
import { showDegradationBar, hideDegradationBar } from '../components/degradationBar';
import { formatFileSize } from './fileSizeTier';

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
  const currentMd = stripTrailingNewlines(normalizeImageMarkdown(getMarkdown()));
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
    assetToOriginalMap.clear();
    // Capture trailing newlines before ProseMirror strips them
    const match = content.match(/\n+$/);
    getDocumentState().trailingNewlines = match ? match[0].length : 0;
    const stripped = stripTrailingNewlines(content);
    const normalized = normalizeImageMarkdown(stripped);
    getDocumentState().programmaticUpdate = true;
    ed.commands.setContent(normalized);
    if (getMode() === 'source') {
      setSourceContent(normalized);
    }
    getDocumentState().programmaticUpdate = false;
    // Store the serializer-friendly version (no trailing newlines) as
    // the baseline — dirty comparisons always strip trailing newlines.
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

  // Clear stale scheduler task from any previous CM6 session
  scheduler.cancel('source-update');

  const isReadOnly = store.getState().readOnly;
  const coreBacked = isCoreBackedSourceModeEnabled();

  // Check if we should use Core-backed source mode
  if (coreBacked) {
    const filePath = getActiveDocPath();
    if (filePath) {
      // Open a Core session in background (content will be set by Core)
      openCoreSession(filePath).then((opened) => {
        if (opened && coreBacked) {
          logDebug('editor.switch', 'Core-backed source mode activated', {
            sessionId: opened.session_id,
            revision: opened.revision,
          });
          // B1: Initialize CodeMirror with Core's authoritative content
          setSourceContent(opened.text);

          // Show degradation bar for large/huge docs in Core mode
          if (opened.size_class === 'large' || opened.size_class === 'huge') {
            showDegradationBar({
              tier: opened.size_class,
              size: formatFileSize(opened.stats.byte_count),
              lines: opened.stats.line_count,
              readOnly: opened.size_class === 'huge',
            });
          } else {
            hideDegradationBar();
          }
        }
      });
    }

    // Create CM6 with onTransaction callback for the patcher
    const onTxn = createPatcherCallback();
    const view = createSourceEditor(wrapper, content, (doc) => {
      bumpRevision();
      store.setState({ dirty: normalizeImageMarkdown(doc) !== getDocumentState().lastPersistedMarkdown });
      scheduler.schedule('source-update', 50, () => {
        store.emit({ type: 'editor:update' });
      });
    }, isReadOnly, onTxn);

    // Attach the patcher to the view
    attachPatcher();

    // Focus CM6 editor so user can type immediately
    view.focus();
    return;
  }

  // Legacy source mode path (no Core backing)
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

export async function switchToWysiwyg() {
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
  if (!wysiwygEditor || !wrapper) return;

  // B4: Wait for all pending patches to be acked before switching
  await flushPendingPatches();

  // Detach the Core-backed patcher before destroying the editor
  detachPatcher();

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

    // Close the Core session when leaving source mode
    const sessionState = getCoreSessionState();
    if (sessionState.isActive) {
      closeCoreSession().catch((err) => {
        logDebug('editor.switch', 'Non-critical error closing core session on mode switch', {
          error: String(err),
        });
      });
    }

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
