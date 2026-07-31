import { showToast } from '../components/toast';
import { logException, logDebug } from './logger';
import { normalizeImageMarkdown } from './editor.serializer';

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
  createCoreWysiwygEditor,
  createSourceEditor,
  destroySourceEditor,
  getSourceContent,
  setSourceContent,
} from './editor.source';
import {
  openCoreSession,
  isCoreBackedSourceModeEnabled,
  getCoreSessionState,
  setSourceSyncController,
  getSourceSyncController,
} from './coreSession';
import { SourceSyncController } from './SourceSyncController';
import { showDegradationBar, hideDegradationBar } from '../components/degradationBar';
import { formatFileSize } from './fileSizeTier';

type WysiwygEngine = 'legacy-prosemirror' | 'core-codemirror';

let wysiwygEngine: WysiwygEngine = 'legacy-prosemirror';

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

export function getWysiwygEngine(): WysiwygEngine {
  return wysiwygEngine;
}

export function isCoreBackedWysiwygActive(): boolean {
  return getMode() === 'wysiwyg' && wysiwygEngine === 'core-codemirror';
}

// ── Trailing newline helpers ──────────────────────────────────────────

/**
 * Strip trailing \n characters. ProseMirror serializer discards them,
 * so comparisons against serialized output must be agnostic to them.
 */
function stripTrailingNewlines(s: string): string {
  return s.replace(/\n+$/, '');
}

// ── Core/source Markdown mirror ────────────────────────────────────────

export function getCurrentSourceMarkdown(): string {
  if (getMode() === 'source' || isCoreBackedWysiwygActive()) {
    const src = normalizeImageMarkdown(getSourceContent());
    // If the user typed trailing newlines in source mode, preserve them
    // directly.  Otherwise fall back to the metadata captured on open
    // (e.g. after WYSIWYG→source switch, where the CodeMirror content
    // was populated from the ProseMirror serializer which drops them).
    if (/\n$/.test(src)) return src;
    const tn = getDocumentState().trailingNewlines;
    return tn > 0 ? src + '\n'.repeat(tn) : src;
  }
  throw new Error('CORE_MARKDOWN_UNAVAILABLE: active editor is not backed by Core source');
}

// ── Scroll reset ──────────────────────────────────────────────────────

export function resetEditorScroll() {
  document.getElementById('editor-area')?.scrollTo({ top: 0, behavior: 'auto' });
}

export function markDocumentPersisted(markdown: string, persistedRevision?: number) {
  // Store the persisted content as the new baseline, without trailing newlines.
  // Dirty comparisons strip trailing newlines on both sides.
  getDocumentState().lastPersistedMarkdown = stripTrailingNewlines(markdown);

  // If a revision was captured at save-start, only clear dirty when no newer
  // edits arrived during the write.  Without a revision (legacy callers) we
  // always clear dirty for backward compatibility.
  if (persistedRevision !== undefined && persistedRevision !== getRevision()) {
    // Newer edits landed — keep dirty so the next save picks them up.
    return;
  }

  // Content-based sanity check when a Core/source mirror is available. Plain
  // WYSIWYG open/reload calls provide the just-read disk content directly and
  // must not synthesize Markdown from the editor DOM.
  const currentMd = stripTrailingNewlines(normalizeImageMarkdown(
    getMode() === 'source' || isCoreBackedWysiwygActive()
      ? getCurrentSourceMarkdown()
      : markdown,
  ));
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
    // Store the just-read Markdown as the baseline. This path must not call a
    // ProseMirror serializer to synthesize persisted content.
    markDocumentPersisted(normalized);
  }
}

// ── Mode switching ────────────────────────────────────────────────────

export async function switchToSource() {
  const ed = getEditor();
  if (!ed) return;
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  if (!wysiwygEditor || !wrapper) return;

  if (isCoreBackedWysiwygActive()) {
    await switchCoreWysiwygToSource(wysiwygEditor, wrapper);
    return;
  }

  // M3.1-3.6: WYSIWYG dirty gate — prompt save/discard/cancel before switching
  if (isDocumentDirty()) {
    const action = await promptWysiwygDirtyDialog();
    if (action === 'cancel') return; // stay in WYSIWYG
    if (action === 'save') {
      // Try to trigger a save using the store's lastPersistedMarkdown mechanism.
      // The saveActiveDocument function handles both legacy and Core-backed saves.
      const { saveActiveDocument } = await import('../components/sidebar');
      const saved = await saveActiveDocument();
      if (saved === 'saved' || !isDocumentDirty()) {
        // Proceed with switch
      } else {
        // User cancelled save or save failed — stay in WYSIWYG
        return;
      }
    }
    // action === 'discard': proceed without saving
  }

  // Clear stale scheduler task from any previous CM6 session
  scheduler.cancel('source-update');

  const isReadOnly = store.getState().readOnly;
  const coreBacked = isCoreBackedSourceModeEnabled();

  if (!coreBacked) {
    showToast('源码模式需要 Core 会话，当前文档暂不能切换');
    return;
  }

  // ── Core-backed source mode ───────────────────────────────────────────
  // M3.1-3.4: Show loading indicator, wait for open_document before creating CM

  const filePath = getActiveDocPath();
  if (!filePath) {
    showToast('无法切换源码模式：没有已打开的文件');
    return;
  }

  // Show loading state — wrapper visible, show loading indicator
  wysiwygEditor.hidden = true;
  wrapper.hidden = false;
  wysiwygEngine = 'legacy-prosemirror';
  setMode('source');
  wrapper.dataset.coreLoading = 'true';
  // Insert a loading indicator if not already present
  let loadingEl = wrapper.querySelector('.source-loading-indicator') as HTMLElement;
  if (!loadingEl) {
    loadingEl = document.createElement('div');
    loadingEl.className = 'source-loading-indicator';
    loadingEl.textContent = '正在打开文件…';
    loadingEl.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:14px;';
    wrapper.appendChild(loadingEl);
  }
  loadingEl.hidden = false;

  try {
    const opened = await openCoreSession(filePath);

    if (!opened) {
      // M3.1-3.5: open_document failed — show error, stay in WYSIWYG
      showToast('打开源码模式失败，已退回 WYSIWYG 模式');
      cleanupSourceSwitch(wysiwygEditor, wrapper, loadingEl);
      return;
    }

    logDebug('editor.switch', 'Core-backed source mode activated', {
      sessionId: opened.session_id,
      revision: opened.revision,
    });

    // Hide loading indicator
    loadingEl.hidden = true;
    delete wrapper.dataset.coreLoading;

    // M3.1-3.4: Create CM6 only after open_document succeeds
    // M3.1-2.8: Create SourceSyncController and register in coreSession
    const controller = new SourceSyncController();
    setSourceSyncController(controller);
    const view = createSourceEditor(wrapper, opened.text, (doc) => {
      bumpRevision();
      store.setState({ dirty: normalizeImageMarkdown(doc) !== getDocumentState().lastPersistedMarkdown });
      scheduler.schedule('source-update', 50, () => {
        store.emit({ type: 'editor:update' });
      });
    }, isReadOnly, (update) => {
      controller.processTransactions(update.transactions);
    });

    // Attach the SourceSyncController to the view with initial revision
    controller.attach(view, opened.revision);

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

    view.focus();
  } catch (err) {
    logException('editor.switch', 'Unexpected error switching to source mode', err, { filePath });
    showToast('切换到源码模式时发生错误');
    cleanupSourceSwitch(wysiwygEditor, wrapper, loadingEl);
  }
}

/**
 * Prompt the user about unsaved WYSIWYG changes when switching to Source mode.
 * Returns 'save', 'discard', or 'cancel'.
 *
 * Uses the browser's native confirm() as the dialog mechanism.
 * In a future iteration this could use a custom modal dialog.
 */
async function promptWysiwygDirtyDialog(): Promise<'save' | 'discard' | 'cancel'> {
  // Model: save/discard/cancel. Native confirm only has OK/Cancel,
  // so we use a sequence: first ask save/discard, then confirm.
  // Using simple confirm for now — future: custom modal.
  const save = confirm('当前文档有未保存的修改。是否先保存再切换到源码模式？\n\n点击"确定"保存后切换\n点击"取消"选择放弃修改');
  if (save) return 'save';
  // User cancelled save — now ask about discarding
  const discard = confirm('未保存的修改将丢失。是否仍然切换到源码模式？\n\n点击"确定"放弃修改并切换\n点击"取消"留在当前模式');
  return discard ? 'discard' : 'cancel';
}

/**
 * Clean up after a failed source mode switch.
 * Hides the wrapper, shows WYSIWYG, removes loading indicator.
 */
function cleanupSourceSwitch(
  wysiwygEditor: HTMLElement,
  wrapper: HTMLElement,
  loadingEl: HTMLElement | null,
): void {
  if (loadingEl) loadingEl.hidden = true;
  delete wrapper.dataset.coreLoading;
  wrapper.hidden = true;
  wysiwygEditor.hidden = false;
  setMode('wysiwyg');
  getEditor()?.commands.focus();
  destroySourceEditor();
}

export async function switchToWysiwyg() {
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
  if (!wysiwygEditor || !wrapper) return;

  // B4: Wait for all pending patches to be acked before switching
  const sessionState = getCoreSessionState();
  if (sessionState.isActive && isCoreBackedSourceModeEnabled()) {
    await switchCoreSourceToWysiwyg(wysiwygEditor, wrapper);
    return;
  }

  showToast('所见即所得模式需要 Core 会话，当前文档暂不能切换');
}

async function switchCoreSourceToWysiwyg(
  wysiwygEditor: HTMLElement,
  wrapper: HTMLElement,
): Promise<void> {
  const controller = getSourceSyncController();
  let revision = getCoreSessionState().confirmedRevision;
  try {
    revision = await controller.flush();
  } catch (err) {
    logDebug('editor.switch', 'Flush error during Core WYSIWYG switch', { error: String(err) });
    showToast('同步未完成，暂不能切换到所见即所得');
    return;
  }

  const markdown = getSourceContent();
  controller.detach();
  destroySourceEditor();

  const nextState = getCoreSessionState();
  const isReadOnly = store.getState().readOnly;
  const view = createCoreWysiwygEditor(
    wrapper,
    markdown,
    {
      getContext: () => {
        const state = getCoreSessionState();
        return {
          sessionId: state.sessionId,
          documentId: state.documentId,
          revision: state.confirmedRevision,
          largeDocument: state.sizeClass === 'large' || state.sizeClass === 'huge',
        };
      },
      onRevealSource: range => {
        const sourceView = view;
        sourceView.dispatch({
          selection: { anchor: range.start, head: range.end },
          scrollIntoView: true,
        });
        sourceView.focus();
      },
    },
    doc => {
      bumpRevision();
      store.setState({ dirty: normalizeImageMarkdown(doc) !== getDocumentState().lastPersistedMarkdown });
      scheduler.schedule('source-update', 50, () => {
        store.emit({ type: 'editor:update' });
      });
    },
    isReadOnly,
    update => {
      controller.processTransactions(update.transactions);
    },
  );

  controller.attach(view, nextState.confirmedRevision || revision);
  wysiwygEditor.hidden = true;
  wrapper.hidden = false;
  delete wrapper.dataset.coreLoading;
  wrapper.dataset.coreWysiwyg = 'true';
  wysiwygEngine = 'core-codemirror';
  setMode('wysiwyg');
  store.emit({ type: 'editor:update' });
  view.focus();
}

async function switchCoreWysiwygToSource(
  wysiwygEditor: HTMLElement,
  wrapper: HTMLElement,
): Promise<void> {
  const controller = getSourceSyncController();
  let revision = getCoreSessionState().confirmedRevision;
  try {
    revision = await controller.flush();
  } catch (err) {
    logDebug('editor.switch', 'Flush error during Core Source switch', { error: String(err) });
    showToast('同步未完成，暂不能切换到源码模式');
    return;
  }

  const markdown = getSourceContent();
  controller.detach();
  destroySourceEditor();

  const isReadOnly = store.getState().readOnly;
  const view = createSourceEditor(
    wrapper,
    markdown,
    doc => {
      bumpRevision();
      store.setState({ dirty: normalizeImageMarkdown(doc) !== getDocumentState().lastPersistedMarkdown });
      scheduler.schedule('source-update', 50, () => {
        store.emit({ type: 'editor:update' });
      });
    },
    isReadOnly,
    update => {
      controller.processTransactions(update.transactions);
    },
  );

  controller.attach(view, revision);
  wysiwygEditor.hidden = true;
  wrapper.hidden = false;
  delete wrapper.dataset.coreWysiwyg;
  wysiwygEngine = 'legacy-prosemirror';
  setMode('source');
  store.emit({ type: 'editor:update' });
  view.focus();
}

export { ensureContinuationParagraph } from './editor.continuation';

// ── Image settings (re-export for external use if needed) ──────────────

export { DEFAULT_IMAGE_SETTINGS } from './imageUtils';
