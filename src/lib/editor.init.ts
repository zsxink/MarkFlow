import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { BulletList, ListItem, ListKeymap, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import { Marked } from 'marked';
import type { marked as MarkedFunction } from 'marked';

import { copyLocalFileToStorage, imagePathToSrc, pasteImageFile, getImageSettings } from './imageUtils';
import type { ImageSettings } from '../types/image';
import { loadSettings } from './storage';
import { syncCodeLineNumberGutters } from './editor.helpers';
import { logException } from './logger';
import { createUrlDecorationPlugin } from './urlDecorationPlugin';
import { imageSrcResolverPlugin } from './editor.image.resolver';
import { imageBubblePlugin } from './editor.image.bubble';
import { tablePlugin } from './editor.table';
import { TableHandleView } from './editor.table-handles';
import { complexityLimitExtension } from './editor.complexity';

import {
  CustomLink,
  BlockImage,
  MarkdownSafeTable,
  SafeParagraph,
  mermaidCodeBlockExtension,
} from './editor.extensions';
import { OpaqueNode } from './editor.markdown.opaque.extension';
import { mountFrontmatterPanel } from '../components/frontmatterPanel';

import {
  setEditor,
  getEditor,
  getDocumentState,
  getMode,
  getActiveDocPath,
  assetToOriginalMap,
  bumpRevision,
  isProgrammaticUpdate,
} from './editor.state';
import { store } from './store';
import { scheduler } from './taskScheduler';
import { getSourceContent } from './editor.source';
import { normalizeImageMarkdown } from './editor.serializer';
import { serializeMarkdown } from './editor.markdown.bridge';
import { ensureContinuationParagraph } from './editor.continuation';
import { endOpaqueSession } from './editor.markdown.opaque.session';
import { katexPlugin } from './editor.katex';

/**
 * MarkFlow deliberately owns this parser instead of using Marked's module
 * singleton, so extension tokenizers and parse options cannot leak to other
 * consumers or tests.
 */
export const markflowMarked = new Marked({
  gfm: true,
  breaks: false,
});

/** Kept as a factory so each editor receives a v3 Markdown extension. */
export function createMarkdownExtension() {
  return Markdown.configure({
    // @tiptap/markdown accepts a Marked instance at runtime; its declaration
    // currently models the callable singleton rather than the Marked class.
    marked: markflowMarked as unknown as typeof MarkedFunction,
    markedOptions: {
      gfm: true,
      breaks: false,
    },
  });
}

export async function initEditor() {
  const container = document.getElementById('editor-area');
  if (!container) return;

  const editorDiv = document.createElement('div');
  editorDiv.className = 'editor-container';
  editorDiv.innerHTML = '<div id="wysiwyg-editor" data-testid="editor-wysiwyg"></div><div id="source-editor-wrapper" class="source-editor-wrapper" data-testid="editor-source" hidden></div>';
  container.appendChild(editorDiv);
  mountFrontmatterPanel(editorDiv);

  const editorEl = document.getElementById('wysiwyg-editor');
  if (!editorEl) return;

  setEditor(new Editor({
    element: editorEl,
    extensions: [
      StarterKit.configure({
        paragraph: false,
        codeBlock: false,
        link: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
      }),
      SafeParagraph,
      Placeholder.configure({
        placeholder: '开始写作 — 输入即所得',
      }),
      BulletList,
      OrderedList,
      ListItem,
      ListKeymap,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      MarkdownSafeTable.configure({
        resizable: true,
        View: TableHandleView,
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
      complexityLimitExtension(),
      mermaidCodeBlockExtension(),
      katexPlugin(),
      OpaqueNode,
      createMarkdownExtension(),
      imageSrcResolverPlugin(),
      imageBubblePlugin(),
      tablePlugin(),
      Extension.create({
        name: 'urlAutoDetect',
        addProseMirrorPlugins() {
          return [createUrlDecorationPlugin()];
        },
      }),
    ],
    content: '',
    onUpdate: ({ transaction, appendedTransactions }) => {
      scheduler.schedule('editor-update', 80, () => {
        store.emit({ type: 'editor:update' });
      });
      // setEditable also emits update, with an unchanged document. Such UI
      // updates must neither advance the revision nor replace a pending edit
      // check with a comparison of canonical Markdown against disk spelling.
      if (!transaction.docChanged && !appendedTransactions.some((tr) => tr.docChanged)) return;

      const mode = getMode();
      const serialized = mode === 'source' ? null : serializeMarkdown(getEditor()!);
      const currentMd = mode === 'source'
        ? normalizeImageMarkdown(getSourceContent())
        : serialized?.ok ? normalizeImageMarkdown(serialized.markdown) : null;
      // Snapshot the scoped guard while handling the transaction. A later
      // scheduler callback runs after the guard's finally block has restored
      // its depth, so querying it there would misclassify programmatic writes.
      const isUserUpdate = !isProgrammaticUpdate();

      // Revision is a correctness boundary (save/source switches can happen
      // before the deferred dirty comparison). Bump synchronously for the
      // transaction, while retaining the debounce for serialization work.
      if (isUserUpdate) bumpRevision();

      scheduler.schedule('dirty-check', 400, () => {
        if (currentMd !== null && isUserUpdate) {
          store.setState({ dirty: currentMd !== getDocumentState().lastPersistedMarkdown });
        }
      });
    },
    onSelectionUpdate: () => {
      // Selection changes need immediate dispatch (cursor position in status bar)
      store.emit({ type: 'editor:update' });
    },
    onDestroy: () => {
      // Task 7.6: tearing down the editor must drop the live opaque session so
      // its slots and nonce are never reused outside it.
      endOpaqueSession();
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
    root.classList.toggle('no-code-highlight', settings.codeHighlight === false);
    const enabled = settings.codeLineNumbers === true;
    syncCodeLineNumberGutters(root, enabled);
  }
  applyCodeBlockSettings();

  store.on('settings:changed', () => {
    applyCodeBlockSettings();
  });

  // Refresh line numbers on content change
  store.on('editor:update', () => {
    scheduler.schedule('line-numbers', 150, () => {
      const root = getEditor()?.view.dom;
      if (!root?.classList.contains('code-show-line-numbers')) return;
      syncCodeLineNumberGutters(root, true);
    });
  });

  const MAX_CONCURRENT_IMAGE_READS = 4;

  /** Process images concurrently but insert into editor sequentially */
  async function processImageFiles(
    files: File[],
    docPath: string | null,
    settings: ImageSettings,
    source: 'paste' | 'drop',
  ) {
    // Read all images concurrently (limited), insert sequentially
    const srcs: string[] = [];
    for (let i = 0; i < files.length; i += MAX_CONCURRENT_IMAGE_READS) {
      const batch = files.slice(i, i + MAX_CONCURRENT_IMAGE_READS);
      const results = await Promise.allSettled(
        batch.map(file => {
          const localPath = source === 'drop' ? (file as File & { path?: string }).path : undefined;
          return localPath
            ? copyLocalFileToStorage(localPath, docPath, settings)
            : pasteImageFile(file, docPath, settings);
        })
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === 'fulfilled') {
          srcs.push(r.value);
        } else {
          logException('editor.image', `Image ${source} failed`, r.reason, {
            source,
            fileName: batch[j].name,
          });
        }
      }
    }
    // Insert sequentially to avoid editor state conflicts
    for (const reference of srcs) {
      let src = reference;
      if (!/^(?:https?:|data:|asset:)/.test(reference)) {
        src = imagePathToSrc(reference, docPath);
        if (src !== reference) assetToOriginalMap.set(src, reference);
      }
      getEditor()?.chain().focus().setImage({ src, authoredSrc: reference } as any).run();
    }
    // Only create one continuation paragraph after all images are inserted
    if (srcs.length > 0) {
      ensureContinuationParagraph();
    }
  }

  // Image paste handler
  editorEl.addEventListener('paste', async (event) => {
    const files = Array.from(event.clipboardData?.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    event.preventDefault();
    const settings = await getImageSettings();
    const docPath = getActiveDocPath();
    await processImageFiles(imageFiles, docPath, settings, 'paste');
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
    await processImageFiles(imageFiles, docPath, settings, 'drop');
  });
}
