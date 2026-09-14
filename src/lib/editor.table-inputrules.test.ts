import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { MarkdownSafeTable } from './editor.extensions';
import { createMarkdownExtension } from './editor.init';

/**
 * WYSIWYG 表格输入规则单测（task 1.1）。
 *
 * 使用与真实应用一致的扩展栈（含 createMarkdownExtension 的解析/序列化管线），
 * 通过真实键盘事件走 TipTap 的 inputRules 插件：handleTextInput 逐字符输入 +
 * handleKeyDown Enter 触发规则。
 */

function makeEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
      MarkdownSafeTable.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      createMarkdownExtension(),
    ],
  });
}

/** Dispatch a real Enter keydown through the editor's view plugin pipeline. */
function pressEnter(editor: Editor): boolean {
  const view = editor.view as any;
  return view.someProp('handleKeyDown', (f: any) =>
    f(view, new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })),
  );
}

/** Simulate keystroke-by-keystroke typing through handleTextInput. */
function typeText(editor: Editor, text: string) {
  const view = editor.view as any;
  for (const ch of text) {
    const pos = view.state.selection.anchor;
    const consumed = view.someProp('handleTextInput', (f: any) => f(view, pos, pos, ch) === true);
    if (!consumed) editor.commands.insertContent(ch);
  }
}

/** Build the editor, type a GFM table sequence line-by-line with Enter. */
function typeTable(lines: string[]): { editor: Editor; enterConsumed: boolean } {
  const editor = makeEditor();
  editor.commands.setContent('');
  editor.commands.focus('start');
  let enterConsumed = false;
  for (const line of lines) {
    typeText(editor, line);
    enterConsumed = pressEnter(editor);
  }
  return { editor, enterConsumed };
}

/** Return `type.table / type.paragraph + text` of the doc's first block. */
function firstBlock(editor: Editor): { type: string; text?: string } {
  const child = editor.state.doc.content.firstChild;
  if (!child) return { type: 'empty' };
  return { type: child.type.name, text: child.textContent ?? undefined };
}

describe('MarkdownSafeTable 输入规则（task 1.1）', () => {
  it('输入 表头+分隔行 后回车即转换为表格（含 1 行空数据），光标落入首个数据单元格', () => {
    const { editor, enterConsumed } = typeTable(['| a | b |', '| --- | --- |']);
    expect(enterConsumed).toBe(true);
    const block = firstBlock(editor);
    expect(block.type).toBe('table');
    // 表头 1 行（tableHeader）+ 自动生成的空数据行（tableCell）
    const rows = (editor.state.doc.firstChild as any).content.childCount;
    expect(rows).toBe(2);
    // 光标位于首个数据单元格（第 2 行第 1 列）内
    const sel = editor.state.selection as any;
    expect(sel.$from.node(-1)?.type.name).toBe('tableCell');
    expect(sel.$from.index(-1)).toBe(0); // 第 1 列
    const headerRow = (editor.state.doc.firstChild as any).content.firstChild;
    expect(headerRow.content.firstChild.textContent).toBe('a');
    editor.destroy();
  });

  it('转换后在生成的空数据单元格内输入文本，序列化仍为合法 GFM 表格', () => {
    const editor = makeEditor();
    editor.commands.setContent('');
    editor.commands.focus('start');
    typeText(editor, '| a | b |');
    pressEnter(editor);
    typeText(editor, '| --- | --- |');
    pressEnter(editor); // 此处回车即转换（含空数据行）
    // 转换后光标在空数据单元格，继续输入落入单元格而非新增源码行
    typeText(editor, '1');
    typeText(editor, '2');
    const md = editor.getMarkdown();
    const rows = md.trim().split('\n');
    expect(rows[0]).toContain('a');
    expect(rows[0]).toContain('b');
    expect(rows[1].trim()).toMatch(/^\|?\s*:?-{3,}\s*\|?\s*:?-{3,}\s*\|?$/);
    expect(rows[2]).toContain('1');
    expect(rows[2]).toContain('2');
    editor.destroy();
  });

  it('转换后输入含竖线文本进入单元格，不触发二次转换', () => {
    const editor = makeEditor();
    editor.commands.setContent('');
    editor.commands.focus('start');
    typeText(editor, '| a | b |');
    pressEnter(editor);
    typeText(editor, '| --- | --- |');
    pressEnter(editor); // 已转换
    typeText(editor, '| 1 | 2 | 3 |'); // 键入单元格内
    // 仍是表头 + 单数据行，未新增表格外段落
    const rows = (editor.state.doc.firstChild as any).content.childCount;
    expect(rows).toBe(2);
    const table = editor.state.doc.firstChild as any;
    const dataCell = table.content.lastChild.content.firstChild;
    expect(dataCell.textContent.replace(/\s/g, '')).toBe('|1|2|3|');
    editor.destroy();
  });

  it('数据行文本按序落入数据单元格并由既有管线序列化回合法 GFM 表格', () => {
    const { editor } = typeTable(['| a | b |', '| --- | --- |', '| 1 | 2 |']);
    const md = editor.getMarkdown();
    const rows = md.trim().split('\n');
    // 表头行
    expect(rows[0]).toContain('a');
    expect(rows[0]).toContain('b');
    // 分隔行
    expect(rows[1].trim()).toMatch(/^\|?\s*:?-{3,}\s*\|?\s*:?-{3,}\s*\|?$/);
    // 数据行
    expect(rows[2]).toContain('1');
    expect(rows[2]).toContain('2');
    editor.destroy();
  });

  it('分隔行列数与表头不一致时不转换，保持普通段落', () => {
    const { editor, enterConsumed } = typeTable(['| a | b |', '| --- | --- | --- |', '| 1 | 2 | 3 |']);
    // Enter 仍被输入法消费（换行），但内容不转成表格
    expect(enterConsumed).toBe(true);
    expect(firstBlock(editor).type).toBe('paragraph');
    // 文本保持不变（列数不一致导致 parseTableInput 返回 null，无转换）
    editor.destroy();
  });

  it('分隔行缺 3 个连字符（--- 非法）时不转换', () => {
    const { editor } = typeTable(['| a | b |', '| -- | -- |', '| 1 | 2 |']);
    expect(firstBlock(editor).type).toBe('paragraph');
    editor.destroy();
  });

  it('只有表头+分隔行（无数据行）时仍转换为表格，生成一行空数据', () => {
    const { editor, enterConsumed } = typeTable(['| a | b |', '| --- | --- |']);
    expect(enterConsumed).toBe(true);
    const block = firstBlock(editor);
    expect(block.type).toBe('table');
    // 表头 1 行 + 自动生成的 1 行空数据
    const rows = (editor.state.doc.firstChild as any).content.childCount;
    expect(rows).toBe(2);
    const dataRow = (editor.state.doc.firstChild as any).content.lastChild;
    expect(dataRow.content.childCount).toBe(2); // 2 个空单元格
    expect(dataRow.content.firstChild.textContent).toBe('');
  });

  it('普通含 | 段落（单行）不被转换', () => {
    const editor = makeEditor();
    editor.commands.setContent('');
    editor.commands.focus('start');
    typeText(editor, 'foo | bar | baz');
    pressEnter(editor);
    expect(firstBlock(editor).type).toBe('paragraph');
    editor.destroy();
  });
});