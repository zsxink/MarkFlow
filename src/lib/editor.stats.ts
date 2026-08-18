import type { CursorPos } from '../types/editor';
import { getEditor, getMode } from './editor.state';
import { countTextWords } from './editor.helpers';
import { getSourceView } from './editor.source';
import { getActiveLosslessBinding } from './lossless/registry';

/**
 * The active lossless CodeMirror view, when the current document is owned by a
 * lossless Core session. P2: stats read the SAME single EditorView in both
 * Source and Live Preview modes — never the hidden legacy surface.
 */
function losslessView() {
  return getActiveLosslessBinding()?.editor.view ?? null;
}

export function getWordCount(): number {
  const lossless = losslessView();
  if (lossless) {
    return countTextWords(lossless.state.doc.toString() || '');
  }
  if (getMode() === 'source') {
    const view = getSourceView();
    return countTextWords(view?.state.doc.toString() || '');
  }
  const ed = getEditor();
  if (!ed) return 0;
  return countTextWords(ed.state.doc.textContent);
}

export function getLineCount(): number {
  const lossless = losslessView();
  if (lossless) {
    return lossless.state.doc.lines;
  }
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
  const lossless = losslessView();
  if (lossless) {
    const { state } = lossless;
    const head = state.selection.main.head;
    const doc = state.doc;
    const line = doc.lineAt(head);
    const col = head - line.from;
    return { line: line.number, col };
  }
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
