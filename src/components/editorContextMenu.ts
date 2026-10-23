import type { EditorView } from 'codemirror';
import { getEditor, getMode } from '../lib/editor';
import { getSourceView } from '../lib/editor.source.facade';
import { store } from '../lib/store';
import { showLinkDialog } from './linkDialog';
import { showImageInsertDialog } from './toolbar';
import { showToast } from './toast';
import { showContextMenuStatic } from './ui/contextMenu';
import type { ContextMenuItem } from './ui/contextMenu';

type TextControl = HTMLInputElement | HTMLTextAreaElement;

/** Show the app's native-style edit menu for areas without a specialized menu. */
export function showEditorContextMenu(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target as HTMLElement : null;
  if (!target || target.closest('#sidebar, .context-menu, img, .mermaid-preview, .plantuml-preview')) return;

  const control = getTextControl(target);
  if (control) {
    event.preventDefault();
    showContextMenuStatic(buildTextControlItems(control), { x: event.clientX, y: event.clientY }, { className: 'editor-context-menu' });
    return;
  }

  event.preventDefault();
  prepareEditorSelection(event);
  showContextMenuStatic(buildEditorItems(), { x: event.clientX, y: event.clientY }, { className: 'editor-context-menu' });
}

function getTextControl(target: HTMLElement): TextControl | null {
  const control = target.closest('textarea, input') as TextControl | null;
  if (!control || control.disabled) return null;
  if (control instanceof HTMLInputElement && !['text', 'search', 'url', 'tel', 'email', 'password'].includes(control.type)) return null;
  return control;
}

function prepareEditorSelection(event: MouseEvent): void {
  if (!event.target || !(event.target instanceof HTMLElement) || !event.target.closest('#editor-area')) return;
  if (getMode() === 'source') {
    const view = getSourceView();
    if (!view) return;
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (position === null) return;
    const selection = view.state.selection.main;
    if (selection.empty || position < selection.from || position > selection.to) {
      view.dispatch({ selection: { anchor: position } });
    }
    return;
  }

  const editor = getEditor();
  if (!editor) return;
  const position = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!position) return;
  const { from, to, empty } = editor.state.selection;
  if (empty || position.pos < from || position.pos > to) {
    editor.commands.setTextSelection(position.pos);
  }
}

function buildTextControlItems(control: TextControl): ContextMenuItem[] {
  const hasSelection = control.selectionStart !== control.selectionEnd;
  const editable = !control.readOnly;
  return [
    { label: '剪切', shortcut: formatShortcut('⌘X'), disabled: !editable || !hasSelection, onClick: () => writeControlSelection(control, true) },
    { label: '复制', shortcut: formatShortcut('⌘C'), disabled: !hasSelection, onClick: () => writeControlSelection(control, false) },
    { label: '粘贴', shortcut: formatShortcut('⌘V'), disabled: !editable, onClick: () => pasteIntoControl(control) },
    { label: '以纯文本形式粘贴', disabled: !editable, onClick: () => pasteIntoControl(control) },
    { divider: true },
    { label: '全选', shortcut: formatShortcut('⌘A'), onClick: () => control.select() },
  ];
}

function buildEditorItems(): ContextMenuItem[] {
  const selection = getSelectionText();
  const editable = !store.getState().readOnly;
  const textFormat: ContextMenuItem[] = [
    { label: '粗体', shortcut: '⌘B', disabled: !editable, onClick: () => formatText('bold') },
    { label: '斜体', shortcut: '⌘I', disabled: !editable, onClick: () => formatText('italic') },
    { label: '删除线', disabled: !editable, onClick: () => formatText('strike') },
    { label: '行内代码', disabled: !editable, onClick: () => formatText('code') },
  ];
  const paragraphs: ContextMenuItem[] = [
    { label: '正文', disabled: !editable, onClick: () => setBlock('paragraph') },
    { label: '标题 1', disabled: !editable, onClick: () => setBlock('heading', 1) },
    { label: '标题 2', disabled: !editable, onClick: () => setBlock('heading', 2) },
    { label: '引用', disabled: !editable, onClick: () => setBlock('quote') },
    { label: '无序列表', disabled: !editable, onClick: () => setBlock('bullet-list') },
    { label: '有序列表', disabled: !editable, onClick: () => setBlock('ordered-list') },
  ];
  const insert: ContextMenuItem[] = [
    { label: '链接…', disabled: !editable, onClick: () => showLinkDialog() },
    { label: '分隔线', disabled: !editable, onClick: () => insertBlock('horizontal-rule') },
    { label: '代码块', disabled: !editable, onClick: () => insertBlock('code-block') },
    { label: '图片…', disabled: !editable, onClick: () => showImageInsertDialog() },
  ];

  return [
    { label: '新增链接…', disabled: !editable, onClick: () => showLinkDialog() },
    { divider: true },
    { label: '文本格式', disabled: !editable, submenu: textFormat },
    { label: '段落设置', disabled: !editable, submenu: paragraphs },
    { label: '插入', disabled: !editable, submenu: insert },
    { divider: true },
    { label: '剪切', shortcut: formatShortcut('⌘X'), disabled: !editable || !selection, onClick: () => writeEditorSelection(true) },
    { label: '复制', shortcut: formatShortcut('⌘C'), disabled: !selection, onClick: () => writeEditorSelection(false) },
    { label: '粘贴', shortcut: formatShortcut('⌘V'), disabled: !editable, onClick: () => pasteIntoEditor(false) },
    { label: '以纯文本形式粘贴', disabled: !editable, onClick: () => pasteIntoEditor(true) },
    { label: '全选', shortcut: formatShortcut('⌘A'), onClick: selectAll },
  ];
}

function formatShortcut(macShortcut: string): string {
  if (/Mac|iPhone|iPad/.test(navigator.platform)) return macShortcut;
  return macShortcut.replace('⌘', 'Ctrl+');
}

function getSelectionText(): string {
  if (getMode() === 'source') {
    const view = getSourceView();
    if (!view) return '';
    const { from, to } = view.state.selection.main;
    return view.state.sliceDoc(from, to);
  }
  const editor = getEditor();
  if (!editor) return '';
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, '\n');
}

async function writeClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('当前环境无法访问剪贴板');
  await navigator.clipboard.writeText(text);
}

async function readClipboard(plainTextOnly: boolean): Promise<{ text: string; html?: string }> {
  if (!plainTextOnly && getMode() === 'wysiwyg' && navigator.clipboard?.read) {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes('text/html')) {
        const html = await (await item.getType('text/html')).text();
        return { text: html, html };
      }
      if (item.types.includes('text/plain')) return { text: await (await item.getType('text/plain')).text() };
    }
  }
  if (!navigator.clipboard?.readText) throw new Error('当前环境无法访问剪贴板');
  return { text: await navigator.clipboard.readText() };
}

async function writeControlSelection(control: TextControl, cut: boolean): Promise<void> {
  const from = control.selectionStart ?? 0;
  const to = control.selectionEnd ?? from;
  if (from === to) return;
  try {
    await writeClipboard(control.value.slice(from, to));
    if (cut) {
      control.setRangeText('', from, to, 'start');
      control.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } catch (error) { reportClipboardError(error); }
}

async function pasteIntoControl(control: TextControl): Promise<void> {
  try {
    const { text } = await readClipboard(true);
    const start = control.selectionStart ?? 0;
    const end = control.selectionEnd ?? start;
    control.setRangeText(text, start, end, 'end');
    control.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (error) { reportClipboardError(error); }
}

async function writeEditorSelection(cut: boolean): Promise<void> {
  const text = getSelectionText();
  if (!text) return;
  try {
    await writeClipboard(text);
    if (!cut) return;
    if (getMode() === 'source') {
      const view = getSourceView();
      if (view) view.dispatch({ changes: { from: view.state.selection.main.from, to: view.state.selection.main.to, insert: '' } });
    } else getEditor()?.chain().focus().deleteSelection().run();
  } catch (error) { reportClipboardError(error); }
}

async function pasteIntoEditor(plainTextOnly: boolean): Promise<void> {
  try {
    const clip = await readClipboard(plainTextOnly);
    if (getMode() === 'source') {
      const view = getSourceView();
      if (!view || store.getState().readOnly) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: clip.text }, selection: { anchor: from + clip.text.length } });
    } else {
      const editor = getEditor();
      if (!editor || store.getState().readOnly) return;
      if (clip.html && !plainTextOnly) editor.commands.insertContent(clip.html);
      else editor.commands.insertContent({ type: 'text', text: clip.text });
      editor.commands.focus();
    }
  } catch (error) { reportClipboardError(error); }
}

function reportClipboardError(error: unknown): void {
  showToast(error instanceof Error ? error.message : '剪贴板操作失败');
}

function selectAll(): void {
  if (getMode() === 'source') {
    const view = getSourceView();
    if (!view) return;
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    view.focus();
  } else getEditor()?.chain().focus().selectAll().run();
}

type TextFormat = 'bold' | 'italic' | 'strike' | 'code';
function formatText(format: TextFormat): void {
  if (getMode() === 'source') {
    const view = getSourceView();
    if (view) wrapSourceSelection(view, { bold: '**', italic: '*', strike: '~~', code: '`' }[format]);
    return;
  }
  const chain = getEditor()?.chain().focus();
  if (!chain) return;
  if (format === 'bold') chain.toggleBold().run();
  if (format === 'italic') chain.toggleItalic().run();
  if (format === 'strike') chain.toggleStrike().run();
  if (format === 'code') chain.toggleCode().run();
}

function wrapSourceSelection(view: EditorView, marker: string): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  view.dispatch({
    changes: { from, to, insert: `${marker}${selected}${marker}` },
    selection: selected ? { anchor: from + marker.length, head: from + marker.length + selected.length } : { anchor: from + marker.length },
  });
  view.focus();
}

function setBlock(kind: 'paragraph' | 'heading' | 'quote' | 'bullet-list' | 'ordered-list', level?: 1 | 2): void {
  if (getMode() === 'source') {
    const view = getSourceView();
    if (!view) return;
    const selection = view.state.selection.main;
    const line = view.state.doc.lineAt(selection.from);
    const endLine = view.state.doc.lineAt(selection.to);
    const lineEnd = !selection.empty && selection.to === endLine.from
      ? view.state.doc.lineAt(Math.max(line.from, selection.to - 1)).to
      : endLine.to;
    const selected = view.state.sliceDoc(line.from, lineEnd);
    const prefix = kind === 'heading' ? `${'#'.repeat(level || 1)} ` : kind === 'quote' ? '> ' : kind === 'bullet-list' ? '- ' : kind === 'ordered-list' ? '1. ' : '';
    const transformed = selected.split('\n').map(row => `${prefix}${row.replace(/^(?:#{1,6} |>|[-*+] |\d+\. )/, '')}`).join('\n');
    view.dispatch({ changes: { from: line.from, to: lineEnd, insert: transformed }, selection: { anchor: line.from, head: line.from + transformed.length } });
    view.focus();
    return;
  }
  const chain = getEditor()?.chain().focus();
  if (!chain) return;
  if (kind === 'paragraph') chain.setParagraph().run();
  if (kind === 'heading') chain.setHeading({ level: level || 1 }).run();
  if (kind === 'quote') chain.toggleBlockquote().run();
  if (kind === 'bullet-list') chain.toggleBulletList().run();
  if (kind === 'ordered-list') chain.toggleOrderedList().run();
}

function insertBlock(kind: 'horizontal-rule' | 'code-block'): void {
  if (getMode() === 'source') {
    const view = getSourceView();
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const content = kind === 'horizontal-rule' ? '\n---\n' : '```\n\n```';
    view.dispatch({ changes: { from, to, insert: content }, selection: { anchor: from + (kind === 'code-block' ? 4 : content.length) } });
    view.focus();
    return;
  }
  const chain = getEditor()?.chain().focus();
  if (kind === 'horizontal-rule') chain?.setHorizontalRule().run();
  if (kind === 'code-block') chain?.toggleCodeBlock().run();
}
