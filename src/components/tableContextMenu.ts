import { CellSelection, TableMap, cellAround } from '@tiptap/pm/tables';
import type { Editor } from '@tiptap/core';
import { getEditor } from '../lib/editor.state';
import { showContextMenuStatic } from './ui/contextMenu';
import type { ContextMenuItem } from './ui/contextMenu';

/**
 * 表格单元格右键菜单（task 2.1）。
 *
 * 复用统一 `showContextMenuStatic` API，提供结构化操作（上行/下行插行、
 * 左列/右列插列、删行、删列、删表）、对齐（左/中/右）与表头行切换。
 * 所有命令经既有 chainable `editor.chain().focus().<cmd>().run()` 下发，
 * 编辑结果由既有 admission/reconcile 管道写回（spec「表格编辑适配既有安全管道」）。
 *
 * 触发作用域（当前行/列/整表）由触发位置所在单元格决定——见
 * `resolveTableScope`。
 */

export type TableAlign = 'left' | 'center' | 'right';

/** 对齐标记意图（spec: `:---` / `:---:` / `---:`）。 */
export const TABLE_ALIGN_LABELS: Record<TableAlign, string> = {
  left: '左对齐',
  center: '居中',
  right: '右对齐',
};

/** 当前触发位置对应的单元格选区；非表格内返回 null。 */
function resolveSelectionCell(editor: Editor): CellSelection | null {
  const { selection } = editor.state;
  if (selection instanceof CellSelection) return selection;
  const $around = cellAround(editor.state.selection.$from);
  if (!$around) return null;
  return new CellSelection($around, $around);
}

/**
 * 解析触发单元格所在行列（0 基行号/列号）。不在表格内时返回 null。
 *
 * 位置语义（经 probe 确认）：
 * - CellSelection.$anchorCell = 单元格节点处的 ResolvedPos；
 * - `$anchorCell.start(-1)` = 表格内容起点（相对 doc 的位置）；
 * - `TableMap.map[row*width+col]` 为「相对表格内容起点」的单元格偏移；
 * - `findCell($anchorCell.pos - tableStart)` 语义正确解析行列。
 */
export function resolveTableScope(editor: Editor): { row: number; col: number } | null {
  const cell = resolveSelectionCell(editor);
  if (!cell || !cell.$anchorCell) return null;
  const $anchor = cell.$anchorCell;
  const table = $anchor.node(-1);
  if (!table || table.type.name !== 'table') return null;
  const map = TableMap.get(table);
  const tableStart = $anchor.start(-1);
  let rect = null;
  try {
    rect = map.findCell($anchor.pos - tableStart);
  } catch {
    return null;
  }
  return { row: rect.top, col: rect.left };
}

/**
 * 将触发列全部单元格设为 `align` 属性（左/中/右）。
 * 对齐写入该列所有 `td/th`（含表头），序列化后由 `MarkdownSafeTable.renderMarkdown`
 * 输出为对齐标记行（spec: `:---` / `:---:` / `---:`）。
 */
export function setColumnAlign(editor: Editor, align: TableAlign) {
  const cell = resolveSelectionCell(editor);
  if (!cell || !cell.$anchorCell) return;
  const $anchor = cell.$anchorCell;
  const table = $anchor.node(-1);
  if (!table || table.type.name !== 'table') return;
  const map = TableMap.get(table);
  const tableStart = $anchor.start(-1);
  let anchorRect = null;
  try {
    anchorRect = map.findCell($anchor.pos - tableStart);
  } catch {
    return;
  }
  const col = anchorRect.left;
  const doc = editor.state.doc;
  const topAbs = tableStart + map.map[col];
  const bottomAbs = tableStart + map.map[map.width * (map.height - 1) + col];
  const colSel = CellSelection.colSelection(doc.resolve(topAbs), doc.resolve(bottomAbs));
  editor.view.dispatch(editor.state.tr.setSelection(colSel));
  editor.chain().focus().setCellAttribute('align', align).run();
}

/** 由表格编辑插件 `handleDOMEvents.contextmenu` 调用；命中 `td/th` 时打开菜单。 */
export function showTableContextMenu(x: number, y: number, state: TableContextMenuState) {
  // 把命中单元格设为 CellSelection，使菜单命令（增删行列/对齐）作用域
  // 与右键命中的单元格对应，而非用户当前光标所在单元格。
  selectCellFromDom(state.cell);
  const menuItems = buildTableMenuItems(state);
  showContextMenuStatic(menuItems, { x, y }, { className: 'table-context-menu' });
}

/**
 * 将命中 `<td>/<th>` 的 DOM 元素解析为单元格节点位置，并设为
 * `CellSelection`（单格选区）。任何列选区/命令因此以该格为锚点。
 * 布局未就绪或不在 editor DOM 内时静默放弃。
 */
function selectCellFromDom(cell: HTMLElement): void {
  const editor = getEditor();
  if (!editor || !cell.isConnected) return;
  const view = editor.view;
  let pos: number;
  try {
    pos = view.posAtDOM(cell, 0);
  } catch {
    return;
  }
  // CellSelection 需要一个满足 `pointsAtCell` 的 anchor：parent 是 row、
  // nodeAfter 是 cell（cellselection.ts:422）。cellAround 从命中位置向上
  // 正好返回该形状（parent=row、nodeAfter=cell），构造即成功。
  const $around = cellAround(view.state.doc.resolve(pos));
  if (!$around) return;
  if ($around.parent.type.spec.tableRole !== 'row') return;
  if (!isTableCell($around.nodeAfter)) return;
  view.dispatch(view.state.tr.setSelection(new CellSelection($around, $around)));
}

/** 判断 ResolvedPos/node 是否为表格单元格。 */
function isTableCell(node: any): boolean {
  return node?.type?.name === 'tableCell' || node?.type?.name === 'tableHeader';
}

/** 构建表格菜单项集合（供单测断言菜单项与作用域）。 */
export function buildTableMenuItems(_state: TableContextMenuState): ContextMenuItem[] {
  return [
    { label: '在上方插入行', onClick: () => dispatchTableCommand('addRowBefore') },
    { label: '在下方插入行', onClick: () => dispatchTableCommand('addRowAfter') },
    { label: '在左侧插入列', onClick: () => dispatchTableCommand('addColumnBefore') },
    { label: '在右侧插入列', onClick: () => dispatchTableCommand('addColumnAfter') },
    { divider: true },
    { label: '删除当前行', onClick: () => dispatchTableCommand('deleteRow') },
    { label: '删除当前列', onClick: () => dispatchTableCommand('deleteColumn') },
    { label: '删除表格', danger: true, onClick: () => dispatchTableCommand('deleteTable') },
    { divider: true },
    { label: TABLE_ALIGN_LABELS.left, onClick: () => dispatchAlign('left') },
    { label: TABLE_ALIGN_LABELS.center, onClick: () => dispatchAlign('center') },
    { label: TABLE_ALIGN_LABELS.right, onClick: () => dispatchAlign('right') },
    { divider: true },
    { label: '表头行', onClick: () => dispatchTableCommand('toggleHeaderRow') },
  ];
}

/** 下发结构化表格命令；经既有 chainable editor 管道。 */
function dispatchTableCommand(command: string) {
  const editor = getEditor();
  if (!editor) return;
  const chain = editor.chain().focus();
  (chain as any)[command]?.();
  chain.run();
}

function dispatchAlign(align: TableAlign) {
  const editor = getEditor();
  if (editor) setColumnAlign(editor, align);
}

export function hideTableContextMenu() {
  // `showContextMenuStatic` 负责关闭；无额外清理。
}

export interface TableContextMenuState {
  /** 命中 `td/th` 的 DOM 元素。 */
  cell: HTMLElement;
}