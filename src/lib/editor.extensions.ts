import { InputRule } from '@tiptap/core';
import type { Mark } from '@tiptap/pm/model';
import type { MarkdownSerializerState } from 'prosemirror-markdown';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { renderMermaid } from './mermaid';
import { showMermaidContextMenu } from '../components/mermaidContextMenu';
import { getMermaidExportBaseName } from './editor.state';

// ── Custom Link extension ──────────────────────────────────────────────

// Paste rules disabled and explicit [text](url) serialization
// (never <url> autolink syntax). See editor.ts for rationale.
export const CustomLink = Link.extend({
  addPasteRules() {
    return [];
  },
  addInputRules() {
    return [
      new InputRule({
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

// ── Block Image extension ──────────────────────────────────────────────

export const BlockImage = Image.extend({
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

// ── Mermaid code block extension ───────────────────────────────────────

const lowlight = createLowlight(common);

export function mermaidCodeBlockExtension() {
  return CodeBlockLowlight.configure({ lowlight }).extend({
    addStorage() {
      return {
        markdown: {
          serialize(state: any, node: any) {
            state.write("```" + (node.attrs.language || "") + "\n");
            state.text(node.textContent, false);
            state.ensureNewLine();
            state.write("```");
            state.closeBlock(node);
          },
          parse: {
            updateDOM(el: HTMLElement) {
              // markdown-it's fence parser always appends a trailing \n to fence
              // token content, causing code blocks to gain an extra empty line
              // when parsed into ProseMirror. Strip it here.
              el.querySelectorAll('pre code').forEach((code) => {
                if (code.textContent.endsWith('\n')) {
                  code.textContent = code.textContent.slice(0, -1);
                }
              });
            },
          },
        },
      };
    },
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
