import { getEditor, getMode } from '../lib/editor';
import { getActiveLosslessBinding } from '../lib/lossless/registry';
import { store } from '../lib/store';

export function initOutline() {
  const outlineTree = document.getElementById('outline-tree');
  if (!outlineTree) return;
  outlineTree.innerHTML = '<div class="empty-state">当前文档无标题</div>';

  store.on('editor:update', () => {
    refreshOutline();
  });
}

/** Collect headings from the lossless binding's CodeMirror syntax tree. */
function headingsFromLossless(): { level: number; text: string; pos: number }[] {
  const binding = getActiveLosslessBinding();
  if (!binding) return [];
  const view = binding.editor.view;
  const tree = view.state.doc;
  const headings: { level: number; text: string; pos: number }[] = [];
  // Walk the visible text lines; heading detection uses the Lezer tree when
  // available, falling back to a simple line scan (never DOM textContent).
  const text = tree.toString();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(#{1,6})\s+(.*)/);
    if (m) {
      let pos = 0;
      for (let j = 0; j < i; j++) pos += lines[j].length + 1;
      headings.push({ level: m[1].length, text: m[2], pos });
    }
  }
  return headings;
}

export function refreshOutline() {
  const outlineTree = document.getElementById('outline-tree');
  if (!outlineTree) return;

  // Lossless docs: read headings from the single CodeMirror binding in BOTH
  // Source and Live Preview modes (the doc is the same either way).
  const losslessBinding = getActiveLosslessBinding();
  if (losslessBinding) {
    renderHeadings(outlineTree, headingsFromLossless());
    return;
  }

  if (getMode() === 'source') {
    outlineTree.innerHTML = '<div class="empty-state">源码模式</div>';
    return;
  }

  const editor = getEditor();
  if (!editor) return;

  const headings: { level: number; text: string; pos: number }[] = [];
  const doc = editor.state.doc;

  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({
        level: node.attrs.level,
        text: node.textContent,
        pos,
      });
    }
  });

  renderHeadings(outlineTree, headings);
}

function renderHeadings(
  outlineTree: HTMLElement,
  headings: { level: number; text: string; pos: number }[],
) {
  if (headings.length === 0) {
    outlineTree.innerHTML = '<div class="empty-state">当前文档无标题</div>';
    return;
  }

  outlineTree.innerHTML = '';
  headings.forEach(h => {
    const item = document.createElement('div');
    item.className = 'outline-item';
    item.style.paddingLeft = `${16 + (h.level - 1) * 12}px`;

    const level = document.createElement('span');
    level.className = 'outline-level';
    level.textContent = `H${h.level}`;

    const text = document.createElement('span');
    text.textContent = h.text;

    item.append(level, text);
    item.addEventListener('click', () => {
      // Lossless binding: jump via the CodeMirror selection (no PM nodeDOM).
      const losslessBinding = getActiveLosslessBinding();
      if (losslessBinding) {
        const view = losslessBinding.editor.view;
        const line = view.state.doc.lineAt(Math.min(h.pos, view.state.doc.length));
        view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
        view.focus();
        return;
      }
      const editor = getEditor();
      if (!editor) return;
      editor.commands.focus(h.pos);
      const editorEl = document.getElementById('wysiwyg-editor');
      if (editorEl) {
        const domNode = editor.view.nodeDOM(h.pos);
        if (domNode && domNode instanceof HTMLElement) {
          domNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
    outlineTree.appendChild(item);
  });
}
