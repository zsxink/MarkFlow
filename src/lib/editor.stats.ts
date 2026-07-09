import type { CursorPos } from '../types/editor';
import { getEditor, getMode } from './editor.state';
import { countTextWords } from './editor.helpers';
import { getSourceView } from './editor.source';

export function getWordCount(): number {
  if (getMode() === 'source') {
    const view = getSourceView();
    return countTextWords(view?.state.doc.toString() || '');
  }
  const ed = getEditor();
  if (!ed) return 0;
  return countTextWords(ed.state.doc.textContent);
}

export function getLineCount(): number {
  if (getMode() === 'source') {
    const view = getSourceView();
    if (!view) return 1;
    return view.state.doc.lines;
  }
  const ed = getEditor();
  if (!ed) return 0;
  let count = 0;
  ed.state.doc.descendants((node) => {
    if (node.isBlock) count++;
  });
  return Math.max(count, 1);
}

export function getCursorPos(): CursorPos {
  if (getMode() === 'source') {
    const view = getSourceView();
    if (!view) return { line: 1, col: 0 };
    const { state } = view;
    const head = state.selection.main.head;
    const doc = state.doc;
    const line = doc.lineAt(head);
    const col = head - line.from;
    return { line: line.number, col };
  }
  const ed = getEditor();
  if (!ed) return { line: 1, col: 0 };
  const { from } = ed.state.selection;
  const doc = ed.state.doc;
  let line = 0;
  let blockStart = 0;
  doc.descendants((node, nodePos) => {
    if (nodePos > from) return false;
    if (node.isBlock && nodePos >= blockStart) {
      if (nodePos > blockStart) line++;
      blockStart = nodePos;
    }
    return true;
  });
  return { line: Math.max(line, 1), col: Math.max(0, from - blockStart - 1) };
}
