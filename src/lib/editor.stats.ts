import type { CursorPos } from '../types/editor';
import { editor, getMode } from './editor.state';
import { countTextWords } from './editor.helpers';

function getSourceTextarea(): HTMLTextAreaElement | null {
  return document.getElementById('source-editor') as HTMLTextAreaElement | null;
}

export function getWordCount(): number {
  if (getMode() === 'source') {
    const textarea = getSourceTextarea();
    return countTextWords(textarea?.value || '');
  }
  if (!editor) return 0;
  return countTextWords(editor.state.doc.textContent);
}

export function getLineCount(): number {
  if (getMode() === 'source') {
    const textarea = getSourceTextarea();
    if (!textarea) return 1;
    const lines = textarea.value.split('\n');
    return lines.length;
  }
  if (!editor) return 0;
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.isBlock) count++;
  });
  return Math.max(count, 1);
}

export function getCursorPos(): CursorPos {
  if (getMode() === 'source') {
    const textarea = getSourceTextarea();
    if (!textarea) return { line: 1, col: 0 };
    const text = textarea.value;
    const beforeCursor = text.substring(0, textarea.selectionStart);
    const line = (beforeCursor.match(/\n/g) || []).length + 1;
    const lastNewline = beforeCursor.lastIndexOf('\n');
    const col = beforeCursor.length - lastNewline - 1;
    return { line, col };
  }
  if (!editor) return { line: 1, col: 0 };
  const { from } = editor.state.selection;
  const doc = editor.state.doc;
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
