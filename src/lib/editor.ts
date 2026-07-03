import { Editor, Extension, InputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import type { Mark } from '@tiptap/pm/model';
import type { MarkdownSerializerState } from 'prosemirror-markdown';

import Link from '@tiptap/extension-link';

// Custom Link extension with paste rules disabled and explicit
// [text](url) serialization (never <url> autolink syntax).
//
// The default Link.addPasteRules() has a markPasteRule that uses linkifyjs
// to auto-detect URLs in pasted text and add link marks — this bypasses
// linkOnPaste: false because it's a PasteRule, not the pasteHandler plugin.
//
// The default link mark serializer (prosemirror-markdown isPlainURL) outputs
// <url> when link text == href, which would modify the source file.
const CustomLink = Link.extend({
  addPasteRules() {
    return [];
  },
  addInputRules() {
    return [
      new InputRule({
        // Match [text](url) typed inline — the $ anchors to cursor position
        find: /\[([^\]]+)\]\(([^)]+)\)$/,
        handler({ state, range, match }) {
          const { tr } = state;
          const text = match[1];
          const url = match[2];
          const { from, to } = range;
          tr.replaceWith(from, to, state.schema.text(text));
          tr.addMark(from, from + text.length, state.schema.marks.link.create({ href: url }));
        },
      }),
    ];
  },
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: '[',
          close: (_state: MarkdownSerializerState, mark: Mark) => {
            const href = mark.attrs.href.replace(/[\(\)"]/g, '\\$&');
            const title = mark.attrs.title ? ` "${mark.attrs.title.replace(/"/g, '\\"')}"` : '';
            return `](${href}${title})`;
          },
          mixable: true,
        },
        parse: {},
      },
    };
  },
});
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Markdown } from 'tiptap-markdown';
import { common, createLowlight } from 'lowlight';
import { handleNetworkImage, pasteImageFile, imagePathToSrc, type ImageSettings } from './imageUtils';
import { renderMermaid } from './mermaid';
import { loadSettings } from './storage';
import { syncCodeLineNumberGutters } from './editor.helpers';

import { Plugin, PluginKey, Transaction } from '@tiptap/pm/state';
import { getFileName, resolveImagePath } from './pathUtils';
import { showMermaidContextMenu } from '../components/mermaidContextMenu';
import { showImageContextMenu } from '../components/imageContextMenu';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { logException } from './logger';
import { createUrlDecorationPlugin } from './urlDecorationPlugin';

const BlockImage = Image.extend({
  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const img = document.createElement('img');
      Object.entries(Image.options.HTMLAttributes).forEach(([key, value]) => {
        if (key === 'class') return;
        img.setAttribute(key, value as string);
      });
      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        if (value != null) img.setAttribute(key, value as string);
      });
      if (node.attrs.src) img.src = node.attrs.src;
      if (node.attrs.alt) img.alt = node.attrs.alt;

      const wrapper = document.createElement('span');
      wrapper.className = 'image-node-view';
      wrapper.appendChild(img);

      let errorEl: HTMLSpanElement | null = null;

      function showError() {
        if (errorEl) return;
        errorEl = document.createElement('span');
        errorEl.className = 'image-error-inline';
        errorEl.contentEditable = 'false';

        const icon = document.createElement('span');
        icon.className = 'image-error-icon';
        icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`;

        const label = document.createElement('span');
        label.className = 'image-error-label';
        label.textContent = '图片加载失败';

        errorEl.appendChild(icon);
        errorEl.appendChild(label);

        img.style.display = 'none';
        wrapper.appendChild(errorEl);
      }

      function hideError() {
        if (errorEl) {
          errorEl.remove();
          errorEl = null;
        }
        img.style.display = '';
        img.classList.remove('image-error');
      }

      img.addEventListener('error', showError);
      img.addEventListener('load', hideError);
      if (img.complete && img.naturalWidth === 0) showError();

      return {
        dom: wrapper,
        ignoreMutation: () => true,
        stopEvent: (e: Event) => {
          if (errorEl && (e.type === 'mousedown' || e.type === 'pointerdown')) {
            const target = e.target as Node;
            if (errorEl.contains(target)) {
              e.preventDefault();
              return true;
            }
          }
          return false;
        },
      };
    };
  },
});

const lowlight = createLowlight(common);

function mermaidCodeBlockExtension() {
  return CodeBlockLowlight.configure({ lowlight }).extend({
    addNodeView() {
      return ({ node, editor, getPos }) => {
        let currentNode = node;
        let isEditing = false;
        let draftSource = '';
        let renderVersion = 0;
        let destroyed = false;
        let renderedSvg = '';

        const dom = document.createElement('div');
        let contentDOM: HTMLElement | null = null;
        let codeBlockPreEl: HTMLPreElement | null = null;
        let codeBlockCodeEl: HTMLElement | null = null;
        let textareaEl: HTMLTextAreaElement | null = null;
        let previewPanel: HTMLDivElement | null = null;
        let previewEl: HTMLDivElement | null = null;
        let errorEl: HTMLDivElement | null = null;

        const getLanguage = () => String(currentNode.attrs.language || '').toLowerCase();
        const isMermaid = () => getLanguage() === 'mermaid';

        const setCodeBlock = () => {
          renderedSvg = '';
          dom.className = 'code-block-view';
          const language = getLanguage();
          if (!codeBlockPreEl || !codeBlockCodeEl) {
            codeBlockPreEl = document.createElement('pre');
            codeBlockCodeEl = document.createElement('code');
            codeBlockPreEl.appendChild(codeBlockCodeEl);
          }
          codeBlockCodeEl.className = 'hljs';
          if (language) codeBlockCodeEl.classList.add(`language-${language}`);
          contentDOM = codeBlockCodeEl;
          textareaEl = null;
          previewPanel = null;
          previewEl = null;
          errorEl = null;
          if (dom.firstChild !== codeBlockPreEl) {
            dom.replaceChildren(codeBlockPreEl);
          }
        };

        const syncError = (message: string) => {
          if (!errorEl) return;
          errorEl.hidden = !message;
          errorEl.textContent = message;
        };

        const renderPreview = async (code: string) => {
          if (!previewEl) return;
          const version = ++renderVersion;
          renderedSvg = '';
          previewEl.className = 'mermaid-preview is-rendering';
          previewEl.textContent = '正在渲染 Mermaid 图表…';
          try {
            const svg = await renderMermaid(code);
            if (destroyed || version !== renderVersion || !previewEl) return;
            renderedSvg = svg;
            syncError('');
            previewEl.className = 'mermaid-preview';
            previewEl.innerHTML = svg;
            previewEl.title = '左键点击编辑 Mermaid 源码';
          } catch (error) {
            if (destroyed || version !== renderVersion || !previewEl) return;
            renderedSvg = '';
            const message = error instanceof Error ? error.message : 'Mermaid 渲染失败';
            syncError('');
            previewEl.className = 'mermaid-preview is-error';
            previewEl.textContent = message;
            previewEl.title = 'Mermaid 渲染失败，左键点击编辑源码';
          }
        };

        const applyMermaidSource = (source: string) => {
          const pos = typeof getPos === 'function' ? getPos() : null;
          if (pos === null || pos === undefined) return;
          if (source !== currentNode.textContent) {
            const tr = editor.view.state.tr.insertText(source, pos + 1, pos + currentNode.nodeSize - 1);
            editor.view.dispatch(tr);
            currentNode = editor.view.state.doc.nodeAt(pos) || currentNode;
          }
          draftSource = currentNode.textContent;
          isEditing = false;
          render();
        };

        const cancelEditing = () => {
          draftSource = currentNode.textContent;
          isEditing = false;
          render();
        };

        const openEditor = () => {
          draftSource = currentNode.textContent;
          isEditing = true;
          render();
        };

        const hasDraftChanges = () => {
          const source = textareaEl?.value ?? draftSource;
          return source !== currentNode.textContent;
        };

        const handleDocumentMouseDown = (event: MouseEvent) => {
          if (!isEditing) return;
          const target = event.target;
          if (!(target instanceof Node) || dom.contains(target)) return;
          if (!hasDraftChanges()) {
            cancelEditing();
          }
        };

        document.addEventListener('mousedown', handleDocumentMouseDown);

        const createEditor = () => {
          const editorWrap = document.createElement('div');
          editorWrap.className = 'mermaid-popup';

          textareaEl = document.createElement('textarea');
          textareaEl.className = 'source-editor mermaid-popup-editor';
          textareaEl.value = draftSource;
          textareaEl.spellcheck = false;
          textareaEl.addEventListener('input', () => {
            if (textareaEl) draftSource = textareaEl.value;
          });
          textareaEl.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              applyMermaidSource(textareaEl!.value);
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelEditing();
            }
          });

          const actions = document.createElement('div');
          actions.className = 'mermaid-actions';

          const confirmButton = document.createElement('button');
          confirmButton.type = 'button';
          confirmButton.className = 'mermaid-action mermaid-confirm';
          confirmButton.textContent = '确认';
          confirmButton.addEventListener('click', () => applyMermaidSource(textareaEl!.value));

          const cancelButton = document.createElement('button');
          cancelButton.type = 'button';
          cancelButton.className = 'mermaid-action mermaid-cancel';
          cancelButton.textContent = '取消';
          cancelButton.addEventListener('click', cancelEditing);

          actions.append(confirmButton, cancelButton);
          editorWrap.append(textareaEl, actions);
          return editorWrap;
        };

        const createPreviewPanel = () => {
          previewPanel = document.createElement('div');
          previewPanel.className = 'mermaid-preview-panel';

          errorEl = document.createElement('div');
          errorEl.className = 'mermaid-error';
          errorEl.hidden = true;

          previewEl = document.createElement('div');
          previewEl.className = 'mermaid-preview is-rendering';
          previewEl.title = '左键点击编辑 Mermaid 源码';
          previewEl.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            if (!isEditing) {
              openEditor();
            }
          });
          previewEl.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!renderedSvg) return;
            showMermaidContextMenu(event.clientX, event.clientY, {
              svg: renderedSvg,
              defaultName: getMermaidExportBaseName(),
            });
          });

          previewPanel.append(errorEl, previewEl);
          return previewPanel;
        };

        const render = () => {
          if (!isMermaid()) {
            setCodeBlock();
            return;
          }

          dom.className = `mermaid-block${isEditing ? ' is-editor-open' : ''}`;
          contentDOM = null;

          const children: HTMLElement[] = [];
          if (isEditing) {
            children.push(createEditor());
          } else {
            textareaEl = null;
          }
          children.push(createPreviewPanel());
          dom.replaceChildren(...children);

          if (isEditing && textareaEl) {
            requestAnimationFrame(() => textareaEl?.focus());
          }

          void renderPreview(currentNode.textContent);
        };

        render();

        return {
          dom,
          contentDOM: isMermaid() ? undefined : contentDOM || undefined,
          update(updatedNode) {
            if (updatedNode.type !== currentNode.type) return false;
            const previousLanguage = getLanguage();
            const wasMermaid = isMermaid();
            currentNode = updatedNode;
            if (wasMermaid !== isMermaid()) return false;
            if (!isMermaid() && previousLanguage !== getLanguage()) return false;
            if (!isEditing) {
              draftSource = currentNode.textContent;
            }
            render();
            return true;
          },
          stopEvent(event) {
            return isMermaid() && dom.contains(event.target as Node);
          },
          ignoreMutation(mutation: any) {
            if (isMermaid()) return true;
            return !(contentDOM && (mutation.target === contentDOM || contentDOM.contains(mutation.target)));
          },
          destroy() {
            destroyed = true;
            renderVersion += 1;
            document.removeEventListener('mousedown', handleDocumentMouseDown);
          },
        };
      };
    },
  });
}

const assetToOriginalMap = new Map<string, string>();

// Holds the active document path when outside a workspace tree
let activeDocPathOverride: string | null = null;

const documentState = {
  dirty: false,
  externallyModified: false,
  programmaticUpdate: false,
  lastPersistedMarkdown: '',
};

function imageSrcResolverPlugin(): Extension {
  return Extension.create({
    name: 'imageSrcResolver',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('image-src-resolver'),
          appendTransaction(transactions, _oldState, newState) {
            const tr = transactions.find(t => t.docChanged);
            if (!tr) return;
            let imageTr: Transaction | null = null;
            newState.doc.descendants((node, pos) => {
              if (node.type.name !== 'image') return;
              const src = node.attrs.src as string;
              if (!src || src.startsWith('http') || src.startsWith('data:') || src.startsWith('asset:')) return;
              const docPath = getActiveDocPath();
              if (!docPath) return;
              const absolutePath = resolveImagePath(src, docPath);
              const newSrc = imagePathToSrc(absolutePath, null);
              if (newSrc !== src) {
                assetToOriginalMap.set(newSrc, src);
                if (!imageTr) imageTr = newState.tr;
                imageTr.setNodeMarkup(pos, undefined, { ...node.attrs, src: newSrc });
              }
            });
            return imageTr;
          },
        }),
      ];
    },
  });
}

function imageBubblePlugin(): Extension {
  let bubble: HTMLDivElement | null = null;
  let hasDraftChanges: (() => boolean) | null = null;

  function removeBubble() {
    bubble?.remove();
    bubble = null;
    hasDraftChanges = null;
  }

  function getOriginalSrc(src: string) {
    return assetToOriginalMap.get(src) || src;
  }

  function getImageInfoFromTarget(view: any, target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return null;
    let img = target.closest('img') as HTMLImageElement | null;
    if (!img) {
      const wrapper = target.closest('.image-node-view');
      if (wrapper) img = wrapper.querySelector('img');
    }
    if (!img) return null;
    const basePos = view.posAtDOM(img, 0);
    const candidates = [basePos, basePos - 1, basePos + 1].filter((value, index, array) => value >= 0 && array.indexOf(value) === index);
    for (const pos of candidates) {
      const node = view.state.doc.nodeAt(pos);
      if (node?.type.name === 'image') {
        return { img, node, pos };
      }
    }
    return null;
  }

  async function applyImageChanges(view: any, pos: number, node: any, caption: string, pathValue: string) {
    const trimmedPath = pathValue.trim();
    if (!trimmedPath) return;

    const oldSrc = node.attrs.src as string;

    let nextSrc = trimmedPath;
    let nextOriginalSrc: string | null = null;
    if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
      const settings = await getImageSettings();
      const docPath = getActiveDocPath();
      const savedPath = await handleNetworkImage(trimmedPath, docPath, settings);
      if (savedPath.startsWith('http://') || savedPath.startsWith('https://') || savedPath.startsWith('data:')) {
        nextSrc = savedPath;
      } else {
        const absolutePath = docPath ? resolveImagePath(savedPath, docPath) : savedPath;
        nextSrc = imagePathToSrc(absolutePath, null);
        nextOriginalSrc = savedPath;
      }
    } else if (!trimmedPath.startsWith('data:')) {
      const docPath = getActiveDocPath();
      const absolutePath = docPath ? resolveImagePath(trimmedPath, docPath) : trimmedPath;
      nextSrc = imagePathToSrc(absolutePath, null);
      nextOriginalSrc = trimmedPath;
    }

    if (oldSrc !== nextSrc) {
      assetToOriginalMap.delete(oldSrc);
    }
    if (nextOriginalSrc && nextOriginalSrc !== nextSrc) {
      assetToOriginalMap.set(nextSrc, nextOriginalSrc);
    } else {
      assetToOriginalMap.delete(nextSrc);
    }

    const tr = view.state.tr;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      src: nextSrc,
      alt: caption.trim() || null,
    });
    view.dispatch(tr);
    removeBubble();
    view.focus();
  }

  function showBubble(view: any, pos: number, node: any) {
    removeBubble();

    const dom = view.nodeDOM(pos) as HTMLElement | null;
    if (!dom) return;
    const img = dom.querySelector('img') || (dom.tagName === 'IMG' ? dom : null);
    if (!img) return;

    const rect = img.offsetHeight > 0 ? img.getBoundingClientRect() : dom.getBoundingClientRect();
    bubble = document.createElement('div');
    bubble.className = 'image-bubble image-edit-panel';
    bubble.style.position = 'fixed';
    bubble.style.left = `${rect.left + rect.width / 2}px`;
    bubble.style.top = `${rect.top - 12}px`;
    bubble.style.transform = 'translate(-50%, -100%)';
    bubble.style.zIndex = '150';

    const currentSrc = node.attrs.src as string;
    const originalSrc = getOriginalSrc(currentSrc);
    const originalAlt = String(node.attrs.alt || '');

    const row1 = document.createElement('div');
    row1.className = 'image-edit-row image-edit-fields';

    const captionLabel = document.createElement('label');
    captionLabel.className = 'image-edit-label';
    captionLabel.textContent = '图片注释';

    const captionInput = document.createElement('input');
    captionInput.className = 'image-edit-input';
    captionInput.value = originalAlt;
    captionInput.placeholder = '输入图片注释';

    const pathLabel = document.createElement('label');
    pathLabel.className = 'image-edit-label';
    pathLabel.textContent = '路径';

    const pathInput = document.createElement('input');
    pathInput.className = 'image-edit-input image-edit-path-input';
    pathInput.value = originalSrc;
    pathInput.placeholder = '输入图片路径或 URL';

    captionLabel.appendChild(captionInput);
    pathLabel.appendChild(pathInput);
    row1.append(captionLabel, pathLabel);

    const row2 = document.createElement('div');
    row2.className = 'image-edit-row image-edit-actions';

    const chooseButton = document.createElement('button');
    chooseButton.type = 'button';
    chooseButton.className = 'image-edit-action';
    chooseButton.textContent = '选择';
    chooseButton.addEventListener('click', async () => {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }],
      });
      if (typeof selected === 'string') {
        pathInput.value = selected;
      }
    });

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'image-edit-action image-edit-confirm';
    confirmButton.textContent = '确认';
    confirmButton.addEventListener('click', async () => {
      await applyImageChanges(view, pos, node, captionInput.value, pathInput.value);
    });

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'image-edit-action';
    cancelButton.textContent = '取消';
    cancelButton.addEventListener('click', () => {
      removeBubble();
      view.focus();
    });

    row2.append(chooseButton, confirmButton, cancelButton);
    bubble.append(row1, row2);
    document.body.appendChild(bubble);

    hasDraftChanges = () => {
      return captionInput.value !== originalAlt || pathInput.value.trim() !== originalSrc;
    };

    requestAnimationFrame(() => captionInput.focus());
  }

  return Extension.create({
    name: 'imageBubble',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('image-bubble'),
          view() {
            const handleMouseDown = (event: MouseEvent) => {
              const target = event.target;
              if (bubble && target instanceof Node && !bubble.contains(target) && !hasDraftChanges?.()) {
                removeBubble();
              }
            };
            const handleKeyDown = (event: KeyboardEvent) => {
              if (event.key === 'Escape' && bubble) {
                removeBubble();
              }
            };
            document.addEventListener('mousedown', handleMouseDown);
            document.addEventListener('keydown', handleKeyDown);
            return {
              destroy() {
                document.removeEventListener('mousedown', handleMouseDown);
                document.removeEventListener('keydown', handleKeyDown);
                removeBubble();
              },
            };
          },
          props: {
            handleDOMEvents: {
              click(view, event) {
                if (event.button !== 0) return false;
                const imageInfo = getImageInfoFromTarget(view, event.target);
                if (!imageInfo) return false;
                event.preventDefault();
                event.stopPropagation();
                showBubble(view, imageInfo.pos, imageInfo.node);
                return true;
              },
              contextmenu(view, event) {
                const imageInfo = getImageInfoFromTarget(view, event.target);
                if (!imageInfo) return false;
                if (imageInfo.img.style.display === 'none') return false;
                event.preventDefault();
                event.stopPropagation();
                const currentSrc = imageInfo.node.attrs.src as string;
                showImageContextMenu(event.clientX, event.clientY, {
                  src: currentSrc,
                  originalSrc: getOriginalSrc(currentSrc),
                  docPath: getActiveDocPath(),
                });
                return true;
              },
            },
          },
        }),
      ];
    },
  });
}

let editor: Editor | null = null;
let mode: 'wysiwyg' | 'source' = 'wysiwyg';

export function getEditor(): Editor | null {
  return editor;
}

export function getMode() {
  return mode;
}

export function setMode(newMode: 'wysiwyg' | 'source') {
  mode = newMode;
}

export function isDocumentDirty() {
  return documentState.dirty;
}

export function hasExternalModification() {
  return documentState.externallyModified;
}

export function markExternalModification() {
  documentState.externallyModified = true;
}

export function markDocumentPersisted(markdown: string) {
  documentState.lastPersistedMarkdown = normalizeImageMarkdown(markdown);
  documentState.dirty = false;
  documentState.externallyModified = false;
}

function replaceAssetUrlsWithOriginal(markdown: string): string {
  let result = markdown;
  for (const [asset, original] of assetToOriginalMap) {
    result = result.split(asset).join(original);
  }
  return result;
}

// Repair legacy corruption where heading was glued after image.
function fixCorruptedImageNewlines(markdown: string): string {
  let result = markdown;
  // ![](x)\## H2  -> ![](x)\n\n## H2
  result = result.replace(/(^\s*!\[[^\]]*\]\([^\n)]*\))\s*\\\s*(#{1,6}\s+)/gm, '$1\n\n$2');
  // ![](x)## H2   -> ![](x)\n\n## H2
  result = result.replace(/(^\s*!\[[^\]]*\]\([^\n)]*\))\s*(#{1,6}\s+)/gm, '$1\n\n$2');
  return result;
}

// Normalize standalone image blocks: image on its own line, blank line before and after.
function fixImageNewlines(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const out: string[] = [];
  const isStandaloneImage = (line: string) => /^\s*!\[[^\]]*\]\([^\n)]*\)\s*$/.test(line);

  for (const line of lines) {
    if (isStandaloneImage(line)) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      out.push(line.trim());
      out.push('');
      continue;
    }
    out.push(line);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function normalizeImageMarkdown(markdown: string): string {
  return fixImageNewlines(fixCorruptedImageNewlines(markdown));
}

export function getMarkdown(): string {
  if (mode === 'source') {
    const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement | null;
    return normalizeImageMarkdown(sourceEditor?.value || '');
  }
  if (!editor) return '';
  const md = editor.storage.markdown.getMarkdown();
  return normalizeImageMarkdown(replaceAssetUrlsWithOriginal(md));
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

export function getWordCount(): number {
  if (!editor) return 0;
  const text = editor.state.doc.textContent;
  if (!text) return 0;
  const cjkChars = (text.match(/[\u4e00-\u9fa5\u3400-\u4dbf]/g) || []).length;
  const nonCjkText = text.replace(/[\u4e00-\u9fa5\u3400-\u4dbf]/g, '');
  const nonCjkWords = nonCjkText.split(/\s+/).filter(Boolean).length;
  return cjkChars + nonCjkWords;
}

export function getLineCount(): number {
  if (!editor) return 0;
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.isBlock) count++;
  });
  return Math.max(count, 1);
}

export function getCursorPos(): { line: number; col: number } {
  if (!editor) return { line: 1, col: 1 };
  const { from } = editor.state.selection;
  const doc = editor.state.doc;
  let line = 1;
  let blockStart = 0;
  doc.descendants((node, nodePos) => {
    if (nodePos > from) return false;
    if (node.isBlock && nodePos >= blockStart) {
      if (nodePos > blockStart) line++;
      blockStart = nodePos;
    }
    return true;
  });
  return { line, col: from - blockStart + 1 };
}

export async function initEditor() {
  const container = document.getElementById('editor-area');
  if (!container) return;

  const editorDiv = document.createElement('div');
  editorDiv.className = 'editor-container';
  editorDiv.innerHTML = '<div id="wysiwyg-editor"></div><div id="source-editor-wrapper" class="source-editor-wrapper" hidden><div class="source-editor-gutter" id="source-editor-gutter"></div><textarea id="source-editor" class="source-editor"></textarea></div>';
  container.appendChild(editorDiv);

  const editorEl = document.getElementById('wysiwyg-editor');
  if (!editorEl) return;

  editor = new Editor({
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
        autolink: false,        // 打字不自动加 link mark
        linkOnPaste: false,     // 粘贴不自动加 link mark
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
      if (!documentState.programmaticUpdate) {
        documentState.dirty = getMarkdown() !== documentState.lastPersistedMarkdown;
      }
      document.dispatchEvent(new Event('editor-update'));
    },
    onSelectionUpdate: () => {
      document.dispatchEvent(new Event('editor-update'));
    },
  });

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
    }, 300);
  });

  // Source editor sync
  const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement;
  const sourceGutter = document.getElementById('source-editor-gutter') as HTMLElement;
  if (sourceEditor && sourceGutter) {
    const refreshSourceNumbers = () => {
      if (mode === 'source') syncSourceEditorLineNumbers();
    };
    sourceEditor.addEventListener('input', () => {
      if (mode === 'source') {
        documentState.dirty = getMarkdown() !== documentState.lastPersistedMarkdown;
        syncSourceEditorLineNumbers();
        autoGrowSourceEditor();
      }
    });
    sourceEditor.addEventListener('click', refreshSourceNumbers);
    sourceEditor.addEventListener('keyup', refreshSourceNumbers);
    const ro = new ResizeObserver(refreshSourceNumbers);
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

export function syncSourceEditorLineNumbers() {
  const gutter = document.getElementById('source-editor-gutter') as HTMLElement;
  const textarea = document.getElementById('source-editor') as HTMLTextAreaElement;
  if (!gutter || !textarea) return;

  const cs = getComputedStyle(textarea);
  gutter.style.fontFamily = cs.fontFamily;
  gutter.style.fontSize = cs.fontSize;
  gutter.style.lineHeight = cs.lineHeight;
  gutter.style.letterSpacing = cs.letterSpacing;

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
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

export function switchToSource() {
  if (!editor) return;
  const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement;
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
  if (!sourceEditor || !wysiwygEditor || !wrapper) return;

  sourceEditor.value = normalizeImageMarkdown(replaceAssetUrlsWithOriginal(editor.storage.markdown.getMarkdown()));
  wysiwygEditor.hidden = true;
  wrapper.hidden = false;
  mode = 'source';
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
  mode = 'wysiwyg';
}

function getActiveDocPath(): string | null {
  const el = document.querySelector('.tree-file.active') as HTMLElement | null;
  return el?.dataset?.path || activeDocPathOverride;
}

export function setActiveDocumentPath(path: string | null) {
  activeDocPathOverride = path;
}

function getMermaidExportBaseName() {
  const activeDocPath = getActiveDocPath();
  if (!activeDocPath) return 'mermaid-diagram';
  const fileName = getFileName(activeDocPath);
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${baseName || 'mermaid-diagram'}-mermaid`;
}

const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  storageMode: 'workspace-assets',
  customPath: '',
  preferRelative: true,
  autoCopyLocal: true,
  downloadNetwork: false,
  namingStrategy: 'timestamp',
};

async function getImageSettings(): Promise<ImageSettings> {
  try {
    const s = await loadSettings() as Record<string, unknown>;
    return {
      storageMode: (s.imageStorageMode as string) || DEFAULT_IMAGE_SETTINGS.storageMode,
      customPath: (s.imageCustomPath as string) || DEFAULT_IMAGE_SETTINGS.customPath,
      preferRelative: s.imagePreferRelative !== false,
      autoCopyLocal: s.imageAutoCopyLocal !== false,
      downloadNetwork: s.imageDownloadNetwork === true,
      namingStrategy: (s.imageNamingStrategy as string) || DEFAULT_IMAGE_SETTINGS.namingStrategy,
    };
  } catch {
    return DEFAULT_IMAGE_SETTINGS;
  }
}

