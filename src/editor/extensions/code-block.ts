import type { JSONContent, MarkdownParseHelpers, MarkdownRendererHelpers, MarkdownToken } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { renderMermaid, renderPlantUml } from '../../render';
import { isBlankPlantUmlSource } from '../../utils/plantuml';
import { getCachedSettings } from '../../infra/storage';
import { store } from '../../infra/store';
import { logDebug, logException, logWarn } from '../../infra/logger';
import { uiPorts } from '../../infra/ui-ports';
import { getMermaidExportBaseName, getPlantUmlExportBaseName } from '../state';
import { buildCodeBlockToolbar, type CodeBlockToolbar } from './code-block-toolbar';
import { codeBlockHighlightPlugin } from './code-block-highlight';

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
    addProseMirrorPlugins() {
      // 丢弃 tiptap 自带 lowlight 装饰插件（plugin.key 前缀 'lowlight'，缺陷见
      // code-block-highlight.ts 头注），保留 CodeBlock 基类的 VSCode 粘贴插件。
      // plugin.key 是 prosemirror 运行时属性（d.ts 未声明）。
      const parentPlugins = this.parent?.call(this) ?? [];
      const kept = parentPlugins.filter(
        plugin => !(plugin as unknown as { key: string }).key.startsWith('lowlight'));
      return [...kept, codeBlockHighlightPlugin(this.name, lowlight)];
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
        let toolbar: CodeBlockToolbar | null = null;

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
          if (!toolbar) {
            toolbar = buildCodeBlockToolbar({
              getLanguage,
              getSource: () => currentNode.textContent,
              onCopy: (source) => {
                // 反馈已在工具条内先行展示；这里只负责尽力写入剪贴板。
                try {
                  navigator.clipboard.writeText(source).catch(() => {
                    logWarn('editor.codeBlock', 'Clipboard write rejected', { sourceLen: source.length });
                  });
                } catch {
                  logWarn('editor.codeBlock', 'Clipboard write failed', { sourceLen: source.length });
                }
              },
              onLanguageChange: (value) => {
                const pos = typeof getPos === 'function' ? getPos() : null;
                if (pos === null || pos === undefined) return;
                const next = value === '' ? null : value;
                if ((currentNode.attrs.language ?? null) === next) return;
                // setNodeMarkup 产生带 from/to 的 ReplaceAroundStep；attr 级 step 无法被
                // 装饰层按位置检测，切语言必须走节点级替换以触发重新高亮。
                editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { language: next }));
              },
            });
          }
          toolbar.syncLanguage(language);
          if (dom.firstChild !== codeBlockPreEl) {
            dom.replaceChildren(codeBlockPreEl, toolbar.el);
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
          textareaEl.addEventListener('markflow:commit-draft', () => applyMermaidSource(textareaEl!.value));
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
              uiPorts.showDiagramContextMenu(event.clientX, event.clientY, {
                svg: renderedSvg,
                defaultName: getMermaidExportBaseName(),
              });
            } else {
              uiPorts.showDiagramContextMenu(event.clientX, event.clientY, {
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
            if (isDiagram() && dom.contains(event.target as Node)) return true;
            // 工具条（含下拉输入）事件不得被 ProseMirror 捕获或落到 contentDOM。
            return toolbar?.containsTarget(event.target) ?? false;
          },
          ignoreMutation(mutation: any) {
            if (isDiagram()) return true;
            return !(contentDOM && (mutation.target === contentDOM || contentDOM.contains(mutation.target)));
          },
          destroy() {
            destroyed = true;
            renderVersion += 1;
            toolbar?.destroy();
            toolbar = null;
            document.removeEventListener('mousedown', handleDocumentMouseDown);
            store.off('settings:changed', handleSettingsChanged);
          },
        };
      };
    },
  });
}
