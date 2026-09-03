import { InputRule } from '@tiptap/core';
import type { JSONContent, MarkdownParseHelpers, MarkdownRendererHelpers, MarkdownToken } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Table } from '@tiptap/extension-table';
import { common, createLowlight } from 'lowlight';
import { renderMermaid } from './mermaid';
import { renderPlantUml } from './plantuml';
import { isBlankPlantUmlSource } from './plantuml-lazy';
import { getCachedSettings } from './storage';
import { store } from './store';
import { logDebug, logException, logWarn } from './logger';
import { showMermaidContextMenu } from '../components/mermaidContextMenu';
import { showPlantumlContextMenu } from '../components/plantumlContextMenu';
import { getMermaidExportBaseName, getPlantUmlExportBaseName } from './editor.state';

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
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return helpers.applyMark('link', helpers.parseInline(token.tokens ?? []), {
      href: String(token.href ?? ''),
      title: token.title ? String(token.title) : null,
    });
  },
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
    const href = String(node.attrs?.href ?? '').replace(/[\(\)"]/g, '\\$&');
    const title = node.attrs?.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : '';
    return `[${helpers.renderChildren(node)}](${href}${title})`;
  },
});

// ── Block Image extension ──────────────────────────────────────────────

function escapeTableCellPipes(value: string): string {
  let escaped = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== '|') {
      escaped += character;
      continue;
    }

    let precedingBackslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
      precedingBackslashes += 1;
    }
    escaped += precedingBackslashes % 2 === 0 ? '\\|' : '|';
  }
  return escaped;
}

/**
 * TipTap 3.30.5 serializes a literal pipe in a table cell without escaping it.
 * On the next parse Marked treats that pipe as a column separator. Keep the
 * upstream table schema and commands, but make its Markdown renderer lossless.
 */
export const MarkdownSafeTable = Table.extend({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
    if (!node.content?.length) return '';

    const rows = node.content.map(row => (row.content ?? []).map(cell => {
      const parts = (cell.content ?? []).map(child => helpers.renderChildren(child));
      const text = escapeTableCellPipes(parts.join('\n'))
        .replace(/[ \t]*\r?\n[ \t]*/g, '<br>')
        .replace(/\s+/g, ' ')
        .trim();
      const align = cell.attrs?.align;
      return {
        text,
        isHeader: cell.type === 'tableHeader',
        align: align === 'left' || align === 'right' || align === 'center' ? align : null,
      };
    }));

    const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
    if (columnCount === 0) return '';

    const widths = Array.from({ length: columnCount }, (_, column) => Math.max(
      3,
      ...rows.map(row => row[column]?.text.length ?? 0),
    ));
    const pad = (value: string, width: number) => value + ' '.repeat(Math.max(0, width - value.length));
    const header = rows[0];
    const hasHeader = header.some(cell => cell.isHeader);
    const alignments = Array.from({ length: columnCount }, (_, column) =>
      rows.find(row => row[column]?.align)?.[column]?.align ?? null,
    );
    const headerTexts = Array.from({ length: columnCount }, (_, column) =>
      hasHeader ? header[column]?.text ?? '' : '',
    );

    let markdown = `\n| ${headerTexts.map((text, column) => pad(text, widths[column])).join(' | ')} |\n`;
    markdown += `| ${widths.map((width, column) => {
      const dashes = '-'.repeat(Math.max(3, width));
      if (alignments[column] === 'left') return `:${dashes}`;
      if (alignments[column] === 'right') return `${dashes}:`;
      if (alignments[column] === 'center') return `:${dashes}:`;
      return dashes;
    }).join(' | ')} |\n`;

    for (const row of hasHeader ? rows.slice(1) : rows) {
      markdown += `| ${Array.from({ length: columnCount }, (_, column) =>
        pad(row[column]?.text ?? '', widths[column])).join(' | ')} |\n`;
    }
    return markdown;
  },
});

export const BlockImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Resolver-only, node-local authored source. It survives ProseMirror
      // transactions but is intentionally absent from DOM and Markdown output
      // except as the value used by our renderer below.
      authoredSrc: {
        default: null,
        rendered: false,
        parseHTML: () => null,
      },
    };
  },
  renderMarkdown(node: JSONContent) {
    const src = String(node.attrs?.authoredSrc ?? node.attrs?.src ?? '').replace(/[()]/g, '\\$&');
    const alt = String(node.attrs?.alt ?? '').replace(/[\[\]]/g, '\\$&');
    const title = node.attrs?.title ? ` \"${String(node.attrs.title).replace(/\"/g, '\\\"')}\"` : '';
    return `![${alt}](${src}${title})`;
  },
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

/**
 * Serialize code block content using a fence that cannot be closed by its own
 * body.  The final separator newline is intentionally separate from the body,
 * which preserves 0..N authored trailing newlines.
 */
export function renderFencedCodeBlock(language: string, content: string): string {
  const longestBacktickRun = Math.max(0, ...Array.from(content.matchAll(/`+/g), match => match[0].length));
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1));
  return `${fence}${language}\n${content}\n${fence}`;
}

export function mermaidCodeBlockExtension() {
  return CodeBlockLowlight.configure({ lowlight }).extend({
    parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
      const raw = token.raw ?? '';
      if (!raw.startsWith('```') && !raw.startsWith('~~~') && token.codeBlockStyle !== 'indented') {
        return [];
      }
      const text = typeof token.text === 'string' ? token.text : '';
      return helpers.createNode(
        'codeBlock',
        { language: token.lang ? String(token.lang) : null },
        text ? [helpers.createTextNode(text)] : [],
      );
    },
    renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
      return renderFencedCodeBlock(
        String(node.attrs?.language ?? ''),
        node.content ? helpers.renderChildren(node.content) : '',
      );
    },
    addNodeView() {
      return ({ node, editor, getPos }) => {
        let currentNode = node;
        let isEditing = false;
        let draftSource = '';
        let renderVersion = 0;
        let destroyed = false;
        let renderedSvg = '';
        let plantUmlServerUrl = getCachedSettings().plantumlServerUrl.trim();

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
        const isPlantUml = () => ['plantuml', 'puml'].includes(getLanguage());
        // This local value is updated by settings:changed. It intentionally
        // drives the static contentDOM mode so a transition can recreate this
        // NodeView rather than leaving an editable DOM behind a preview.
        const isDiagram = () => isMermaid()
          || (isPlantUml() && Boolean(plantUmlServerUrl) && !isBlankPlantUmlSource(currentNode.textContent));
        const diagramName = () => isPlantUml() ? 'PlantUML' : 'Mermaid';

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
          previewEl.textContent = `正在渲染 ${diagramName()} 图表…`;
          try {
            const serverUrl = plantUmlServerUrl;
            const svg = isPlantUml()
              ? await renderPlantUml(serverUrl, code)
              : await renderMermaid(code);
            if (destroyed || version !== renderVersion || !previewEl) return;
            renderedSvg = svg;
            syncError('');
            previewEl.className = 'mermaid-preview';
            previewEl.innerHTML = svg;
            previewEl.title = `左键点击编辑 ${diagramName()} 源码`;
          } catch (error) {
            if (destroyed || version !== renderVersion || !previewEl) {
              logWarn('editor.diagram', 'Render result stale (cancelled by newer render)', { version, renderVersion, diagram: diagramName() });
              return;
            }
            renderedSvg = '';
            const message = error instanceof Error ? error.message : `${diagramName()} 渲染失败`;
            logException('editor.diagram', `渲染 ${diagramName()} 失败`, error, { serverUrl: plantUmlServerUrl, sourceLen: code.length, diagram: diagramName() });
            syncError('');
            previewEl.className = 'mermaid-preview is-error';
            previewEl.textContent = message;
            previewEl.title = `${diagramName()} 渲染失败，左键点击编辑源码`;
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
          previewEl.title = `左键点击编辑 ${diagramName()} 源码`;
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
            if (isMermaid()) {
              showMermaidContextMenu(event.clientX, event.clientY, {
                svg: renderedSvg,
                defaultName: getMermaidExportBaseName(),
              });
            } else {
              showPlantumlContextMenu(event.clientX, event.clientY, {
                svg: renderedSvg,
                defaultName: getPlantUmlExportBaseName(),
              });
            }
          });

          previewPanel.append(errorEl, previewEl);
          return previewPanel;
        };

        const render = () => {
          if (!isDiagram()) {
            setCodeBlock();
            return;
          }

          // Short-circuit blank PlantUML source — show code block, no network request.
          // Must be before the diagram path to avoid creating a non-interactive preview
          // when contentDOM is frozen as undefined at NodeView construction.
          if (isPlantUml() && isBlankPlantUmlSource(currentNode.textContent)) {
            logDebug('editor.diagram', 'Skipping blank PlantUML source', { diagram: diagramName() });
            setCodeBlock();
            return;
          }

          if (isPlantUml() && !plantUmlServerUrl) {
            logWarn('editor.diagram', 'PlantUML skipped — server URL not configured', { diagram: diagramName() });
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

        let requiresNodeViewRecreate = false;
        const handleSettingsChanged = (event: { settings: { plantumlServerUrl?: string } }) => {
          const nextUrl = event.settings.plantumlServerUrl?.trim() ?? '';
          if (nextUrl === plantUmlServerUrl) return;
          const wasDiagram = isDiagram();
          plantUmlServerUrl = nextUrl;
          if (!isPlantUml()) return;
          if (wasDiagram !== isDiagram()) {
            // `contentDOM` is fixed when a NodeView is constructed. A flip
            // must make update() return false so ProseMirror creates a fresh
            // view; rendering in place leaves a stale editable/non-editable
            // contract behind.
            requiresNodeViewRecreate = true;
            editor.view.dispatch(editor.view.state.tr);
          } else {
            render();
          }
        };
        store.on('settings:changed', handleSettingsChanged);

        return {
          dom,
          contentDOM: isDiagram() ? undefined : contentDOM || undefined,
          update(updatedNode) {
            if (updatedNode.type !== currentNode.type) return false;
            if (requiresNodeViewRecreate) {
              requiresNodeViewRecreate = false;
              return false;
            }
            const previousLanguage = getLanguage();
            const wasDiagram = isDiagram();
            currentNode = updatedNode;
            if (wasDiagram !== isDiagram()) return false;
            if (!isDiagram() && previousLanguage !== getLanguage()) return false;
            if (!isEditing) {
              draftSource = currentNode.textContent;
            }
            render();
            return true;
          },
          stopEvent(event) {
            return isDiagram() && dom.contains(event.target as Node);
          },
          ignoreMutation(mutation: any) {
            if (isDiagram()) return true;
            return !(contentDOM && (mutation.target === contentDOM || contentDOM.contains(mutation.target)));
          },
          destroy() {
            destroyed = true;
            renderVersion += 1;
            document.removeEventListener('mousedown', handleDocumentMouseDown);
            store.off('settings:changed', handleSettingsChanged);
          },
        };
      };
    },
  });
}
