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
import { imageSrcResolverPlugin, getImageSettings } from './editor.image.store';
import { imageBubblePlugin } from './editor.image.bubble';
import {
  normalizeImageMarkdown,
  replaceAssetUrlsWithOriginal,
  extractDocAsFallback,
} from './editor.serializer';

// Shared state
import {
  editor,
  mode,
  documentState,
  dirtyCheckTimer,
  updateEventTimer,
  cachedSourceGutterStyles,
  assetToOriginalMap,
  setEditor,
  setMode,
  setDirtyCheckTimer,
  setUpdateEventTimer,
  setCachedSourceGutterStyles,
  getEditor,
  getMode,
  isDocumentDirty,
  hasExternalModification,
  markExternalModification,
  setActiveDocumentPath,
  getActiveDocPath,
} from './editor.state';

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
  if (mode === 'source') {
    const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement | null;
    return normalizeImageMarkdown(sourceEditor?.value || '');
  }
  if (!editor) return '';
  const md = editor.storage.markdown.getMarkdown();
  return normalizeImageMarkdown(replaceAssetUrlsWithOriginal(md));
}

export function markDocumentPersisted(markdown: string) {
  documentState.lastPersistedMarkdown = normalizeImageMarkdown(markdown);
  documentState.dirty = false;
  documentState.externallyModified = false;
}

export function setMarkdown(content: string) {
  if (editor) {
    assetToOriginalMap.clear();
    const normalized = normalizeImageMarkdown(content);
    documentState.programmaticUpdate = true;
    editor.commands.setContent(normalized);
    if (mode === 'source') {
      const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement | null;
      if (sourceEditor) {
        sourceEditor.value = normalized;
        autoGrowSourceEditor();
      }
    }
    documentState.programmaticUpdate = false;
    markDocumentPersisted(normalized);
  }
}

// ── Source editor line numbers ────────────────────────────────────────

export function syncSourceEditorLineNumbers() {
  const gutter = document.getElementById('source-editor-gutter') as HTMLElement;
  const textarea = document.getElementById('source-editor') as HTMLTextAreaElement;
  if (!gutter || !textarea) return;

  let styles = cachedSourceGutterStyles;
  if (!styles) {
    const cs = getComputedStyle(textarea);
    styles = {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
    };
    setCachedSourceGutterStyles(styles);
  }
  gutter.style.fontFamily = styles.fontFamily;
  gutter.style.fontSize = styles.fontSize;
  gutter.style.lineHeight = styles.lineHeight;
  gutter.style.letterSpacing = styles.letterSpacing;

  const lines = textarea.value.split('\n');
  const cursorLine = textarea.value.substring(0, textarea.selectionStart).split('\n').length - 1;
  const total = lines.length;
  const lastLine = total;
  const interval = 10;
  const suppressThreshold = 4;
  const nearestIntervalToLast = Math.floor(lastLine / interval) * interval;
  const suppressLast = nearestIntervalToLast > 0 && (lastLine - nearestIntervalToLast) <= suppressThreshold;

  const numbers = lines.map((_, i) => {
    const num = i + 1;
    if (num === 1 || num === lastLine || i === cursorLine) return String(num);
    if (num % interval === 0 && !(suppressLast && num === nearestIntervalToLast)) return String(num);
    return '';
  });

  gutter.textContent = numbers.join('\n');
}

function autoGrowSourceEditor() {
  const textarea = document.getElementById('source-editor') as HTMLTextAreaElement;
  if (!textarea) return;
  const newHeight = textarea.scrollHeight;
  if (newHeight === textarea.offsetHeight) return;
  const area = textarea.closest('.editor-area') as HTMLElement | null;
  const prevScrollTop = area?.scrollTop ?? -1;
  textarea.style.height = 'auto';
  textarea.style.height = newHeight + 'px';
  // After collapse-grow cycle, restore scroll position to prevent visual jump
  if (area && prevScrollTop >= 0) area.scrollTop = prevScrollTop;
}

// ── Editor initialization ────────────────────────────────────────────

export async function initEditor() {
  const container = document.getElementById('editor-area');
  if (!container) return;

  const editorDiv = document.createElement('div');
  editorDiv.className = 'editor-container';
  editorDiv.innerHTML = '<div id="wysiwyg-editor"></div><div id="source-editor-wrapper" class="source-editor-wrapper" hidden><div class="source-editor-gutter" id="source-editor-gutter"></div><textarea id="source-editor" class="source-editor"></textarea></div>';
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
          documentState.dirty = getMarkdown() !== documentState.lastPersistedMarkdown;
        }
      }, 400));

      // Throttle editor-update dispatch — outline/statusbar don't need per-keystroke refresh
      if (!updateEventTimer) {
        setUpdateEventTimer(setTimeout(() => {
          setUpdateEventTimer(null);
          document.dispatchEvent(new Event('editor-update'));
        }, 80));
      }
    },
    onSelectionUpdate: () => {
      // Selection changes need immediate dispatch (cursor position in status bar)
      document.dispatchEvent(new Event('editor-update'));
    },
  }));

  // 编辑器创建后立即刷新状态栏，避免构造函数内统计函数因 editor 未赋值返回默认值
  document.dispatchEvent(new Event('editor-update'));

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

  document.addEventListener('settings-changed', () => {
    applyCodeBlockSettings();
  });

  // Refresh line numbers on content change
  let lineNumbersTimer: ReturnType<typeof setTimeout> | null = null;
  document.addEventListener('editor-update', () => {
    if (lineNumbersTimer) clearTimeout(lineNumbersTimer);
    lineNumbersTimer = setTimeout(() => {
      const root = editor?.view.dom;
      if (!root?.classList.contains('code-show-line-numbers')) return;
      syncCodeLineNumberGutters(root, true);
    }, 150);
  });

  // Source editor sync — consolidated handler with debounced line number sync
  const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement;
  const sourceGutter = document.getElementById('source-editor-gutter') as HTMLElement;
  if (sourceEditor && sourceGutter) {
    let lineNumTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleLineNumbers = () => {
      if (lineNumTimer) clearTimeout(lineNumTimer);
      lineNumTimer = setTimeout(() => {
        lineNumTimer = null;
        if (mode === 'source') {
          syncSourceEditorLineNumbers();
          document.dispatchEvent(new Event('editor-update'));
        }
      }, 50);
    };

    sourceEditor.addEventListener('input', () => {
      if (mode === 'source') {
        documentState.dirty = getMarkdown() !== documentState.lastPersistedMarkdown;
        autoGrowSourceEditor();
        scheduleLineNumbers();
      }
    });
    sourceEditor.addEventListener('click', scheduleLineNumbers);
    sourceEditor.addEventListener('keyup', scheduleLineNumbers);
    const ro = new ResizeObserver(scheduleLineNumbers);
    ro.observe(sourceEditor);
  }

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
  const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement;
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
  if (!sourceEditor || !wysiwygEditor || !wrapper) return;

  const rawMarkdown = replaceAssetUrlsWithOriginal(editor.storage.markdown.getMarkdown());
  const normalized = normalizeImageMarkdown(rawMarkdown);

  // Integrity check: detect serialization truncation before it reaches textarea
  const docText = editor.state.doc.textContent;
  const integrity = checkSerializationIntegrity(docText, normalized);

  if (integrity.truncated) {
    logException('editor.serialize', 'Markdown serialization integrity failure', undefined, {
      reason: integrity.reason,
      docLen: docText.length,
      mdLen: normalized.length,
    });
    showToast('Markdown 序列化异常，已保存全部内容');
    sourceEditor.value = normalizeImageMarkdown(extractDocAsFallback(editor.state.doc));
  } else {
    sourceEditor.value = normalized;
  }

  wysiwygEditor.hidden = true;
  wrapper.hidden = false;
  setMode('source');
  setCachedSourceGutterStyles(null); // Reset cache so styles are re-read in layout context
  syncSourceEditorLineNumbers();
  autoGrowSourceEditor();
}

export function switchToWysiwyg() {
  const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement;
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
  if (!sourceEditor || !wysiwygEditor || !wrapper) return;

  if (editor) {
    editor.commands.setContent(normalizeImageMarkdown(sourceEditor.value));
  }
  wysiwygEditor.hidden = false;
  wrapper.hidden = true;
  setMode('wysiwyg');
  document.dispatchEvent(new Event('editor-update'));
}

// ── Image settings (re-export for external use if needed) ──────────────

export { DEFAULT_IMAGE_SETTINGS } from './editor.image.store';
