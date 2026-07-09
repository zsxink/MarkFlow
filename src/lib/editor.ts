import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Markdown } from 'tiptap-markdown';

import { pasteImageFile } from './imageUtils';
import { loadSettings } from './storage';
import { syncCodeLineNumberGutters, checkSerializationIntegrity } from './editor.helpers';
import { showToast } from '../components/toast';
import { logException } from './logger';
import { createUrlDecorationPlugin } from './urlDecorationPlugin';

// Sub-module imports
import {
  CustomLink,
  BlockImage,
  mermaidCodeBlockExtension,
} from './editor.extensions';
import { imageSrcResolverPlugin } from './editor.image.resolver';
import { getImageSettings } from './imageUtils';
import { imageBubblePlugin } from './editor.image.bubble';
import {
  normalizeImageMarkdown,
  replaceAssetUrlsWithOriginal,
  extractDocAsFallback,
} from './editor.serializer';

// Shared state
import {
  editor,
  documentState,
  dirtyCheckTimer,
  updateEventTimer,
  assetToOriginalMap,
  setEditor,
  setMode,
  setDirtyCheckTimer,
  setUpdateEventTimer,
  getEditor,
  getMode,
  isDocumentDirty,
  hasExternalModification,
  markExternalModification,
  setActiveDocumentPath,
  getActiveDocPath,
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
};
export { getWordCount, getLineCount, getCursorPos } from './editor.stats';

// ── Markdown serialization ────────────────────────────────────────────

export function getMarkdown(): string {
  if (getMode() === 'source') {
    return normalizeImageMarkdown(getSourceContent());
  }
  if (!editor) return '';
  const md = editor.storage.markdown.getMarkdown();
  return normalizeImageMarkdown(replaceAssetUrlsWithOriginal(md));
}

export function markDocumentPersisted(markdown: string) {
  documentState.lastPersistedMarkdown = normalizeImageMarkdown(markdown);
  store.setState({ dirty: false });
  documentState.externallyModified = false;
}

export function setMarkdown(content: string) {
  if (editor) {
    assetToOriginalMap.clear();
    const normalized = normalizeImageMarkdown(content);
    documentState.programmaticUpdate = true;
    editor.commands.setContent(normalized);
    if (getMode() === 'source') {
      setSourceContent(normalized);
    }
    documentState.programmaticUpdate = false;
    markDocumentPersisted(normalized);
  }
}

// ── Editor initialization ────────────────────────────────────────────

export async function initEditor() {
  const container = document.getElementById('editor-area');
  if (!container) return;

  const editorDiv = document.createElement('div');
  editorDiv.className = 'editor-container';
  editorDiv.innerHTML = '<div id="wysiwyg-editor"></div><div id="source-editor-wrapper" class="source-editor-wrapper" hidden></div>';
  container.appendChild(editorDiv);

  const editorEl = document.getElementById('wysiwyg-editor');
  if (!editorEl) return;

  setEditor(new Editor({
    element: editorEl,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: '开始写作 — 输入即所得',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      CustomLink.configure({
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
      }),
      BlockImage.configure({
        allowBase64: true,
        HTMLAttributes: {
          loading: 'lazy',
        },
      }),
      mermaidCodeBlockExtension(),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: '-',
        transformPastedText: true,
        transformCopiedText: false,
      }),
      imageSrcResolverPlugin(),
      imageBubblePlugin(),
      Extension.create({
        name: 'urlAutoDetect',
        addProseMirrorPlugins() {
          return [createUrlDecorationPlugin()];
        },
      }),
    ],
    content: '',
    onUpdate: () => {
      // Debounce dirty check — only matters when saving/switching files
      if (dirtyCheckTimer) clearTimeout(dirtyCheckTimer);
      setDirtyCheckTimer(setTimeout(() => {
        setDirtyCheckTimer(null);
        if (!documentState.programmaticUpdate) {
          store.setState({ dirty: getMarkdown() !== documentState.lastPersistedMarkdown });
        }
      }, 400));

      // Throttle editor-update dispatch — outline/statusbar don't need per-keystroke refresh
      if (!updateEventTimer) {
        setUpdateEventTimer(setTimeout(() => {
          setUpdateEventTimer(null);
          store.emit({ type: 'editor:update' });
        }, 80));
      }
    },
    onSelectionUpdate: () => {
      // Selection changes need immediate dispatch (cursor position in status bar)
      store.emit({ type: 'editor:update' });
    },
  }));

  // 编辑器创建后立即刷新状态栏，避免构造函数内统计函数因 editor 未赋值返回默认值
  store.emit({ type: 'editor:update' });

  // Apply code block settings (line numbers & word wrap)
  async function applyCodeBlockSettings() {
    const settings = await loadSettings();
    const root = editor?.view.dom;
    if (!root) return;
    root.classList.toggle('code-no-word-wrap', settings.codeWordWrap === false);
    const enabled = settings.codeLineNumbers === true;
    syncCodeLineNumberGutters(root, enabled);
  }
  applyCodeBlockSettings();

  store.on('settings:changed', () => {
    applyCodeBlockSettings();
  });

  // Refresh line numbers on content change
  let lineNumbersTimer: ReturnType<typeof setTimeout> | null = null;
  store.on('editor:update', () => {
    if (lineNumbersTimer) clearTimeout(lineNumbersTimer);
    lineNumbersTimer = setTimeout(() => {
      const root = editor?.view.dom;
      if (!root?.classList.contains('code-show-line-numbers')) return;
      syncCodeLineNumberGutters(root, true);
    }, 150);
  });

  // Image paste handler
  editorEl.addEventListener('paste', async (event) => {
    const files = Array.from(event.clipboardData?.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    event.preventDefault();
    const settings = await getImageSettings();
    const docPath = getActiveDocPath();
    for (const file of imageFiles) {
      try {
        const src = await pasteImageFile(file, docPath, settings);
        editor?.chain().focus().setImage({ src }).run();
      } catch (e) {
        logException('editor.image', 'Image paste failed', e, { source: 'paste', fileName: file.name });
      }
    }
  });

  // Image drop handler
  editorEl.addEventListener('drop', async (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    const imageFiles = files.filter(f => {
      if (f.type.startsWith('image/')) return true;
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '');
    });
    if (imageFiles.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const settings = await getImageSettings();
    const docPath = getActiveDocPath();
    for (const file of imageFiles) {
      try {
        const src = await pasteImageFile(file, docPath, settings);
        editor?.chain().focus().setImage({ src }).run();
      } catch (e) {
        logException('editor.image', 'Image drop failed', e, { source: 'drop', fileName: file.name });
      }
    }
  });
}

// ── Mode switching ────────────────────────────────────────────────────

export function switchToSource() {
  if (!editor) return;
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  if (!wysiwygEditor || !wrapper) return;

  const rawMarkdown = replaceAssetUrlsWithOriginal(editor.storage.markdown.getMarkdown());
  const normalized = normalizeImageMarkdown(rawMarkdown);

  // Determine the content to populate CM6 with
  let content: string;
  const docText = editor.state.doc.textContent;
  const integrity = checkSerializationIntegrity(docText, normalized);

  if (integrity.truncated) {
    logException('editor.serialize', 'Markdown serialization integrity failure', undefined, {
      reason: integrity.reason,
      docLen: docText.length,
      mdLen: normalized.length,
    });
    showToast('Markdown 序列化异常，已保存全部内容');
    content = normalizeImageMarkdown(extractDocAsFallback(editor.state.doc));
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
    store.setState({ dirty: normalizeImageMarkdown(doc) !== documentState.lastPersistedMarkdown });
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
    if (editor) {
      documentState.programmaticUpdate = true;
      editor.commands.setContent(normalizeImageMarkdown(getSourceContent()));
    }
  } finally {
    documentState.programmaticUpdate = false;
    wysiwygEditor.hidden = false;
    wrapper.hidden = true;
    destroySourceEditor();
    setMode('wysiwyg');
    editor?.commands.focus();
    // Immediate refresh so outline/statusbar show WYSIWYG data right away
    store.emit({ type: 'editor:update' });
  }
}

// ── Image settings (re-export for external use if needed) ──────────────

export { DEFAULT_IMAGE_SETTINGS } from './imageUtils';
