import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { MarkdownSafeTable, SafeParagraph } from './editor.extensions';
import { createMarkdownExtension } from './editor.init';
import { tablePlugin } from './editor.table';
import { TableHandleView } from './editor.table-handles';

const mocks = vi.hoisted(() => ({
  showTableContextMenu: vi.fn(),
  showContextMenuStatic: vi.fn(),
  store: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('../components/tableContextMenu', () => ({
  showTableContextMenu: mocks.showTableContextMenu,
  hideTableContextMenu: vi.fn(),
  buildTableMenuItems: vi.fn(() => [{ label: 'x' }]),
}));
vi.mock('../components/ui/contextMenu', () => ({ showContextMenuStatic: mocks.showContextMenuStatic }));
vi.mock('./store', () => ({ store: mocks.store }));
vi.mock('./mermaid', () => ({ renderMermaid: vi.fn() }));
vi.mock('./plantuml', () => ({ renderPlantUml: vi.fn() }));
vi.mock('./plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) }));
vi.mock('../components/mermaidContextMenu', () => ({ showMermaidContextMenu: vi.fn() }));
vi.mock('../components/plantumlContextMenu', () => ({ showPlantumlContextMenu: vi.fn() }));
vi.mock('./logger', () => ({ logDebug: vi.fn(), logWarn: vi.fn(), logException: vi.fn() }));
vi.mock('./editor.state', () => ({
  getEditor: vi.fn(() => null),
  getMermaidExportBaseName: vi.fn(),
  getPlantUmlExportBaseName: vi.fn(),
}));
vi.mock('./storage', () => ({ getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })) }));

function makeEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
      SafeParagraph,
      MarkdownSafeTable.configure({ resizable: true, View: TableHandleView }),
      TableRow,
      TableCell,
      TableHeader,
      tablePlugin(),
      createMarkdownExtension(),
    ],
  });
}

/** 构造一个落在 td 上的 contextmenu 事件并交给 view pipeline。 */
function fireContextMenu(editor: Editor, target: HTMLElement): boolean {
  const view = editor.view as any;
  return view.someProp('handleDOMEvents', (handlers: any) => {
    const handler = handlers?.contextmenu;
    if (!handler) return false;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 20 });
    Object.defineProperty(event, 'target', { value: target });
    return handler(view, event) === true;
  });
}

describe('tablePlugin (task 2.2)', () => {
  beforeEach(() => {
    mocks.showTableContextMenu.mockClear();
  });

  it('右键默认视图内 td 弹出表格菜单并 preventDefault/stopPropagation', () => {
    const showTableContextMenu = mocks.showTableContextMenu;
    showTableContextMenu.mockClear();
    const editor = makeEditor();
    editor.commands.setContent('| A | B |\n| --- | --- |\n| 1 | 2 |', { contentType: 'markdown' });

    // 找文档内容实际渲染的 td
    const view = editor.view as any;
    const td = view.dom.querySelector('td');
    expect(td).toBeTruthy();

    const prevented = fireContextMenu(editor, td as HTMLElement);
    expect(prevented).toBe(true);
    expect(showTableContextMenu).toHaveBeenCalledWith(10, 20, expect.objectContaining({ cell: td }));
    editor.destroy();
  });

  it('右键 th 同样触发', () => {
    const showTableContextMenu = mocks.showTableContextMenu;
    showTableContextMenu.mockClear();
    const editor = makeEditor();
    editor.commands.setContent('| A | B |\n| --- | --- |\n| 1 | 2 |', { contentType: 'markdown' });
    const view = editor.view as any;
    const th = view.dom.querySelector('th');
    expect(th).toBeTruthy();
    const prevented = fireContextMenu(editor, th as HTMLElement);
    expect(prevented).toBe(true);
    expect(showTableContextMenu).toHaveBeenCalledTimes(1);
    editor.destroy();
  });

  it('右键普通段落不弹出表格菜单', () => {
    const showTableContextMenu = mocks.showTableContextMenu;
    showTableContextMenu.mockClear();
    const editor = makeEditor();
    editor.commands.setContent('hello world', { contentType: 'markdown' });
    const view = editor.view as any;
    const p = view.dom.querySelector('p');
    expect(p).toBeTruthy();
    const prevented = fireContextMenu(editor, p as HTMLElement);
    expect(prevented).toBeFalsy();
    expect(showTableContextMenu).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('右键行句柄弹出菜单且作用域为该行首格（不触发 PM 插件重复弹）', () => {
    const showTableContextMenu = mocks.showTableContextMenu;
    showTableContextMenu.mockClear();
    const editor = makeEditor();
    editor.commands.setContent('| A | B |\n| --- | --- |\n| 1 | 2 |', { contentType: 'markdown' });
    const view = editor.view as any;
    const host = view.dom.querySelector('.table-handle-host') as HTMLElement;
    const rowHandle = Array.from(host.querySelectorAll('.table-row-handle'))
      .find(el => (el as HTMLElement).dataset.row === '1') as HTMLElement;
    expect(rowHandle).toBeTruthy();

    // 句柄自带 contextmenu 处理器：阻止默认/冒泡并弹菜单
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 20 });
    (rowHandle as HTMLElement).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    // NodeView 自身调用 showTableContextMenu；PM 插件因 stopPropagation 未命中
    expect(showTableContextMenu).toHaveBeenCalledTimes(1);
    expect(showTableContextMenu).toHaveBeenCalledWith(10, 20, expect.objectContaining({ cell: rowHandle }));
    editor.destroy();
  });

  it('右键列句柄弹出菜单且作用域为该列首格（data-col 语义）', () => {
    const showTableContextMenu = mocks.showTableContextMenu;
    showTableContextMenu.mockClear();
    const editor = makeEditor();
    editor.commands.setContent('| A | B |\n| --- | --- |\n| 1 | 2 |', { contentType: 'markdown' });
    const view = editor.view as any;
    const host = view.dom.querySelector('.table-handle-host') as HTMLElement;
    const colHandle = Array.from(host.querySelectorAll('.table-column-handle'))
      .find(el => (el as HTMLElement).dataset.col === '1') as HTMLElement;
    expect(colHandle).toBeTruthy();

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 });
    (colHandle as HTMLElement).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(showTableContextMenu).toHaveBeenCalledTimes(1);
    expect(showTableContextMenu).toHaveBeenCalledWith(30, 40, expect.objectContaining({ cell: colHandle }));
    editor.destroy();
  });
});