import { TableView, CellSelection, cellAround } from '@tiptap/pm/tables';
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
} from '@tiptap/pm/tables';
import type { EditorView } from '@tiptap/pm/view';
import type { ViewMutationRecord } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { showTableContextMenu } from '../components/tableContextMenu';

/**
 * 表格边界插入句柄（替代悬停工具条）。
 *
 * 仅显示鼠标当前所在行/列的单个 + 句柄：
 * - 行句柄：该数据行（跳过表头行）左外侧下端，点击在该行下方插行。
 * - 列句柄：该列顶部右上角，点击在该列右侧插列。
 * 鼠标移到其他行/列句柄跟随移动，移出表格隐藏（无 DOM 残留）。句柄右键
 * 弹出表格菜单，作用域由命中行/列决定。
 *
 * 内部结构：`.table-handle-host`（position:relative）包裹
 * - `.table-left-handles`（position:absolute，左 rail）
 * - `.table-top-handles`（position:absolute，上 rail）
 * - `TableView` 的 `.tableWrapper`（`inner.dom`）
 *
 * rail 内含全量句柄（DOM 结构稳定），显隐通过逐一设置 button.hidden 实现；
 * 当前行列由宿主 `mousemove` 命中的 td/th 解析。
 *
 * `contentDOM` 委托给上游 `TableView`（= tbody），不在 rails 内。
 *
 * CSS：`src/styles/editor.css`（句柄 + rail 样式）。
 */

export const TABLE_HANDLE_HOST_CLASS = 'table-handle-host';
const LEFT_RAIL_CLASS  = 'table-left-handles';
const TOP_RAIL_CLASS   = 'table-top-handles';
const ROW_HANDLE_CLASS = 'table-row-handle';
const COL_HANDLE_CLASS = 'table-column-handle';

/** 最小 NodeView 接口。 */
interface NodeViewLike {
  dom: HTMLElement;
  contentDOM: HTMLElement | null;
  update(node: PMNode): boolean;
  ignoreMutation(mutation: ViewMutationRecord): boolean;
  stopEvent?(event: Event): boolean;
  destroy?(): void;
}

/** 判断 ResolvedPos/node 是否为表格单元格。 */
function isTableCell(node: any): boolean {
  return node?.type?.name === 'tableCell' || node?.type?.name === 'tableHeader';
}

function makeHandleBtn(
  className: string,
  dataset: Record<string, string>,
  onClick: () => void,
  onContext: (e: MouseEvent) => void,
): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = '+';
  btn.setAttribute('role', 'menuitem');
  for (const [k, v] of Object.entries(dataset)) btn.dataset[k] = v;
  // 不夺焦、不触发 PM 的鼠标逻辑
  btn.addEventListener('pointerdown', e => e.preventDefault());
  btn.addEventListener('click', () => onClick());
  btn.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContext(e);
  });
  return btn;
}

export class TableHandleView implements NodeViewLike {
  dom: HTMLElement;
  contentDOM: HTMLElement | null;

  private inner: TableView;
  private host: HTMLDivElement;
  private leftRail: HTMLDivElement;
  private topRail: HTMLDivElement;
  private view: EditorView;
  private destroyed = false;

  // 跟踪当前表结构维度，update 时若维度变化则重建 rails
  private curRows = 0;
  private curCols = 0;

  constructor(node: PMNode, cellMinWidth: number, view: EditorView) {
    this.view = view;
    this.inner = new TableView(node, cellMinWidth);
    this.contentDOM = this.inner.contentDOM;

    this.host = document.createElement('div');
    this.host.className = TABLE_HANDLE_HOST_CLASS;

    this.leftRail = document.createElement('div');
    this.leftRail.className = LEFT_RAIL_CLASS;
    this.leftRail.hidden = true;
    this.leftRail.setAttribute('role', 'menu');

    this.topRail = document.createElement('div');
    this.topRail.className = TOP_RAIL_CLASS;
    this.topRail.hidden = true;
    this.topRail.setAttribute('role', 'menu');

    this.buildRails(node);

    this.host.appendChild(this.leftRail);
    this.host.appendChild(this.topRail);
    this.host.appendChild(this.inner.dom);
    this.dom = this.host;

    this.host.addEventListener('mousemove', this.onHostMouseMove);
    this.host.addEventListener('mouseleave', this.hideRails);
  }

  /**
   * 按表格结构（行/列数）构造 leftRail / topRail 的全量句柄。
   * 表头行（index 0）不设行句柄；列句柄 = colCount + 1（左边缘 + 列间 + 右边缘）。
   * 全部句柄初始隐藏，mousemove 时只显示当前行/列对应的那一个。
   */
  private buildRails(node: PMNode) {
    this.leftRail.replaceChildren();
    this.topRail.replaceChildren();

    const rows = node.childCount;
    const cols = rows > 0 ? node.child(0).childCount : 0;
    this.curRows = rows;
    this.curCols = cols;

    // 行句柄：从第 1 行（首个数据行）开始，初始隐藏
    for (let r = 1; r < rows; r++) {
      const btn = makeHandleBtn(ROW_HANDLE_CLASS, { row: String(r) },
        () => this.insertRow(r),
        e => this.showRowContextMenu(e, r),
      );
      btn.hidden = true;
      this.leftRail.appendChild(btn);
    }
    // 列句柄：cols+1 条分界线（b=0 左边缘 … b=cols 右边缘），初始隐藏
    for (let b = 0; b <= cols; b++) {
      const btn = makeHandleBtn(COL_HANDLE_CLASS, { col: String(b) },
        () => this.insertColumn(b),
        e => this.showColContextMenu(e, b),
      );
      btn.hidden = true;
      this.topRail.appendChild(btn);
    }
  }

  // ── 行插入：选中 row=r 的某格 → addRowAfter ────────────────────

  private insertRow(r: number) {
    const cellEl = this.getCellAt(r, 0);
    if (!cellEl || !this.selectFromDom(cellEl)) return;
    this.view.focus();
    addRowAfter(this.view.state, this.view.dispatch);
  }

  // ── 列插入：boundary b → addColumnBefore(b=0) / addColumnAfter(b-1) ─

  private insertColumn(b: number) {
    // 列句柄 b 的锚点列：b==0 → col 0（插左）；b>=1 → col b-1（插右）
    const col = Math.max(b - 1, 0);
    const cellEl = this.getCellAt(0, col);
    if (!cellEl || !this.selectFromDom(cellEl)) return;
    this.view.focus();
    if (b === 0) {
      addColumnBefore(this.view.state, this.view.dispatch);
    } else {
      addColumnAfter(this.view.state, this.view.dispatch);
    }
  }

  // ── 行句柄右键菜单：scope 到该行第一个格 ───────────────────────────

  private showRowContextMenu(e: MouseEvent, r: number) {
    const cellEl = this.getCellAt(r, 0);
    if (cellEl) this.selectFromDom(cellEl);
    showTableContextMenu(e.clientX, e.clientY, { cell: e.target as HTMLElement });
  }

  // ── 列句柄右键菜单：scope 到该列首个格 ───────────────────────────

  private showColContextMenu(e: MouseEvent, b: number) {
    const col = Math.max(b - 1, 0);
    const cellEl = this.getCellAt(0, col);
    if (cellEl) this.selectFromDom(cellEl);
    showTableContextMenu(e.clientX, e.clientY, { cell: e.target as HTMLElement });
  }

  // ── 从 host 的 <table> 取指定行列的 <td>/<th> DOM ─────────────────────

  private getCellAt(row: number, col: number): HTMLElement | null {
    try {
      const trs = this.host.querySelectorAll('tr');
      const tr = trs[row];
      if (!tr) return null;
      const cells = tr.querySelectorAll('td, th');
      return (cells[col] as HTMLElement) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * 将命中 <td>/<th> 的 DOM 元素解析为单元格节点位置，并设为
   * CellSelection（单格选区）——与 tableContextMenu.selectCellFromDom
   * 等价，但直接使用本 view（不依赖全局 getEditor()）。
   */
  private selectFromDom(cell: HTMLElement): boolean {
    let pos: number;
    try {
      pos = this.view.posAtDOM(cell, 0);
    } catch {
      return false;
    }
    const $around = cellAround(this.view.state.doc.resolve(pos));
    if (!$around) return false;
    if ($around.parent.type.spec.tableRole !== 'row') return false;
    if (!isTableCell($around.nodeAfter)) return false;
    this.view.dispatch(this.view.state.tr.setSelection(new CellSelection($around, $around)));
    return true;
  }

  // ── 显隐 + 跟随当前行/列 ──────────────────────────────────────────

  /**
   * mousemove：解析命中单元格所在行列，只显示对应行/列句柄并定位。
   * 未命中表格单元格（如单元格间 padding）时保持当前可见态不变。
   */
  private onHostMouseMove = (e: MouseEvent) => {
    if (this.destroyed) return;
    const hit = e.target as HTMLElement;
    const cell = hit.closest('td, th') as HTMLElement | null;
    if (!cell) return;
    const row = this.indexOfRow(cell);
    if (row === null) return;
    const col = this.indexOfCell(cell);
    this.reveal(row, col);
  };

  /** 命中 td/th 所在 tableRow 的 0 基行号；表头行返回 0。 */
  private indexOfRow(cell: HTMLElement): number | null {
    const tr = cell.closest('tr');
    if (!tr) return null;
    const trs = Array.from(this.host.querySelectorAll('tr'));
    return trs.indexOf(tr);
  }

  /** 命中 td/th 所在单元格的 0 基列号。 */
  private indexOfCell(cell: HTMLElement): number {
    const cells = Array.from(cell.parentElement?.querySelectorAll('td, th') ?? []);
    return cells.indexOf(cell);
  }

  /**
   * 只显示 row 对应行句柄（数据行）与 col 对应列句柄，其余全部隐藏，
   * 并把两个句柄定位于「行左下角 / 列顶部右上角」。
   */
  private reveal(row: number, col: number) {
    this.leftRail.hidden = false;
    this.topRail.hidden = false;

    const rowBtns = Array.from(this.leftRail.querySelectorAll('.' + ROW_HANDLE_CLASS)) as HTMLElement[];
    for (const btn of rowBtns) {
      // 行句柄 data-row 是从表头行(index 0)之后的数据行起，0 基行号 r ⇔ btn data-row = r
      btn.hidden = !(btn.dataset.row === String(row));
    }
    const colBtns = Array.from(this.topRail.querySelectorAll('.' + COL_HANDLE_CLASS)) as HTMLElement[];
    for (const btn of colBtns) {
      btn.hidden = !(btn.dataset.col === String(col));
    }

    this.positionRowHandle(row, rowBtns);
    this.positionColHandle(col, colBtns);
  }

  /** 行句柄定位于该行左外侧、与下边框线齐平（行「下端」）。 */
  private positionRowHandle(row: number, rowBtns: HTMLElement[]) {
    const btn = rowBtns.find(b => b.dataset.row === String(row));
    if (!btn) return;
    const tr = this.host.querySelectorAll('tr')[row];
    if (!tr) return;
    const hostRect = this.host.getBoundingClientRect();
    const r = tr.getBoundingClientRect();
    btn.style.position = 'absolute';
    btn.style.left = '-16px';
    btn.style.top = `${r.bottom - hostRect.top}px`;
    btn.style.transform = 'translateY(-50%)';
  }

  /** 列句柄定位于该列顶部右上角（分界线 b 右侧的列 b，浮于表格右上缘）。 */
  private positionColHandle(col: number, colBtns: HTMLElement[]) {
    // 列句柄 data-col=b 对应「在 b 右侧插列」的分界线；鼠标在该列(col)时显示 col 列句柄
    const btn = colBtns.find(b => b.dataset.col === String(col));
    if (!btn) return;
    const ths = this.host.querySelectorAll('tr')[0]?.querySelectorAll('th') ?? [];
    if (col >= ths.length) return;
    const hostRect = this.host.getBoundingClientRect();
    const th = ths[col];
    const rect = th.getBoundingClientRect();
    btn.style.position = 'absolute';
    btn.style.top = '-12px';
    btn.style.left = `${rect.right - hostRect.left}px`; // 右上角
    btn.style.transform = 'translateX(-50%)';
  }

  private hideRails = () => {
    if (!this.destroyed) {
      this.leftRail.hidden = true;
      this.topRail.hidden = true;
      // 同 rail 内所有句柄一并隐藏，避免按钮残留可见态（rail 已隐藏，但显隐状态保持一致）
      for (const btn of Array.from(this.leftRail.querySelectorAll('.' + ROW_HANDLE_CLASS))) {
        (btn as HTMLElement).hidden = true;
      }
      for (const btn of Array.from(this.topRail.querySelectorAll('.' + COL_HANDLE_CLASS))) {
        (btn as HTMLElement).hidden = true;
      }
    }
  };

  // ── NodeView 接口 ──────────────────────────────────────────────────

  update(node: PMNode): boolean {
    // 维度变化时重建 rails（保持当前可见句柄）
    const rows = node.childCount;
    const cols = rows > 0 ? node.child(0).childCount : 0;
    if (rows !== this.curRows || cols !== this.curCols) {
      const rowBtns = Array.from(this.leftRail.querySelectorAll('.' + ROW_HANDLE_CLASS)) as HTMLElement[];
      const colBtns = Array.from(this.topRail.querySelectorAll('.' + COL_HANDLE_CLASS)) as HTMLElement[];
      const visRow = rowBtns.find(b => !b.hidden)?.dataset.row;
      const visCol = colBtns.find(b => !b.hidden)?.dataset.col;
      this.buildRails(node);
      if (visRow !== undefined && visCol !== undefined && !this.leftRail.hidden) {
        this.reveal(Number(visRow), Number(visCol));
      }
    }
    return this.inner.update(node);
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (this.leftRail.contains(mutation.target as Node)) return true;
    if (this.topRail.contains(mutation.target as Node)) return true;
    return this.inner.ignoreMutation(mutation);
  }

  stopEvent(event: Event): boolean {
    if (this.leftRail.contains(event.target as Node)) return true;
    if (this.topRail.contains(event.target as Node)) return true;
    return false;
  }

  destroy(): void {
    this.destroyed = true;
    this.host.removeEventListener('mousemove', this.onHostMouseMove);
    this.host.removeEventListener('mouseleave', this.hideRails);
    // 上游 TableView 无 destroy()（NodeView 接口可选）；宿主 DOM 由 ProseMirror 在
    // view destroy 时统一摘除，只需清理自身监听器。
  }
}