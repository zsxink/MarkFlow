import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { MarkdownSafeTable, SafeParagraph } from './editor.extensions';
import { createMarkdownExtension } from './editor.init';
import { TableHandleView, TABLE_HANDLE_HOST_CLASS } from './editor.table-handles';

const mocks = vi.hoisted(() => ({
  renderMermaid: vi.fn(), renderPlantUml: vi.fn(),
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  store: { on: vi.fn(), off: vi.fn() },
  showMermaidContextMenu: vi.fn(), showPlantumlContextMenu: vi.fn(),
  logDebug: vi.fn(), logWarn: vi.fn(), logException: vi.fn(),
  getMermaidExportBaseName: vi.fn(), getPlantUmlExportBaseName: vi.fn(),
}));
vi.mock('./mermaid', () => ({ renderMermaid: mocks.renderMermaid }));
vi.mock('./plantuml', () => ({ renderPlantUml: mocks.renderPlantUml }));
vi.mock('./plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) }));
vi.mock('./storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
vi.mock('./store', () => ({ store: mocks.store }));
vi.mock('../components/mermaidContextMenu', () => ({ showMermaidContextMenu: mocks.showMermaidContextMenu }));
vi.mock('../components/plantumlContextMenu', () => ({ showPlantumlContextMenu: mocks.showPlantumlContextMenu }));
vi.mock('./editor.state', () => ({
  getEditor: vi.fn(() => null),
  getMermaidExportBaseName: mocks.getMermaidExportBaseName,
  getPlantUmlExportBaseName: mocks.getPlantUmlExportBaseName,
}));
vi.mock('./logger', () => ({ logDebug: mocks.logDebug, logWarn: mocks.logWarn, logException: mocks.logException }));

function makeEditor() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
      SafeParagraph,
      MarkdownSafeTable.configure({ resizable: true, View: TableHandleView }),
      TableRow,
      TableCell,
      TableHeader,
      createMarkdownExtension(),
    ],
  });
  (editor as any).__host = host;
  return editor;
}

function disposeEditor(editor: Editor) {
  editor.destroy();
  (editor as any).__host?.remove();
}

function getHost(view: any): HTMLElement {
  return view.dom.querySelector(`.${TABLE_HANDLE_HOST_CLASS}`) as HTMLElement;
}

function loadColumns(editor: Editor, header: string, rows: string[] = []) {
  const cells = header.split(',');
  const delimiter = `| ${cells.map(() => '---').join(' | ')} |`;
  editor.commands.setContent(
    `| ${cells.join(' | ')} |\n${delimiter}\n${rows.map(r => `| ${r.split(',').join(' | ')} |`).join('\n')}`,
    { contentType: 'markdown' },
  );
}

/** 列数 = 分隔行（--- 格）的单元格数；内容行会有空/空白格，不能用于计数。 */
function colCount(md: string): number {
  const lines = md.trim().split('\n');
  const delimiter = lines[1];
  return delimiter.split('|').filter(c => c.trim() !== '').length;
}

/** 收集当前可见（!hidden）的句柄按钮。 */
function visibleHandles(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll('.table-row-handle, .table-column-handle'))
    .filter(el => !(el as HTMLElement).hidden) as HTMLElement[];
}

describe('TableHandleView (边界 + 句柄)', () => {
  it('host 渲染左 rail（数据行数）与上 rail（列数+1）句柄，表头行无行句柄', () => {
    const editor = makeEditor();
    loadColumns(editor, 'A,B,C', ['1,2,3', '4,5,6']);
    const view = editor.view as any;
    const host = getHost(view);
    expect(host).toBeTruthy();
    // 结构断言：行句柄 = 数据行数（不含表头），列句柄 = 列数 + 1（分界线）
    const rowHandles = host.querySelectorAll('.table-row-handle');
    const colHandles = host.querySelectorAll('.table-column-handle');
    expect(rowHandles.length).toBe(2); // 2 data rows
    expect(colHandles.length).toBe(4); // 3 cols + right edge
    // 表头行不设行句柄：首个 row handle 的 data-row 为 1
    expect((rowHandles[0] as HTMLElement).dataset.row).toBe('1');
    disposeEditor(editor);
  });

  it('初始全部隐藏；mousemove 到某行某列只显示该行/列句柄', () => {
    const editor = makeEditor();
    loadColumns(editor, 'A,B', ['1,2', '3,4']);
    const view = editor.view as any;
    const host = getHost(view);
    expect(visibleHandles(host).length).toBe(0);
    // 命中 (row=1, col=0) 单元格，列句柄应显示最左列前置分界 b=0
    const target = host.querySelectorAll('tr')[1].querySelector('td') as HTMLElement;
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    const visible = visibleHandles(host);
    expect(visible.length).toBe(2); // 行句柄 + 列句柄
    expect(visible.some(el => el.classList.contains('table-row-handle') && el.dataset.row === '1')).toBe(true);
    expect(visible.some(el => el.classList.contains('table-row-handle') && el.dataset.row === '2')).toBe(false);
    expect(visible.some(el => el.classList.contains('table-column-handle') && el.dataset.col === '0')).toBe(true);
    expect(visible.some(el => el.classList.contains('table-column-handle') && el.dataset.col === '1')).toBe(false);
    expect(visible.some(el => el.classList.contains('table-column-handle') && el.dataset.col === '2')).toBe(false);
    disposeEditor(editor);
  });

  it('mousemove 移到其他行/列句柄跟随，mouseleave 全部隐藏', () => {
    const editor = makeEditor();
    loadColumns(editor, 'A,B', ['1,2', '3,4']);
    const view = editor.view as any;
    const host = getHost(view);
    // 移到第 2 行第 1 列（末列），列句柄显示右边缘 b=2
    const cell21 = host.querySelectorAll('tr')[2].querySelectorAll('td')[1] as HTMLElement;
    cell21.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    const visible = visibleHandles(host);
    expect(visible.length).toBe(2);
    expect(visible.some(el => el.classList.contains('table-row-handle') && el.dataset.row === '2')).toBe(true);
    expect(visible.some(el => el.classList.contains('table-column-handle') && el.dataset.col === '2')).toBe(true);
    // mouseleave 隐藏
    host.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(visibleHandles(host).length).toBe(0);
    disposeEditor(editor);
  });

  it('行句柄定位于该行左外侧下端（-16px、absolute、translateY 居中）', () => {
    const editor = makeEditor();
    loadColumns(editor, 'A,B', ['1,2']);
    const view = editor.view as any;
    const host = getHost(view);
    const cell = host.querySelectorAll('tr')[1].querySelector('td') as HTMLElement;
    cell.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    const rowHandle = Array.from(host.querySelectorAll('.table-row-handle'))
      .find(el => (el as HTMLElement).dataset.row === '1' && !(el as HTMLElement).hidden) as HTMLElement;
    expect(rowHandle).toBeTruthy();
    expect(rowHandle.style.position).toBe('absolute');
    expect(rowHandle.style.left).toBe('-16px');
    disposeEditor(editor);
  });

  it('点击第 r 行行句柄在其下方插行，内容保留', () => {
    const editor = makeEditor();
    loadColumns(editor, 'A,B', ['1,2', '3,4']);
    const view = editor.view as any;
    const host = getHost(view);
    const rowHandle = Array.from(host.querySelectorAll('.table-row-handle'))
      .find(el => (el as HTMLElement).dataset.row === '1') as HTMLElement;
    expect(rowHandle).toBeTruthy();
    rowHandle.click();
    const md = editor.getMarkdown();
    const dataRows = md.trim().split('\n').slice(2).filter(r => r.trim());
    expect(dataRows.length).toBe(3); // 原 2 行 + 新增 1 行
    expect(dataRows[0]).toContain('1');
    expect(dataRows[2]).toContain('3');
    expect(dataRows[1]).toContain('|'); // 新增空行落在 row1 下方
    disposeEditor(editor);
  });

  it('点击第 0 列分界句柄在最左新增列', () => {
    const editor = makeEditor();
    loadColumns(editor, 'A,B', ['1,2']);
    const view = editor.view as any;
    const host = getHost(view);
    const colHandle = Array.from(host.querySelectorAll('.table-column-handle'))
      .find(el => (el as HTMLElement).dataset.col === '0') as HTMLElement;
    colHandle.click();
    const md = editor.getMarkdown();
    const header = md.trim().split('\n')[0];
    expect(header).toContain('A');
    expect(header).toContain('B');
    // 新增一列：分隔行列数从 2 → 3
    expect(colCount(md)).toBe(3);
    disposeEditor(editor);
  });

  it('点击中间分界句柄在其右侧新增列', () => {
    const editor = makeEditor();
    loadColumns(editor, 'A,B,C', ['1,2,3']);
    const view = editor.view as any;
    const host = getHost(view);
    const colHandle = Array.from(host.querySelectorAll('.table-column-handle'))
      .find(el => (el as HTMLElement).dataset.col === '1') as HTMLElement; // A|B 之间
    colHandle.click();
    const md = editor.getMarkdown();
    const header = md.trim().split('\n')[0];
    // A 右侧新增空列，A,B,C 顺序保留
    expect(header).toContain('A');
    expect(header).toContain('B');
    expect(header).toContain('C');
    expect(colCount(md)).toBe(4);
    disposeEditor(editor);
  });

  it('点击右边缘分界句柄在末尾追加列', () => {
    const editor = makeEditor();
    loadColumns(editor, 'A,B', ['1,2']);
    const view = editor.view as any;
    const host = getHost(view);
    const colHandle = Array.from(host.querySelectorAll('.table-column-handle'))
      .find(el => (el as HTMLElement).dataset.col === '2') as HTMLElement; // 右边缘
    colHandle.click();
    const md = editor.getMarkdown();
    const header = md.trim().split('\n')[0];
    expect(header).toContain('A');
    expect(header).toContain('B');
    expect(colCount(md)).toBe(3);
    disposeEditor(editor);
  });

  it('destroy 后无 DOM 残留', () => {
    const editor = makeEditor();
    loadColumns(editor, 'A,B');
    const view = editor.view as any;
    const host = getHost(view);
    expect(host.isConnected).toBe(true);
    disposeEditor(editor);
    expect(host.isConnected).toBe(false);
  });
});