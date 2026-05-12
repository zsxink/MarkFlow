import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Markdown } from 'tiptap-markdown';
import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);

let editor: Editor | null = null;
let mode: 'wysiwyg' | 'source' = 'wysiwyg';

export function getEditor(): Editor | null {
  return editor;
}

export function getMode() {
  return mode;
}

export function setMode(newMode: 'wysiwyg' | 'source') {
  mode = newMode;
}

export function getMarkdown(): string {
  if (!editor) return '';
  return editor.storage.markdown.getMarkdown();
}

export function setMarkdown(content: string) {
  if (editor) {
    editor.commands.setContent(content);
  }
}

export function getWordCount(): number {
  if (!editor) return 0;
  const text = editor.state.doc.textContent;
  if (!text) return 0;
  const cjkChars = (text.match(/[\u4e00-\u9fa5\u3400-\u4dbf]/g) || []).length;
  const nonCjkText = text.replace(/[\u4e00-\u9fa5\u3400-\u4dbf]/g, '');
  const nonCjkWords = nonCjkText.split(/\s+/).filter(Boolean).length;
  return cjkChars + nonCjkWords;
}

export function getLineCount(): number {
  if (!editor) return 0;
  const text = editor.state.doc.textContent;
  if (!text) return 0;
  return text.split('\n').length;
}

export function getCursorPos(): { line: number; col: number } {
  if (!editor) return { line: 1, col: 1 };
  const { from } = editor.state.selection;
  const doc = editor.state.doc;
  let line = 1;
  let blockStart = 0;
  doc.descendants((node, nodePos) => {
    if (nodePos > from) return false;
    if (node.isBlock && nodePos >= blockStart) {
      if (nodePos > blockStart) line++;
      blockStart = nodePos;
    }
    return true;
  });
  return { line, col: from - blockStart + 1 };
}

export async function initEditor() {
  const container = document.getElementById('editor-area');
  if (!container) return;

  const editorDiv = document.createElement('div');
  editorDiv.className = 'editor-container';
  editorDiv.innerHTML = '<div id="wysiwyg-editor"></div><textarea id="source-editor" class="source-editor" hidden></textarea>';
  container.appendChild(editorDiv);

  const editorEl = document.getElementById('wysiwyg-editor');
  if (!editorEl) return;

  editor = new Editor({
    element: editorEl,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: '开始写作 — 输入即所得',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Link.configure({
        openOnClick: false,
      }),
      Image,
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: '-',
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: '',
    onUpdate: () => {
      document.dispatchEvent(new Event('editor-update'));
    },
    onSelectionUpdate: () => {
      document.dispatchEvent(new Event('editor-update'));
    },
  });

  // Source editor sync
  const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement;
  if (sourceEditor) {
    sourceEditor.addEventListener('input', () => {
      if (editor && mode === 'source') {
        editor.commands.setContent(sourceEditor.value);
      }
    });
  }
}

export function switchToSource() {
  if (!editor) return;
  const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement;
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  if (!sourceEditor || !wysiwygEditor) return;

  sourceEditor.value = getMarkdown();
  wysiwygEditor.hidden = true;
  sourceEditor.hidden = false;
  mode = 'source';
}

export function switchToWysiwyg() {
  const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement;
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  if (!sourceEditor || !wysiwygEditor) return;

  if (editor) {
    editor.commands.setContent(sourceEditor.value);
  }
  wysiwygEditor.hidden = false;
  sourceEditor.hidden = true;
  mode = 'wysiwyg';
}
