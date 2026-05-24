import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Markdown } from 'tiptap-markdown';
import { common, createLowlight } from 'lowlight';
import { pasteImageFile, imagePathToSrc, type ImageSettings } from './imageUtils';
import { renderMermaid } from './mermaid';
import { loadSettings } from './storage';
import { Plugin, PluginKey, Transaction } from '@tiptap/pm/state';
import { resolveImagePath } from './pathUtils';

const BlockImage = Image;

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
          previewEl.className = 'mermaid-preview is-rendering';
          previewEl.textContent = '正在渲染 Mermaid 图表…';
          try {
            const svg = await renderMermaid(code);
            if (destroyed || version !== renderVersion || !previewEl) return;
            syncError('');
            previewEl.className = 'mermaid-preview';
            previewEl.innerHTML = svg;
            previewEl.title = '左键点击编辑 Mermaid 源码';
          } catch (error) {
            if (destroyed || version !== renderVersion || !previewEl) return;
            const message = error instanceof Error ? error.message : 'Mermaid 渲染失败';
            syncError(message);
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
          ignoreMutation() {
            return isMermaid();
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
              if (!src || src.startsWith('http') || src.startsWith('data:')) return;
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
  let bubble: HTMLElement | null = null;

  function removeBubble() {
    bubble?.remove();
    bubble = null;
  }

  function showBubble(view: any, pos: number, node: any) {
    removeBubble();

    const dom = view.nodeDOM(pos) as HTMLElement;
    if (!dom) return;
    const img = dom.querySelector('img') || (dom.tagName === 'IMG' ? dom : null);
    if (!img) return;

    const rect = img.getBoundingClientRect();
    const editorRect = view.dom.closest('.editor-area')?.getBoundingClientRect();
    if (!editorRect) return;

    bubble = document.createElement('div');
    bubble.className = 'image-bubble';
    bubble.style.position = 'fixed';
    bubble.style.left = `${rect.left + rect.width / 2}px`;
    bubble.style.top = `${rect.top - 8}px`;
    bubble.style.transform = 'translate(-50%, -100%)';
    bubble.style.zIndex = '150';

    const currentSrc = node.attrs.src as string;
    const originalSrc = assetToOriginalMap.get(currentSrc) || currentSrc;

    const inputEl = document.createElement('input');
    inputEl.className = 'image-bubble-input';
    inputEl.value = originalSrc;
    inputEl.placeholder = '图片路径';
    inputEl.style.cssText = 'width:320px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:var(--font-code);color:var(--fg);background:var(--surface);outline:none;';
    inputEl.addEventListener('focus', () => { inputEl.style.borderColor = 'var(--accent)'; });
    inputEl.addEventListener('blur', () => { inputEl.style.borderColor = 'var(--border)'; });
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applySrc(view, pos, node, inputEl.value);
      }
      if (e.key === 'Escape') {
        removeBubble();
        view.focus();
      }
    });
    const btn = document.createElement('button');
    btn.textContent = '✓';
    btn.style.cssText = 'padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--accent);color:white;cursor:pointer;font-size:13px;';
    btn.addEventListener('click', () => applySrc(view, pos, node, inputEl.value));

    bubble.append(inputEl, btn);
    document.body.appendChild(bubble);

    requestAnimationFrame(() => inputEl.focus());
  }

  function applySrc(view: any, pos: number, node: any, newSrc: string) {
    if (!newSrc.trim()) return;
    const trimmed = newSrc.trim();
    const oldSrc = node.attrs.src as string;
    assetToOriginalMap.delete(oldSrc);
    if (trimmed.startsWith('http') || trimmed.startsWith('data:')) {
      const tr = view.state.tr;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: trimmed });
      view.dispatch(tr);
    } else {
      const docPath = getActiveDocPath();
      const absolutePath = docPath ? resolveImagePath(trimmed, docPath) : trimmed;
      const resolvedSrc = imagePathToSrc(absolutePath, null);
      assetToOriginalMap.set(resolvedSrc, trimmed);
      const tr = view.state.tr;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: resolvedSrc });
      view.dispatch(tr);
    }
    removeBubble();
    view.focus();
  }

  return Extension.create({
    name: 'imageBubble',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('image-bubble'),
          view() {
            document.addEventListener('mousedown', (e) => {
              if (bubble && !bubble.contains(e.target as Node)) {
                removeBubble();
              }
            });
            return {};
          },
          appendTransaction(_transactions, _oldState, newState) {
            const sel = newState.selection;
            const { $from } = sel;
            const node = $from.parent;
            if (node.type.name === 'image' && $from.parentOffset > 0) {
              return;
            }
            if (newState.selection.empty) {
              const nodeAtSel = newState.doc.nodeAt(sel.from);
              if (nodeAtSel?.type.name === 'image') {
                requestAnimationFrame(() => {
                  if (editor) showBubble(editor.view, sel.from, nodeAtSel);
                });
                return undefined;
              }
            }
            if (bubble) {
              requestAnimationFrame(() => removeBubble());
            }
            return undefined;
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
  return normalizeImageMarkdown(replaceAssetUrlsWithOriginal(editor.storage.markdown.getMarkdown()));
}

export function setMarkdown(content: string) {
  if (editor) {
    assetToOriginalMap.clear();
    const normalized = normalizeImageMarkdown(content);
    documentState.programmaticUpdate = true;
    editor.commands.setContent(normalized);
    if (mode === 'source') {
      const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement | null;
      if (sourceEditor) sourceEditor.value = normalized;
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
  editorDiv.innerHTML = '<div id="wysiwyg-editor"></div><textarea id="source-editor" class="source-editor" hidden></textarea>';
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
      Link.configure({
        openOnClick: false,
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
        transformCopiedText: true,
      }),
      imageSrcResolverPlugin(),
      imageBubblePlugin(),
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

  // Source editor sync
  const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement;
  if (sourceEditor) {
    sourceEditor.addEventListener('input', () => {
      if (mode === 'source') {
        documentState.dirty = getMarkdown() !== documentState.lastPersistedMarkdown;
      }
    });
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
        console.error('Image paste failed:', e);
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
        console.error('Image drop failed:', e);
      }
    }
  });

  // Image error handling via MutationObserver
  setupImageErrorHandling(editorEl);
}

export function switchToSource() {
  if (!editor) return;
  const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement;
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  if (!sourceEditor || !wysiwygEditor) return;

  sourceEditor.value = normalizeImageMarkdown(replaceAssetUrlsWithOriginal(editor.storage.markdown.getMarkdown()));
  wysiwygEditor.hidden = true;
  sourceEditor.hidden = false;
  mode = 'source';
}

export function switchToWysiwyg() {
  const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement;
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  if (!sourceEditor || !wysiwygEditor) return;

  if (editor) {
    editor.commands.setContent(normalizeImageMarkdown(sourceEditor.value));
  }
  wysiwygEditor.hidden = false;
  sourceEditor.hidden = true;
  mode = 'wysiwyg';
}

function getActiveDocPath(): string | null {
  const el = document.querySelector('.tree-file.active') as HTMLElement | null;
  return el?.dataset?.path || null;
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

function setupImageErrorHandling(container: HTMLElement) {
  const observer = new MutationObserver(() => {
    const imgs = container.querySelectorAll('img:not([data-error-bound])');
    imgs.forEach(el => {
      const img = el as HTMLImageElement;
      img.setAttribute('data-error-bound', 'true');
      img.addEventListener('error', () => {
        img.classList.add('image-error');
        img.style.display = 'none';
        if (!img.nextElementSibling?.classList.contains('image-error-overlay')) {
          const overlay = document.createElement('div');
          overlay.className = 'image-error-overlay';
          overlay.textContent = '图片加载失败';
          overlay.title = '点击重试';
          overlay.addEventListener('click', () => {
            const src = img.getAttribute('src');
            if (src) {
              img.removeAttribute('data-error-bound');
              img.classList.remove('image-error');
              img.style.display = '';
              const sep = src.includes('?') ? '&' : '?';
              img.src = `${src}${sep}_t=${Date.now()}`;
            }
            overlay.remove();
          });
          img.parentElement?.insertBefore(overlay, img.nextSibling);
        }
      });
      img.addEventListener('load', () => {
        img.classList.remove('image-error');
        img.style.display = '';
        const overlay = img.nextElementSibling;
        if (overlay?.classList.contains('image-error-overlay')) {
          overlay.remove();
        }
      });
    });
  });
  observer.observe(container, { childList: true, subtree: true });
}
