import { getEditor } from '../lib/editor';

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
    item.innerHTML = `
      <span class="outline-level">H${h.level}</span>
      <span>${h.text}</span>
    `;
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
