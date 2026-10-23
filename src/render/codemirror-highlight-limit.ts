// ── CodeMirror: Limit syntax highlighting to N lines per code block ──

import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

/** Maximum lines a code block may have before highlighting is disabled */
const MAX_CODE_LINES = 200;

const noHighlightDeco = Decoration.line({ attributes: { 'data-no-highlight': '' } });

/**
 * ViewPlugin that detects code blocks exceeding MAX_CODE_LINES and marks
 * them with `data-no-highlight` so CSS can disable syntax highlighting.
 */
export const highlightLimitPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = computeDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = computeDecorations(update.view);
      }
    }
  },
  { decorations: v => v.decorations },
);

function computeDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(view.state);

  tree.iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return;
      const fromLine = view.state.doc.lineAt(node.from).number;
      const toLine = view.state.doc.lineAt(node.to).number;
      const lineCount = toLine - fromLine + 1;
      if (lineCount > MAX_CODE_LINES) {
        builder.add(node.from, node.to, noHighlightDeco);
      }
    },
  });

  return builder.finish();
}
