// ── Block math node (issue #417) ────────────────────────────────────────
//
// A line-leading `$$..$$` block (multi-line content, e.g. `\begin{align}`
// environments) cannot live in the text flow any more: since #404 in-paragraph
// soft newlines are separate hardBreak nodes, so the per-text-node KaTeX
// decoration scanner never sees a complete delimiter pair — and the marked /
// serializer pipeline rewrites the LaTeX (eats `\\` line breaks, escapes `&`).
//
// This atom node lifts the whole block out of the text flow: marked's block
// tokenizer hands over the raw span, the LaTeX is stored verbatim in the
// `latex` attribute — never inline-parsed, never text-escaped on serialize —
// and a NodeView renders it with KaTeX and offers a source editor on click.

import { Node, mergeAttributes } from '@tiptap/core';
import type { JSONContent, MarkdownToken } from '@tiptap/core';
import { renderKatex } from '../../render';

export const MATH_BLOCK_NODE_NAME = 'mathBlock';

/** Marked token type emitted by the tokenizer (== `markdownTokenName`). */
export const MATH_BLOCK_TOKEN_NAME = 'markflow-math-block';

/** Marked never matches: an anchored scan with no line-leading `$$` opener. */
const NO_MATCH = -1;

const MATH_BLOCK_RE = /^[ \t]{0,3}\$\$((?:[^$]|\$(?!\$))*?)\$\$/;

/**
 * Canonical `$$..$$` spelling for serialization. Content with newlines gets
 * delimiters on their own lines; single-line content keeps them attached.
 * Both forms trim only the outer edges, so re-parsing is idempotent and the
 * admission semantic fingerprint stays stable.
 */
function renderMathBlockMarkdown(latex: string): string {
  return latex.includes('\n') ? `$$\n${latex}\n$$` : `$$${latex}$$`;
}

function latexOf(node: { attrs?: { latex?: unknown } }): string {
  return String(node.attrs?.latex ?? '');
}

export const MathBlock = Node.create({
  name: MATH_BLOCK_NODE_NAME,
  markdownTokenName: MATH_BLOCK_TOKEN_NAME,

  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      // Authored content: it participates in the semantic fingerprint and is
      // never stripped as runtime state.
      latex: { default: '' },
    };
  },

  // `start` is Marked's lookahead: jump to the first line-leading `$$` (a
  // negative index tells Marked this tokenizer can never start). In
  // `tokenize`, `src` is the remaining tail sliced to that position, so the
  // anchored regex tests the block opener at offset 0.
  markdownTokenizer: {
    name: MATH_BLOCK_TOKEN_NAME,
    level: 'block',
    start: (src: string) => {
      const index = src.search(/^[ \t]{0,3}\$\$/m);
      return index < 0 ? NO_MATCH : index;
    },
    tokenize(src: string): MarkdownToken | undefined {
      const match = MATH_BLOCK_RE.exec(src);
      if (!match) return undefined;
      const latex = match[1].trim();
      // Empty content is not a formula; hand the `$$` back to normal parsing.
      if (!latex) return undefined;
      return { type: MATH_BLOCK_TOKEN_NAME, raw: match[0], latex };
    },
  },

  parseHTML() {
    return [{ tag: 'div[data-latex]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      class: 'math-block',
      'data-latex': latexOf(node),
      contenteditable: 'false',
    })];
  },

  renderText({ node }) {
    return `$$${latexOf(node)}$$`;
  },

  parseMarkdown(token: MarkdownToken, helpers) {
    const latex = typeof token.latex === 'string' ? token.latex : '';
    return helpers.createNode(MATH_BLOCK_NODE_NAME, { latex });
  },

  renderMarkdown(node: JSONContent): string {
    return renderMathBlockMarkdown(latexOf(node));
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let currentNode = node;
      let isEditing = false;
      let destroyed = false;
      let renderVersion = 0;
      let textareaEl: HTMLTextAreaElement | null = null;

      const dom = document.createElement('div');
      dom.className = 'math-block';
      dom.setAttribute('data-latex', latexOf(currentNode));
      dom.contentEditable = 'false';

      // One render in flight at a time: a version counter discards stale
      // results so a rapid latex edit can never paste an outdated formula.
      const renderPreview = () => {
        const latex = latexOf(currentNode);
        const version = ++renderVersion;
        dom.setAttribute('data-latex', latex);
        const block = document.createElement('div');
        block.className = 'katex-block katex-loading';
        block.title = '点击编辑公式源码';
        block.textContent = '加载中…';
        dom.replaceChildren(block);
        void renderKatex(latex, true).then((result) => {
          if (destroyed || version !== renderVersion) return;
          if (result.ok) {
            block.classList.remove('katex-loading');
            block.innerHTML = result.html;
          } else {
            block.className = 'katex-error-block';
            block.textContent = `公式语法错误：${result.error ?? '公式渲染失败'}`;
          }
        });
      };

      const commitEdit = () => {
        if (!isEditing) return;
        const nextLatex = (textareaEl?.value ?? '').trim();
        isEditing = false;
        textareaEl = null;
        // Empty latex cannot parse back to a node (`$$$$` is prose), so an
        // emptied editor cancels instead of writing an unserializable attr.
        if (!nextLatex || nextLatex === latexOf(currentNode)) {
          renderPreview();
          return;
        }
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos === null || pos === undefined) {
          renderPreview();
          return;
        }
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { latex: nextLatex }));
        // update() re-renders the preview from the new node.
      };

      const cancelEdit = () => {
        if (!isEditing) return;
        isEditing = false;
        textareaEl = null;
        renderPreview();
      };

      const renderEditor = () => {
        const wrap = document.createElement('div');
        wrap.className = 'katex-block';

        textareaEl = document.createElement('textarea');
        textareaEl.className = 'katex-source-editor';
        textareaEl.value = latexOf(currentNode);
        textareaEl.spellcheck = false;
        textareaEl.addEventListener('keydown', (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            commitEdit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelEdit();
          }
        });
        // Same auto-commit contract as the inline KaTeX widget: leaving the
        // textarea (blur) or a source-mode switch commits the draft.
        textareaEl.addEventListener('blur', commitEdit);
        textareaEl.addEventListener('markflow:commit-draft', commitEdit);

        const actions = document.createElement('div');
        actions.className = 'katex-actions';
        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.textContent = '确认';
        // preventDefault on mousedown keeps focus in the textarea, so the blur
        // auto-commit never fires before the click lands on the button.
        confirmBtn.addEventListener('mousedown', (e) => e.preventDefault());
        confirmBtn.addEventListener('click', commitEdit);
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('mousedown', (e) => e.preventDefault());
        cancelBtn.addEventListener('click', cancelEdit);
        actions.append(confirmBtn, cancelBtn);

        wrap.append(textareaEl, actions);
        dom.replaceChildren(wrap);
        requestAnimationFrame(() => textareaEl?.focus());
      };

      const render = () => {
        if (isEditing) renderEditor();
        else renderPreview();
      };

      dom.addEventListener('click', (event) => {
        if (isEditing) return;
        event.preventDefault();
        isEditing = true;
        render();
      });

      render();

      return {
        dom,
        // The atom has no contentDOM: every event inside the widget belongs to
        // the node view (textarea typing, button clicks), never to ProseMirror.
        // `globalThis.Node` — the file's `Node` binding is tiptap's extension.
        stopEvent: (event: Event) =>
          isEditing || (event.target instanceof globalThis.Node && dom.contains(event.target)),
        ignoreMutation: () => true,
        update(updatedNode) {
          if (updatedNode.type !== currentNode.type) return false;
          currentNode = updatedNode;
          // While editing, keep the live draft on top of external attr churn.
          if (!isEditing) renderPreview();
          return true;
        },
        destroy() {
          destroyed = true;
          renderVersion += 1;
        },
      };
    };
  },
});
