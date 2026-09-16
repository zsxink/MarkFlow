import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { MarkdownSafeTable } from './editor.extensions';
import { createMarkdownExtension } from './editor.init';
import { buildTableMenuItems, resolveTableScope, setColumnAlign, showTableContextMenu, TABLE_ALIGN_LABELS } from '../components/tableContextMenu';
import { CellSelection, TableMap } from '@tiptap/pm/tables';

const mocks = vi.hoisted(() => ({
  getEditor: vi.fn(() => null),
  showContextMenuStatic: vi.fn(),
  store: { on: vi.fn(), off: vi.fn() },
  renderMermaid: vi.fn(),
  renderPlantUml: vi.fn(),
  showMermaidContextMenu: vi.fn(),
  showPlantumlContextMenu: vi.fn(),
}));
vi.mock('./editor.state', () => ({
  getEditor: mocks.getEditor,
  getMermaidExportBaseName: vi.fn(),
  getPlantUmlExportBaseName: vi.fn(),
}));
vi.mock('../components/ui/contextMenu', () => ({ showContextMenuStatic: mocks.showContextMenuStatic }));
vi.mock('./store', () => ({ store: mocks.store }));
vi.mock('./mermaid', () => ({ renderMermaid: mocks.renderMermaid }));
vi.mock('./plantuml', () => ({ renderPlantUml: mocks.renderPlantUml }));
vi.mock('./plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) }));
vi.mock('../components/mermaidContextMenu', () => ({ showMermaidContextMenu: mocks.showMermaidContextMenu }));
vi.mock('../components/plantumlContextMenu', () => ({ showPlantumlContextMenu: mocks.showPlantumlContextMenu }));
vi.mock('./logger', () => ({ logDebug: vi.fn(), logWarn: vi.fn(), logException: vi.fn() }));
vi.mock('./storage', () => ({
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
}));

function makeEditor() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
      MarkdownSafeTable.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      createMarkdownExtension(),
    ],
  });
  // 供 `showTableContextMenu` 的 posAtDOM 命中测试使用；真实 editor 本就挂载在文档流。
  (editor as any).__host = host;
  return editor;
}

/** 拆除 editor 并移除挂载宿主，避免 DOM 泄漏。 */
function disposeEditor(editor: Editor) {
  editor.destroy();
  (editor as any).__host?.remove();
}

/** 载入一个 2 表头 + 数据行的 3 列 GFM 表格。 */
function loadTable(editor: Editor) {
  editor.commands.setContent(
    '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |',
    { contentType: 'markdown' },
  );
}

/** 光标放进第 row 行第 col 列单元格内的段落文本里。 */
function cursorInCell(editor: Editor, row: number, col: number) {
  const doc = editor.state.doc;
  const table = doc.child(0) as any;
  const map = TableMap.get(table);
  const contentStart = 1; // table at docPos 0
  const cellAbs = contentStart + map.map[map.width * row + col];
  // 单元格节点开启位置 = cellAbs；其内容（paragraph）在 cellAbs + 1
  editor.commands.setTextSelection(cellAbs + 1);
}

describe('tableContextMenu (task 2.1)', () => {
  beforeEach(() => {
    mocks.showContextMenuStatic.mockClear();
  });

  it('菜单项集合含结构化操作、对齐与表头切换', () => {
    const items = buildTableMenuItems({ cell: document.createElement('td') });
    const labels = items.map(item => item.label).filter(Boolean);
    expect(labels).toContain('在上方插入行');
    expect(labels).toContain('在下方插入行');
    expect(labels).toContain('在左侧插入列');
    expect(labels).toContain('在右侧插入列');
    expect(labels).toContain('删除当前行');
    expect(labels).toContain('删除当前列');
    expect(labels).toContain('删除表格');
    expect(labels).toContain(TABLE_ALIGN_LABELS.left);
    expect(labels).toContain(TABLE_ALIGN_LABELS.center);
    expect(labels).toContain(TABLE_ALIGN_LABELS.right);
    expect(labels).toContain('表头行');
    expect(items.filter(item => item.divider).length).toBeGreaterThanOrEqual(2);
    expect(items.find(item => item.label === '删除表格')?.danger).toBe(true);
  });

  it('作用域解析返回触发单元格所在行列（数据格）', () => {
    const editor = makeEditor();
    loadTable(editor);
    cursorInCell(editor, 1, 1);
    expect(resolveTableScope(editor)).toEqual({ row: 1, col: 1 });
    disposeEditor(editor);
  });

  it('表头单元格解析为 row 0', () => {
    const editor = makeEditor();
    loadTable(editor);
    cursorInCell(editor, 0, 2);
    expect(resolveTableScope(editor)).toEqual({ row: 0, col: 2 });
    disposeEditor(editor);
  });

  it('非表格光标解析为 null', () => {
    const editor = makeEditor();
    editor.commands.setContent('plain text', { contentType: 'markdown' });
    editor.commands.setTextSelection(1);
    expect(resolveTableScope(editor)).toBeNull();
    disposeEditor(editor);
  });

  it('对齐命令写入触发列的 align 属性并序列化为对齐标记', () => {
    const editor = makeEditor();
    loadTable(editor);
    // 让 getEditor 返回该 editor，以驱动 setColumnAlign 的内部 getEditor 链路
    mocks.getEditor.mockReturnValue(editor as any);
    cursorInCell(editor, 1, 1); // 第 2 列
    setColumnAlign(editor, 'center');
    const markdown = editor.getMarkdown();
    // 第 2 列对齐标记应为 :---:
    const lines = markdown.trim().split('\n');
    const delimiter = lines[1];
    expect(delimiter).toContain(':---:');
    // 其余列保持默认（第一列与第三列为 ---）
    expect(delimiter).toBe('| --- | :---: | --- |');
    disposeEditor(editor);
  });

  it('右键命中单元格设为 CellSelection，作用域跟随命中格而非光标格', () => {
    const editor = makeEditor();
    loadTable(editor);
    mocks.getEditor.mockReturnValue(editor as any);
    // 光标放在 (1,1) B 列（与右键命中的 C 列不同）。
    cursorInCell(editor, 1, 1);
    // 从渲染 DOM 取第 3 列数据格（内容 "6" 所在 td）。
    const view = editor.view as any;
    const tds = Array.from(view.dom.querySelectorAll('td')) as HTMLElement[];
    const cellC = tds.find(td => td.textContent?.includes('6'))!;
    expect(cellC).toBeTruthy();
    // 模拟右键打开菜单：命中 C 格 DOM。
    showTableContextMenu(10, 10, { cell: cellC });
    // 选区已移到命中格：作用域解析为 C 列（col 2）。
    expect(resolveTableScope(editor)).toEqual({ row: 2, col: 2 });
    expect(editor.state.selection instanceof CellSelection).toBe(true);
    disposeEditor(editor);
  });

  it('右键命中后删除行只删命中格所在行，而非光标所在行', () => {
    const editor = makeEditor();
    loadTable(editor);
    mocks.getEditor.mockReturnValue(editor as any);
    cursorInCell(editor, 1, 1); // 光标在 B 列 data 行（row1）
    const view = editor.view as any;
    const tds = Array.from(view.dom.querySelectorAll('td')) as HTMLElement[];
    const cellC = tds.find(td => td.textContent?.includes('6'))!; // row2
    showTableContextMenu(10, 10, { cell: cellC });
    // 右键命中后，菜单的删除行命令作用于命中的 row 2（含 "6"），而非光标 row 1（含 "3"）。
    const items = buildTableMenuItems({ cell: cellC });
    const deleteRowItem = items.find(i => i.label === '删除当前行')!;
    deleteRowItem.onClick!();
    const md = editor.getMarkdown();
    expect(md).not.toContain('6'); // row 2（C 列 data）被删
    expect(md).toContain('3');     // row 1 保留
    disposeEditor(editor);
  });
});