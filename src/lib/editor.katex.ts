/**
 * KaTeX editor integration — renders $..$ and $$..$$ math formulas as static
 * KaTeX HTML, with double-click to edit the source.
 *
 * Rendering approach (no `Decoration.replace` available in this PM version):
 *  - `Decoration.inline` wraps the formula's raw `$..$` text in a
 *    `katex-formula katex-hidden` span; CSS hides it so the user sees the
 *    rendered math instead of the raw syntax.
 *  - `Decoration.widget` inserts the rendered KaTeX HTML element at the
 *    formula's start position (or a source <textarea> while editing).
 *  - The underlying document text keeps the original `$..$` / `$$..$$`
 *    markers, so round-trip through the markdown pipeline is preserved.
 *
 * Per design D3 + D5: invalid LaTeX renders a placeholder (never crashes);
 * KaTeX is loaded lazily and only when a document contains formulas.
 */

import {Extension} from '@tiptap/core';
import {Plugin, PluginKey} from 'prosemirror-state';
import {Decoration, DecorationSet, type EditorView} from 'prosemirror-view';
import {scanFormulas, type FormulaMatch} from './katex-scan';
import {renderKatex} from './katex-render';

const katexPluginKey = new PluginKey('katex');

/**
 * Rendered-output cache.
 * htmlByKey / errorByKey / pendingKeys are keyed by formula CONTENT
 * (`${type}:${content}`) so a formula that stays identical keeps its rendered
 * result even when unrelated edits shift its position — that avoids flashing
 * the loading placeholder on every keystroke. editingKeys is keyed by the
 * positional `from:to` range (only one formula occupies a range at a time).
 */
interface KaTeXCache {
  htmlByKey: Map<string, string>;
  errorByKey: Map<string, string>;
  pendingKeys: Set<string>;
  editingKeys: Set<string>;
}

/** Content-based cache key for a formula (shared across positions). */
function formulaCacheKey(formula: FormulaMatch): string {
  return `${formula.type}:${formula.content}`;
}

/**
 * Render a formula to HTML (lazy), storing the result in the cache and
 * refreshing decorations by dispatching an empty transaction.
 */
async function renderFormula(
  formula: FormulaMatch,
  cache: KaTeXCache,
  getView: () => EditorView | undefined,
) {
  const key = formulaCacheKey(formula);
  if (cache.pendingKeys.has(key)) return;
  cache.pendingKeys.add(key);
  const result = await renderKatex(formula.content, formula.type === 'block');
  cache.pendingKeys.delete(key);
  if (result.ok) cache.htmlByKey.set(key, result.html);
  else cache.errorByKey.set(key, result.error || '公式渲染失败');
  getView()?.dispatch(getView()!.state.tr);
}

/**
 * Build the widget DOM for a formula: rendered KaTeX, an error placeholder,
 * or a source editor (while editing). Returns a destroy callback too.
 */
function buildFormulaWidget(
  formula: FormulaMatch,
  positionKey: string,
  cache: KaTeXCache,
  getView: () => EditorView | undefined,
): {dom: HTMLElement} {
  const editing = cache.editingKeys.has(positionKey);
  const contentKey = formulaCacheKey(formula);
  const wrapper = document.createElement('span');
  wrapper.className = formula.type === 'block' ? 'katex-block' : 'katex-inline';

  if (editing) {
    // Source editor mode: textarea prefilled with the LaTeX content.
    const textarea = document.createElement('textarea');
    textarea.className = 'katex-source-editor';
    textarea.value = formula.content;
    textarea.spellcheck = false;
    const commit = () => commitFormula(positionKey, formula, textarea.value, cache, getView);
    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cache.editingKeys.delete(positionKey);
        getView()?.dispatch(getView()!.state.tr);
      }
    });
    textarea.addEventListener('blur', commit);
    const actions = document.createElement('div');
    actions.className = 'katex-actions';
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.textContent = '确认';
    // preventDefault on mousedown keeps focus in the textarea, so blur (which
    // auto-commits) does not fire before the click — otherwise every click on
    // the Confirm/Cancel buttons would first blur-commit the edit.
    confirmBtn.addEventListener('mousedown', (e) => e.preventDefault());
    confirmBtn.addEventListener('click', commit);
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('mousedown', (e) => e.preventDefault());
    cancelBtn.addEventListener('click', () => {
      cache.editingKeys.delete(positionKey);
      getView()?.dispatch(getView()!.state.tr);
    });
    actions.append(confirmBtn, cancelBtn);
    wrapper.append(textarea, actions);
    return {dom: wrapper};
  }

  const error = cache.errorByKey.get(contentKey);
  const html = cache.htmlByKey.get(contentKey);
  if (error) {
    wrapper.className = formula.type === 'block' ? 'katex-error-block' : 'katex-error-inline';
    wrapper.textContent = `公式语法错误：${error}`;
  } else if (html) {
    wrapper.innerHTML = html;
  } else {
    wrapper.className = 'katex-loading';
    wrapper.textContent = '加载中…'; // spec: loading indicator during async load
  }
  wrapper.title = '双击编辑公式源码';

  wrapper.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    cache.editingKeys.add(positionKey);
    cache.pendingKeys.delete(contentKey);
    getView()?.dispatch(getView()!.state.tr);
  });

  return {dom: wrapper};
}

/**
 * Write an edited formula's LaTeX content back into the document, replacing
 * the original `$..$` range, then clear the edit state.
 */
function commitFormula(
  key: string,
  formula: FormulaMatch,
  nextContent: string,
  cache: KaTeXCache,
  getView: () => EditorView | undefined,
) {
  const view = getView();
  if (!view) {
    cache.editingKeys.delete(key);
    return;
  }
  // Re-locate the formula range so we replace the CURRENT source text.
  const {from, to} = locateFormula(view, formula);
  const delimiters = formula.type === 'block' ? '$$' : '$';
  // Keep the user's content. `$` is legal inside LaTeX (currency, `\$`), so
  // only strip exactly one delimiter pair at the edges rather than every `$`.
  let content = nextContent.trim();
  if (formula.type === 'block') {
    content = content.replace(/^\$\$/g, '').replace(/\$\$$/g, '');
  } else {
    content = content.replace(/^\$/g, '').replace(/\$$/g, '');
  }
  if (from !== -1) {
    view.dispatch(view.state.tr.replaceWith(from, to, view.state.schema.text(`${delimiters}${content}${delimiters}`)));
  }
  cache.editingKeys.delete(key);
  // Invalidate the rendered result for the OLD content (we just changed it).
  const oldContentKey = formulaCacheKey(formula);
  cache.htmlByKey.delete(oldContentKey);
  cache.errorByKey.delete(oldContentKey);
  cache.pendingKeys.delete(oldContentKey);
}

/**
 * Re-locate a formula's current document range by re-scanning the text node.
 * Returns {from,to} (-1 if not found) so edits land on the live text.
 */
function locateFormula(
  view: EditorView,
  formula: FormulaMatch,
): {from: number; to: number} {
  let found = {from: -1, to: -1};
  view.state.doc.descendants((node, pos) => {
    if (found.from !== -1 || !node.isText || !node.text) return;
    const text = node.text;
    // Match by the position offset within this text node.
    if (pos <= formula.from && formula.from < pos + text.length) {
      const rel = formula.from - pos;
      const candidate = scanFormulas(text).find(
        (f) => f.from === rel && f.content === formula.content,
      );
      if (candidate) {
        found = {from: pos + candidate.from, to: pos + candidate.to};
      }
    }
  });
  return found;
}

/**
 * Create a tiptap Extension that renders KaTeX math formulas.
 */
export function katexPlugin() {
  const cache: KaTeXCache = {
    htmlByKey: new Map(),
    errorByKey: new Map(),
    editingKeys: new Set(),
    pendingKeys: new Set(),
  };
  let viewRef: EditorView | undefined;

  return Extension.create({
    name: 'katex',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: katexPluginKey,

          view(editorView) {
            viewRef = editorView;
            return {};
          },

          state: {
            init() {
              return DecorationSet.empty;
            },
            apply(tr, old) {
              if (!tr.docChanged) {
                return old.map(tr.mapping, tr.doc);
              }
              // Compute which formulas exist in the NEW document. Rendered
              // output is content-keyed, so an unchanged formula keeps its
              // cache entry across unrelated edits (no loading flash); only
              // content/positions that vanished get evicted so the cache does
              // not grow without bound.
              const liveContentKeys = new Set<string>();
              const livePositionKeys = new Set<string>();
              tr.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return;
                for (const f of scanFormulas(node.text)) {
                  liveContentKeys.add(formulaCacheKey(f));
                  livePositionKeys.add(`${pos + f.from}:${pos + f.to}`);
                }
              });
              for (const contentKey of cache.htmlByKey.keys()) {
                if (!liveContentKeys.has(contentKey)) cache.htmlByKey.delete(contentKey);
              }
              for (const contentKey of cache.errorByKey.keys()) {
                if (!liveContentKeys.has(contentKey)) cache.errorByKey.delete(contentKey);
              }
              // Editing keys are positional: drop any whose formula vanished.
              for (const positionKey of cache.editingKeys) {
                if (!livePositionKeys.has(positionKey)) cache.editingKeys.delete(positionKey);
              }
              return DecorationSet.empty;
            },
          },

          props: {
            decorations(state) {
              const getView = () => viewRef;
              const decorations: Decoration[] = [];
              state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return;
                const text = node.text;
                const formulas = scanFormulas(text);
                for (const formula of formulas) {
                  const from = pos + formula.from;
                  const to = pos + formula.to;
                  const positionKey = `${from}:${to}`;
                  const contentKey = formulaCacheKey(formula);

                  // Hide the raw source text.
                  decorations.push(
                    Decoration.inline(from, to, {
                      class: `${formula.type === 'block' ? 'katex-block' : 'katex-inline'} katex-formula katex-hidden`,
                      'data-katex-type': formula.type,
                    }),
                  );

                  // Lazy-render (fire once). Content-keyed: unchanged formulas
                  // keep their cached result across unrelated edits.
                  if (
                    !cache.pendingKeys.has(contentKey)
                    && !cache.htmlByKey.has(contentKey)
                    && !cache.errorByKey.has(contentKey)
                    && !cache.editingKeys.has(positionKey)
                  ) {
                    void renderFormula(formula, cache, getView);
                  }

                  // Insert the rendered/source widget at the formula start.
                  decorations.push(
                    Decoration.widget(from, () => {
                      const {dom} = buildFormulaWidget(formula, positionKey, cache, getView);
                      return dom;
                    }),
                  );
                }
              });

              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}

export function getKatexPluginKey() {
  return katexPluginKey;
}
