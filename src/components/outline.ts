import { getEditor, getMode } from '../lib/editor';

export function initOutline() {
  const outlineTree = document.getElementById('outline-tree');
  if (!outlineTree) return;
  outlineTree.innerHTML = '<div class="empty-state">当前文档无标题</div>';

  document.addEventListener('editor-update', () => {
    refreshOutline();
  });
}

export function refreshOutline() {
  const outlineTree = document.getElementById('outline-tree');
  if (!outlineTree) return;

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
