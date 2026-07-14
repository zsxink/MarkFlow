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
import { syncCodeLineNumberGutters } from './editor.helpers';
import { logException } from './logger';
import { createUrlDecorationPlugin } from './urlDecorationPlugin';
import { getImageSettings } from './imageUtils';
import { imageSrcResolverPlugin } from './editor.image.resolver';
import { imageBubblePlugin } from './editor.image.bubble';

import {
  CustomLink,
  BlockImage,
  mermaidCodeBlockExtension,
} from './editor.extensions';

import {
  setEditor,
  setDirtyCheckTimer,
  setUpdateEventTimer,
  getEditor,
  getDirtyCheckTimer,
  getUpdateEventTimer,
  getDocumentState,
  getMode,
  getActiveDocPath,
  bumpRevision,
} from './editor.state';
import { store } from './store';
import { getSourceContent } from './editor.source';
import { normalizeImageMarkdown, replaceAssetUrlsWithOriginal } from './editor.serializer';

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
      const currentMd = getMode() === 'source'
        ? normalizeImageMarkdown(getSourceContent())
        : normalizeImageMarkdown(replaceAssetUrlsWithOriginal(getEditor()!.storage.markdown.getMarkdown()));

      // Debounce dirty check — only matters when saving/switching files
      const t = getDirtyCheckTimer();
      if (t) clearTimeout(t);
      setDirtyCheckTimer(setTimeout(() => {
        setDirtyCheckTimer(null);
        if (!getDocumentState().programmaticUpdate) {
          bumpRevision();
          store.setState({ dirty: currentMd !== getDocumentState().lastPersistedMarkdown });
        }
      }, 400));

      // Throttle editor-update dispatch — outline/statusbar don't need per-keystroke refresh
      if (!getUpdateEventTimer()) {
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
    const root = getEditor()?.view.dom;
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
      const root = getEditor()?.view.dom;
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
        getEditor()?.chain().focus().setImage({ src }).run();
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
        getEditor()?.chain().focus().setImage({ src }).run();
      } catch (e) {
        logException('editor.image', 'Image drop failed', e, { source: 'drop', fileName: file.name });
      }
    }
  });
}
