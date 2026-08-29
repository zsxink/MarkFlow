/**
 * P4B task 7.2a — executable rows from
 * adr-typora-structural-interaction-matrix.md.
 *
 * The harness uses the product extension stack. Each row freezes source before
 * and after, the changed source interval, selectionAfter, and one Undo group.
 * Table rows are intentionally fixture-only: P4B has no table widget.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { undo } from '@codemirror/commands';
import { type Transaction } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import {
  createLosslessSourceEditor,
  type LosslessSourceEditorHandle,
} from './losslessSourceEditor';
import { FROZEN_TABLE_INTERACTION_FIXTURES } from './structuralInteraction';
import {
  isHeadingStrongEnabled,
  isQuoteListsEnabled,
  resetAllCohortFlags,
  setP4bFlagEnabled,
} from './cohortFlags';

type Key = 'Enter' | 'Backspace' | 'Delete' | 'Tab' | 'Shift-Tab' | 'ArrowLeft' | 'ArrowRight';

interface Harness {
  readonly view: EditorView;
  readonly before: string;
  readonly txs: Transaction[];
  press(key: Key): boolean;
  doc(): string;
  destroy(): void;
}

const open: Harness[] = [];

function harness(source: string, pos: number, readOnly = false): Harness {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const txs: Transaction[] = [];
  const handle: LosslessSourceEditorHandle = createLosslessSourceEditor(parent, source, {
    readOnly,
    onTransaction(transactions) {
      txs.push(...transactions);
    },
  });
  handle.view.dispatch({ selection: { anchor: pos } });
  const result: Harness = {
    view: handle.view,
    before: source,
    txs,
    press(key) {
      const eventInit = key === 'Shift-Tab'
        ? { key: 'Tab', shiftKey: true, cancelable: true }
        : { key, cancelable: true };
      return runScopeHandlers(
        handle.view,
        new KeyboardEvent('keydown', eventInit),
        'editor',
      );
    },
    doc: () => handle.view.state.doc.toString(),
    destroy: () => handle.destroy(),
  };
  open.push(result);
  return result;
}

function changedRanges(tx: Transaction): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  tx.changes.iterChanges((fromA, toA) => ranges.push([fromA, toA]));
  return ranges;
}

function expectRow(
  name: string,
  source: string,
  pos: number,
  key: Key,
  after: string,
  affected: Array<[number, number]>,
  selectionAfter: number,
) {
  it(name, () => {
    const h = harness(source, pos);
    expect(h.press(key)).toBe(true);
    expect(h.doc()).toBe(after);
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual(affected);
    expect(h.view.state.selection.main).toMatchObject({ anchor: selectionAfter, head: selectionAfter });

    // Every ADR command is one isolated CodeMirror History group and Undo
    // restores both the exact source and the pre-command source selection.
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
    expect(h.view.state.selection.main).toMatchObject({ anchor: pos, head: pos });
  });
}

describe('P4B structural interaction ADR matrix (task 7.2a)', () => {
  beforeEach(() => {
    // The production defaults remain OFF. This harness is the opt-in cohort
    // evidence for the two structural source command gates.
    setP4bFlagEnabled('headingStrong', true);
    setP4bFlagEnabled('quoteLists', true);
  });

  afterEach(() => {
    resetAllCohortFlags();
    while (open.length) open.pop()!.destroy();
    document.body.innerHTML = '';
  });

  // Heading §2
  expectRow('heading Enter at contentStart creates a preceding paragraph', '# title', 2, 'Enter', '\n# title', [[0, 0]], 0);
  expectRow('heading Enter in content splits to a paragraph suffix', '# title', 4, 'Enter', '# ti\ntle', [[4, 4]], 5);
  expectRow('heading Enter at contentEnd appends a plain paragraph', '# title', 7, 'Enter', '# title\n', [[7, 7]], 8);
  expectRow('empty heading Enter removes only the heading marker', '# ', 2, 'Enter', '', [[0, 2]], 0);
  expectRow('heading Backspace at contentStart removes marker and separator', '# title', 2, 'Backspace', 'title', [[0, 2]], 0);
  expectRow('heading Backspace away from contentStart uses source deletion', '# title', 4, 'Backspace', '# ttle', [[3, 4]], 3);
  expectRow('closing ATX heading Enter at contentStart inserts a preceding paragraph and retains the whole heading', '# title #', 2, 'Enter', '\n# title #', [[0, 0]], 0);
  expectRow('closing ATX heading Enter in semantic content keeps closing syntax on the heading prefix', '# title #', 4, 'Enter', '# ti #\ntle', [[4, 9]], 7);
  expectRow('closing ATX heading Enter at semantic contentEnd appends a paragraph after the complete heading', '# title #', 7, 'Enter', '# title #\n', [[9, 9]], 10);
  expectRow('empty closing ATX heading Enter removes the complete heading syntax', '# #', 2, 'Enter', '', [[0, 3]], 0);
  expectRow('closing ATX heading Backspace at contentStart removes opening and closing syntax together', '# title #', 2, 'Backspace', 'title', [[0, 2], [7, 9]], 0);

  // Ordered, unordered, task and nested list §3.
  expectRow('list Enter in content creates one same-level item', '- alpha', 4, 'Enter', '- al\n- pha', [[4, 4]], 7);
  expectRow('list Enter at contentEnd creates an empty same-level item', '- alpha', 7, 'Enter', '- alpha\n- ', [[7, 7]], 10);
  expectRow('ordered list Enter uses only the new item next ordinal', '3. alpha', 8, 'Enter', '3. alpha\n4. ', [[8, 8]], 12);
  expectRow('multi-digit ordered list preserves marker family and increments only the new item', '10. alpha', 9, 'Enter', '10. alpha\n11. ', [[9, 9]], 14);
  expectRow('task list Enter creates an unchecked sibling without rewriting source', '- [x] alpha', 11, 'Enter', '- [x] alpha\n- [ ] ', [[11, 11]], 18);
  expectRow('empty nested list Enter outdents one level and retains its marker', '- parent\n  - ', 13, 'Enter', '- parent\n- ', [[9, 11]], 11);
  expectRow('empty top-level list Enter exits to an empty paragraph', '- ', 2, 'Enter', '', [[0, 2]], 0);
  expectRow('nested list Backspace at contentStart outdents exactly one level', '- parent\n  - child', 13, 'Backspace', '- parent\n- child', [[9, 11]], 11);
  expectRow('top-level list Backspace at contentStart becomes a paragraph', '- child', 2, 'Backspace', 'child', [[0, 2]], 0);
  expectRow('list Backspace away from contentStart is plain source deletion', '- child', 4, 'Backspace', '- cild', [[3, 4]], 3);
  expectRow('Tab indents only when a preceding sibling can become parent', '- parent\n- child', 16, 'Tab', '- parent\n  - child', [[9, 9]], 18);
  it.each([
    ['forward', 11, 14],
    ['reversed', 14, 11],
  ] as const)('nonempty %s selection Tab deletes then indents once with one Undo', (_direction, anchor, head) => {
    const source = '- parent\n- child';
    const h = harness(source, anchor);
    h.view.dispatch({ selection: { anchor, head } });
    expect(h.press('Tab')).toBe(true);
    expect(h.doc()).toBe('- parent\n  - ld');
    expect(changedRanges(h.txs[0])).toEqual([[9, 9], [11, 14]]);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 13, head: 13 });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
    expect(h.view.state.selection.main).toMatchObject({ anchor, head });
  });
  it.each([
    ['forward', 13, 16],
    ['reversed', 16, 13],
  ] as const)('nonempty %s selection Shift-Tab deletes then outdents once with one Undo', (_direction, anchor, head) => {
    const source = '- parent\n  - child';
    const h = harness(source, anchor);
    h.view.dispatch({ selection: { anchor, head } });
    expect(h.press('Shift-Tab')).toBe(true);
    expect(h.doc()).toBe('- parent\n- ld');
    expect(changedRanges(h.txs[0])).toEqual([[9, 11], [13, 16]]);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 11, head: 11 });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
    expect(h.view.state.selection.main).toMatchObject({ anchor, head });
  });
  it('selection Tab moves the full proven subtree after deleting only the selected current-line content', () => {
    const source = '- parent\n- child\n  - grand';
    const h = harness(source, 11);
    h.view.dispatch({ selection: { anchor: 11, head: 14 } });
    expect(h.press('Tab')).toBe(true);
    expect(h.doc()).toBe('- parent\n  - ld\n    - grand');
    expect(changedRanges(h.txs[0])).toEqual([[9, 9], [11, 14], [17, 17]]);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 13, head: 13 });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
  });
  it('quote-contained selection Tab retains quote prefix while deleting before list movement', () => {
    const source = '> - parent\n> - child';
    const h = harness(source, 15);
    h.view.dispatch({ selection: { anchor: 15, head: 18 } });
    expect(h.press('Tab')).toBe(true);
    expect(h.doc()).toBe('> - parent\n>   - ld');
    expect(changedRanges(h.txs[0])).toEqual([[13, 13], [15, 18]]);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 17, head: 17 });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
  });
  expectRow('Shift-Tab outdents a nested list item', '- parent\n  - child', 18, 'Shift-Tab', '- parent\n- child', [[9, 11]], 16);
  expectRow('Shift-Tab removes one tab indentation level from its direct parent', '- parent\n\t- child', 17, 'Shift-Tab', '- parent\n- child', [[9, 10]], 16);
  expectRow('Tab preserves an unordered marker family while using the direct parent content column', '* parent\n* child', 16, 'Tab', '* parent\n  * child', [[9, 9]], 18);
  expectRow('Tab moves every proven descendant marker with the selected list subtree', '- parent\n- child\n  - grand', 11, 'Tab', '- parent\n  - child\n    - grand', [[9, 9], [17, 17]], 13);
  expectRow('Shift-Tab moves an ordered item and every descendant by its direct-parent delta', '10. parent\n    10. child\n        - grand', 19, 'Shift-Tab', '10. parent\n10. child\n    - grand', [[11, 15], [25, 29]], 15);
  expectRow('Backspace outdents a nested item subtree without orphaning its grandchild', '- parent\n  - child\n    - grand', 13, 'Backspace', '- parent\n- child\n  - grand', [[9, 11], [19, 21]], 11);
  expectRow('empty nested Enter outdents its complete proven subtree one level', '- parent\n  - \n    - grand', 13, 'Enter', '- parent\n- \n  - grand', [[9, 11], [14, 16]], 11);
  expectRow('empty top-level Backspace exits and promotes a complete proven descendant subtree', '- \n  - grand', 2, 'Backspace', '\n- grand', [[0, 2], [3, 5]], 0);
  expectRow('list contentEnd Enter inserts a sibling after the complete descendant subtree', '- parent\n  - child\n    - grand', 18, 'Enter', '- parent\n  - child\n    - grand\n  - ', [[30, 30]], 35);

  it('subtree Tab retains the grandchild ListItem under the moved child in the resulting AST', () => {
    const h = harness('- parent\n- child\n  - grand', 11);
    expect(h.press('Tab')).toBe(true);
    const ownerAt = (pos: number) => {
      for (let node: SyntaxNode | null = syntaxTree(h.view.state).resolveInner(pos, -1); node; node = node.parent) {
        if (node.name === 'ListItem') return node;
      }
      return null;
    };
    const child = ownerAt(13);
    const grandchild = ownerAt(25);
    expect(child).not.toBeNull();
    expect(grandchild).not.toBeNull();
    expect(grandchild!.parent?.parent?.name).toBe('ListItem');
    expect(grandchild!.parent?.parent?.from).toBe(child!.from);
    expect(grandchild!.parent?.parent?.to).toBe(child!.to);
  });
  // List prefix ownership is per current ListItem, never the containing list.
  expectRow('empty final sibling Enter removes only its own marker prefix', '- first\n- ', 10, 'Enter', '- first\n', [[8, 10]], 8);
  expectRow('middle sibling Backspace keeps preceding list siblings intact', '- first\n- second\n- third', 19, 'Backspace', '- first\n- second\nthird', [[17, 19]], 17);
  expectRow('quote-contained final list sibling removes only list marker not quote prefix', '> - first\n> - ', 14, 'Enter', '> - first\n> ', [[12, 14]], 12);
  expectRow('nested list in quote Backspace outdents one list level but retains quote prefix', '> - parent\n>   - child', 17, 'Backspace', '> - parent\n> - child', [[13, 15]], 15);
  expectRow('nested list in quote Shift-Tab outdents one list level but retains quote prefix', '> - parent\n>   - child', 17, 'Shift-Tab', '> - parent\n> - child', [[13, 15]], 15);
  expectRow('empty nested list in quote Enter outdents exactly one level', '> - parent\n>   - ', 17, 'Enter', '> - parent\n> - ', [[13, 15]], 15);
  expectRow('nested list in double quote retains both quote layers when outdenting', '> > - parent\n> >   - child', 21, 'Backspace', '> > - parent\n> > - child', [[17, 19]], 19);
  expectRow('nine-digit ordered marker below the limit preserves parenthesis delimiter', '999999998) item', 15, 'Enter', '999999998) item\n999999999) ', [[15, 15]], 27);
  expectRow('leading-zero ordered marker remains legal at the nine-digit boundary', '099999999. item', 15, 'Enter', '099999999. item\n100000000. ', [[15, 15]], 27);

  it.each([
    ['first', '- first\n- second', 10, 16, '- first\n', [[8, 16]], 8],
    ['middle', '- first\n- second\n- third', 10, 16, '- first\n\n- third', [[8, 16]], 8],
    ['last', '- first\n- second\n- third', 19, 24, '- first\n- second\n', [[17, 24]], 17],
  ] as const)('list %s sibling selection Backspace deletes only its current item prefix/content with one Undo', (_which, source, anchor, head, after, ranges, selectionAfter) => {
    const h = harness(source, anchor);
    h.view.dispatch({ selection: { anchor, head } });
    expect(h.press('Backspace')).toBe(true);
    expect(h.doc()).toBe(after);
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual(ranges);
    expect(h.view.state.selection.main).toMatchObject({ anchor: selectionAfter, head: selectionAfter });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
  });

  it('Delete selection keeps a sibling list marker as exact source while preserving other siblings', () => {
    const source = '- first\n- second';
    const h = harness(source, 10);
    h.view.dispatch({ selection: { anchor: 10, head: 16 } });
    expect(h.press('Delete')).toBe(true);
    expect(h.doc()).toBe('- first\n- ');
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual([[10, 16]]);
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
  });

  it.each([
    ['dot', '999999999. item'],
    ['paren', '999999999) item'],
  ] as const)('maximum legal ordered %s marker Enter is a handled fail-closed NoOp', (_delimiter, source) => {
    const h = harness(source, source.length);
    expect(h.press('Enter')).toBe(true);
    expect(h.doc()).toBe(source);
    expect(h.txs).toHaveLength(0);
  });

  it('mixed tab/space list-relative indent inside quote fails closed to source handling', () => {
    const source = '> - parent\n> \t - child';
    const h = harness(source, source.length);
    expect(h.press('Shift-Tab')).toBe(false);
    expect(h.doc()).toBe(source);
    expect(h.txs).toHaveLength(0);
  });

  // Blockquote §4.
  expectRow('quote Enter at contentStart inserts a same-depth quote before it', '> text', 2, 'Enter', '> \n> text', [[0, 0]], 2);
  expectRow('quote Enter in content continues the same quote depth', '> text', 4, 'Enter', '> te\n> xt', [[4, 4]], 7);
  expectRow('quote Enter at contentEnd appends an empty same-depth quote', '> text', 6, 'Enter', '> text\n> ', [[6, 6]], 9);
  expectRow('empty quote Enter removes exactly one quote layer', '> ', 2, 'Enter', '', [[0, 2]], 0);
  expectRow('nested empty quote Enter removes exactly one quote layer', '> > ', 4, 'Enter', '> ', [[2, 4]], 2);
  expectRow('quote Backspace at contentStart removes exactly one layer', '> text', 2, 'Backspace', 'text', [[0, 2]], 0);
  expectRow('quote Backspace away from contentStart is plain source deletion', '> text', 4, 'Backspace', '> txt', [[3, 4]], 3);
  expectRow('empty quote line before a following quote removes only its current marker', '> \n> child', 2, 'Enter', '\n> child', [[0, 2]], 0);
  expectRow('empty inner quote line before a following quote removes only the inner marker', '> > \n> > child', 4, 'Enter', '> \n> > child', [[2, 4]], 2);
  // Nested owners are selected from the nearest trusted Lezer caret path.
  // Each row exercises a real EditorView key binding and expectRow also
  // verifies one transaction and one undo group.
  expectRow('double quote Enter preserves every outer quote prefix', '> > text', 6, 'Enter', '> > te\n> > xt', [[6, 6]], 11);
  expectRow('heading in quote Backspace removes only the heading marker', '> # title', 4, 'Backspace', '> title', [[2, 4]], 2);
  expectRow('quote in list Enter retains the enclosing list prefix', '- > text', 6, 'Enter', '- > te\n- > xt', [[6, 6]], 11);
  expectRow('list in quote Enter retains the enclosing quote prefix', '> - text', 6, 'Enter', '> - te\n> - xt', [[6, 6]], 11);
  expectRow('heading in list Backspace retains its list marker', '- # title', 4, 'Backspace', '- title', [[2, 4]], 2);
  expectRow('zero-padded ordered marker increments its numeric field only', '009. alpha', 10, 'Enter', '009. alpha\n10. ', [[10, 10]], 15);
  expectRow('double quote Backspace removes one inner layer only', '> > text', 4, 'Backspace', '> text', [[2, 4]], 2);

  it.each([
    ['double quote', '> > text', 4, 8, 'Enter', '> ', [[2, 8]], 2],
    ['heading in quote', '> # title', 4, 9, 'Backspace', '> ', [[2, 9]], 2],
    ['quote in list', '- > text', 4, 8, 'Enter', '- ', [[2, 8]], 2],
    ['list in quote', '> - text', 4, 8, 'Backspace', '> ', [[2, 8]], 2],
  ] as const)('nested %s full content selection is one exact structural transaction with Undo', (_kind, source, anchor, head, key, after, ranges, selectionAfter) => {
    const h = harness(source, anchor);
    h.view.dispatch({ selection: { anchor, head } });
    expect(h.press(key)).toBe(true);
    expect(h.doc()).toBe(after);
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual(ranges);
    expect(h.view.state.selection.main).toMatchObject({ anchor: selectionAfter, head: selectionAfter });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
    expect(h.view.state.selection.main).toMatchObject({ anchor, head });
  });

  it('Delete with a selection covering a complete heading is exact source deletion', () => {
    const h = harness('# title', 0);
    h.view.dispatch({ selection: { anchor: 0, head: 7 } });
    expect(h.press('Delete')).toBe(true);
    expect(h.doc()).toBe('');
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual([[0, 7]]);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 0, head: 0 });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe('# title');
    expect(h.view.state.selection.main).toMatchObject({ anchor: 0, head: 7 });
  });

  it.each([
    ['heading full-content Enter', '# title', 2, 7, 'Enter', '', [[0, 7]], 0],
    ['list full-content Enter', '- title', 2, 7, 'Enter', '', [[0, 7]], 0],
    ['quote full-content Enter', '> title', 2, 7, 'Enter', '', [[0, 7]], 0],
    ['heading full-content Backspace', '# title', 2, 7, 'Backspace', '', [[0, 7]], 0],
    ['list full-content Backspace', '- title', 2, 7, 'Backspace', '', [[0, 7]], 0],
    ['quote full-content Backspace', '> title', 2, 7, 'Backspace', '', [[0, 7]], 0],
    ['heading complete-source Delete', '# title', 0, 7, 'Delete', '', [[0, 7]], 0],
    ['list complete-source Delete', '- title', 0, 7, 'Delete', '', [[0, 7]], 0],
    ['quote complete-source Delete', '> title', 0, 7, 'Delete', '', [[0, 7]], 0],
    ['cross-block Enter', '# a\n> b', 2, 5, 'Enter', '# \n b', [[2, 5]], 3],
    ['cross-block Backspace', '# a\n> b', 2, 5, 'Backspace', '#  b', [[2, 5]], 2],
    ['cross-block Delete', '# a\n> b', 2, 5, 'Delete', '#  b', [[2, 5]], 2],
    ['same-list cross-line Enter', '- a\n- b', 2, 5, 'Enter', '- \n b', [[2, 5]], 3],
    ['same-quote cross-line Backspace', '> a\n> b', 2, 6, 'Backspace', '> b', [[2, 6]], 2],
  ] as const)('%s is one selection transaction with deterministic source and selection', (_name, source, anchor, head, key, after, ranges, selectionAfter) => {
    const h = harness(source, anchor);
    h.view.dispatch({ selection: { anchor, head } });
    expect(h.press(key)).toBe(true);
    expect(h.doc()).toBe(after);
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual(ranges);
    expect(h.view.state.selection.main).toMatchObject({ anchor: selectionAfter, head: selectionAfter });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
    expect(h.view.state.selection.main).toMatchObject({ anchor, head });
  });

  it('closing ATX nonempty selection collapsed in content keeps closing syntax with the prefix', () => {
    const source = '# title #';
    const h = harness(source, 3);
    h.view.dispatch({ selection: { anchor: 3, head: 4 } });
    expect(h.press('Enter')).toBe(true);
    expect(h.doc()).toBe('# t #\ntle');
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual([[3, 9]]);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 6, head: 6 });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 3, head: 4 });
  });

  it.each([
    ['Enter', '# title #'],
    ['Backspace', '# title #'],
  ] as const)('closing ATX full-content selection %s removes the complete syntax in one undo group', (key, source) => {
    const h = harness(source, 2);
    h.view.dispatch({ selection: { anchor: 2, head: 7 } });
    expect(h.press(key)).toBe(true);
    expect(h.doc()).toBe('');
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual([[0, 9]]);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 0, head: 0 });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 2, head: 7 });
  });

  it.each([
    ['heading', '# title', 2, 4, 'Enter', '\n# tle', [[0, 0], [2, 4]], 0],
    ['heading', '# title', 2, 4, 'Backspace', 'tle', [[0, 4]], 0],
    ['list', '- title', 2, 4, 'Backspace', 'tle', [[0, 4]], 0],
    ['quote', '> title', 2, 4, 'Backspace', 'tle', [[0, 4]], 0],
  ] as const)('%s nonempty selection deletes first and resolves the collapsed structural context once', (_kind, source, anchor, head, key, after, ranges, selectionAfter) => {
    const h = harness(source, anchor);
    h.view.dispatch({ selection: { anchor, head } });
    expect(h.press(key)).toBe(true);
    expect(h.doc()).toBe(after);
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual(ranges);
    expect(h.txs[0].isUserEvent('input.structure')).toBe(true);
    expect(h.view.state.selection.main).toMatchObject({ anchor: selectionAfter, head: selectionAfter });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
    expect(h.view.state.selection.main).toMatchObject({ anchor, head });
  });

  it('top-level Tab is an ADR NoOp', () => {
    const h = harness('- child', 7);
    expect(h.press('Tab')).toBe(true);
    expect(h.doc()).toBe('- child');
    expect(h.txs).toHaveLength(0);
  });

  it('top-level empty list exits while promoting its proven descendant subtree one level', () => {
    const source = '- \n  - grand';
    const h = harness(source, 2);
    expect(h.press('Enter')).toBe(true);
    expect(h.doc()).toBe('\n- grand');
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual([[0, 2], [3, 5]]);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 0, head: 0 });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
  });

  it('full current quote-line selection deletes first then exits that one quote layer', () => {
    const source = '> text\n> next';
    const h = harness(source, 2);
    h.view.dispatch({ selection: { anchor: 2, head: 6 } });
    expect(h.press('Enter')).toBe(true);
    expect(h.doc()).toBe('\n> next');
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual([[0, 6]]);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 0, head: 0 });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
  });

  it('full current list-line selection owning descendants deletes content without reparenting them', () => {
    const source = '- parent\n  - child';
    const h = harness(source, 2);
    h.view.dispatch({ selection: { anchor: 2, head: 8 } });
    expect(h.press('Enter')).toBe(true);
    expect(h.doc()).toBe('\n- child');
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual([[0, 8], [9, 11]]);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 0, head: 0 });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
  });

  it('full nested list-line selection deletes first then outdents the whole descendant subtree', () => {
    const source = '- parent\n  - child\n    - grand';
    const h = harness(source, 13);
    h.view.dispatch({ selection: { anchor: 13, head: 18 } });
    expect(h.press('Enter')).toBe(true);
    expect(h.doc()).toBe('- parent\n- \n  - grand');
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual([[9, 11], [13, 18], [19, 21]]);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 11, head: 11 });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
  });

  it('composition in an ordinary paragraph delegates to the existing source keymap', () => {
    const h = harness('plain', 5);
    vi.spyOn(h.view, 'composing', 'get').mockReturnValue(true);
    expect(h.press('Enter')).toBe(true);
    expect(h.doc()).toBe('plain\n');
    expect(h.txs).toHaveLength(1);
    expect(h.txs[0].isUserEvent('input.structure')).toBe(false);
  });

  it('composition in unsafe fenced source delegates instead of swallowing IME input', () => {
    const h = harness('~~~\n# title\n~~~', 6);
    vi.spyOn(h.view, 'composing', 'get').mockReturnValue(true);
    expect(h.press('Backspace')).toBe(true);
    expect(h.doc()).toBe('~~~\n#title\n~~~');
    expect(h.txs).toHaveLength(1);
    expect(h.txs[0].isUserEvent('input.structure')).toBe(false);
  });

  it('top-level Shift-Tab is an ADR NoOp', () => {
    const h = harness('- child', 7);
    expect(h.press('Shift-Tab')).toBe(true);
    expect(h.doc()).toBe('- child');
    expect(h.txs).toHaveLength(0);
  });

  it('Tab cannot borrow a list parent across a paragraph/container boundary', () => {
    const h = harness('- first\n\nparagraph\n- second', 27);
    expect(h.press('Tab')).toBe(true);
    expect(h.doc()).toBe('- first\n\nparagraph\n- second');
    expect(h.txs).toHaveLength(0);
  });

  it('cross-item Tab selection is exact source deletion and never a structural move', () => {
    const source = '- a\n- b';
    const h = harness(source, 2);
    h.view.dispatch({ selection: { anchor: 2, head: 6 } });
    expect(h.press('Tab')).toBe(true);
    expect(h.doc()).toBe('- b');
    expect(changedRanges(h.txs[0])).toEqual([[2, 6]]);
    expect(h.txs[0].isUserEvent('input.structure')).toBe(false);
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
  });

  it.each([
    ['mixed tab/space list geometry', '- parent\n \t- child', 13, 16, '- parent\n \t- ld', 'Shift-Tab'],
  ] as const)('%s selection fails closed to one exact-source deletion', (_name, source, anchor, head, after, key) => {
    const h = harness(source, anchor);
    h.view.dispatch({ selection: { anchor, head } });
    expect(h.press(key)).toBe(true);
    expect(h.doc()).toBe(after);
    expect(changedRanges(h.txs[0])).toEqual([[anchor, head]]);
    expect(h.txs[0].isUserEvent('input.structure')).toBe(false);
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
  });

  it.each([
    ['paragraph', 'plain text', 0, 5],
    ['table', '| a | b |\n|---|---|', 0, 5],
    ['fenced source', '~~~\nplain\n~~~', 4, 9],
    ['raw HTML', '<div>plain</div>', 5, 10],
  ] as const)('%s selection %s delegates to native source handling without a structural deletion', (_kind, source, anchor, head) => {
    for (const key of ['Tab', 'Shift-Tab'] as const) {
      const h = harness(source, anchor);
      h.view.dispatch({ selection: { anchor, head } });
      expect(h.press(key)).toBe(false);
      expect(h.doc()).toBe(source);
      expect(h.txs).toHaveLength(0);
    }
  });

  it.each([
    ['Enter range', 'Enter'],
    ['Backspace range', 'Backspace'],
  ] as const)('doubly nested list %s removes only its direct-parent indentation delta', (_name, key) => {
    const source = '- a\n  - b\n    - c';
    const h = harness(source, 16);
    h.view.dispatch({ selection: { anchor: 16, head: 17 } });
    expect(h.press(key)).toBe(true);
    expect(h.doc()).toBe('- a\n  - b\n  - ');
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual([[12, 14], [16, 17]]);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 14, head: 14 });
    expect(undo(h.view)).toBe(true);
    expect(h.doc()).toBe(source);
  });

  it('doubly nested Shift-Tab removes only its direct-parent indentation delta', () => {
    const source = '- a\n  - b\n    - c';
    const h = harness(source, 16);
    expect(h.press('Shift-Tab')).toBe(true);
    expect(h.doc()).toBe('- a\n  - b\n  - c');
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual([[12, 14]]);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 14, head: 14 });
  });

  it('mixed tab/space direct-parent indentation is a fail-closed NoOp', () => {
    const source = '- a\n \t- b';
    const h = harness(source, source.length);
    expect(h.press('Shift-Tab')).toBe(true);
    expect(h.doc()).toBe(source);
    expect(h.txs).toHaveLength(0);
  });

  it('Tab declines tab-width geometry it cannot prove as Markdown columns', () => {
    const source = '\t- parent\n\t- child';
    const h = harness(source, source.length);
    expect(h.press('Tab')).toBe(false);
    expect(h.doc()).toBe(source);
    expect(h.txs).toHaveLength(0);
  });

  it('malformed syntax declines structural handling and remains editable source', () => {
    const h = harness('#broken', 7);
    expect(h.press('Enter')).toBe(true);
    expect(h.doc()).toBe('#broken\n');
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual([[7, 7]]);
    expect(h.txs[0].isUserEvent('input.structure')).toBe(false);
  });

  it.each([
    ['caret in heading marker', '# title', 1, 'Backspace', ' title'],
    ['heading-looking literal inside a fence', '~~~\n# title\n~~~', 5, 'Backspace', '~~~\n title\n~~~'],
    ['heading-looking literal inside raw HTML', '<div>\n# title\n</div>', 8, 'Backspace', '<div>\n#title\n</div>'],
    ['heading-looking literal inside a table cell', '| # |\n|---|', 3, 'Backspace', '|  |\n|---|'],
    ['list-contained table body', '- | a |\n  |---|', 5, 'Backspace', '- |  |\n  |---|'],
    ['quote-contained fenced code body', '> ~~~\n> # x\n> ~~~', 11, 'Backspace', '> ~~~\n> # \n> ~~~'],
    ['quote-contained HTML body', '> <div>\n> # x\n> </div>', 13, 'Backspace', '> <div>\n> # \n> </div>'],
    ['caret in closing heading marker', '# title #', 9, 'Backspace', '# title '],
    ['list continuation line without a current-line marker', '- first\n  continuation', 11, 'Backspace', '- first\n  ontinuation'],
    ['quote continuation line without a current-line marker', '> first\n> second', 11, 'Backspace', '> first\n> econd'],
  ] as const)('%s is exact source fallback, never a structural transaction', (_name, source, pos, key, after) => {
    const h = harness(source, pos);
    expect(h.press(key)).toBe(true);
    expect(h.doc()).toBe(after);
    expect(h.txs).toHaveLength(1);
    expect(h.txs[0].isUserEvent('input.structure')).toBe(false);
  });

  it('read-only source never receives a structural transaction', () => {
    const h = harness('# title', 2, true);
    expect(h.press('Enter')).toBe(false);
    expect(h.doc()).toBe('# title');
    expect(h.txs).toHaveLength(0);
  });

  it.each([
    ['heading', '# title', 2],
    ['list', '- title', 2],
    ['quote', '> title', 2],
  ] as const)('composition in %s is consumed without any structural or lower-keymap transaction', (_kind, source, pos) => {
    const h = harness(source, pos);
    vi.spyOn(h.view, 'composing', 'get').mockReturnValue(true);
    expect(h.press('Enter')).toBe(true);
    expect(h.doc()).toBe(source);
    expect(h.txs).toHaveLength(0);
  });
});

describe('P7 table contract fixtures frozen by P4B task 7.2a', () => {
  afterEach(() => resetAllCohortFlags());

  it('P4B projection fallback delegates a table Enter to the real source keymap', () => {
    const source = '| a | b |\n|---|---|\n| 1 | 2 |';
    const h = harness(source, 26);
    expect(h.press('Enter')).toBe(true);
    expect(h.doc()).toBe('| a | b |\n|---|---|\n| 1 | \n2 |');
    expect(h.txs).toHaveLength(1);
    expect(changedRanges(h.txs[0])).toEqual([[26, 26]]);
    expect(h.txs[0].isUserEvent('input.structure')).toBe(false);
    expect(h.view.state.selection.main).toMatchObject({ anchor: 27, head: 27 });
  });

  it.each([
    ['ArrowLeft', 2, 1],
    ['ArrowRight', 27, 28],
  ] as const)('P4B table projection fallback lets native CM %s retain exact bytes and move the source caret', (key, position, selectionAfter) => {
    const source = '| a | b |\n|---|---|\n| 1 | 2 |';
    const h = harness(source, position);
    expect(h.press(key)).toBe(true);
    expect(h.doc()).toBe(source);
    // The product callback intentionally records doc-changing transactions
    // only; cursor navigation therefore leaves its patch queue empty.
    expect(h.txs).toHaveLength(0);
    expect(h.view.state.selection.main).toMatchObject({ anchor: selectionAfter, head: selectionAfter });
  });

  it('freezes the P4B projection decision separately from every ADR §5 P7 target', () => {
    expect(FROZEN_TABLE_INTERACTION_FIXTURES).toHaveLength(36);
    for (const fixture of FROZEN_TABLE_INTERACTION_FIXTURES) {
      expect(fixture.p4bProjectionDecision.action).toBe('RevealSource');
      expect(fixture.p4bProjectionDecision.sourceAfter).toBe(fixture.source);
      expect(fixture.p4bProjectionDecision.changes).toEqual([]);
      expect(fixture.p4bProjectionDecision.focus).toBe('source');
      expect(fixture.p4bProjectionDecision.selectionAfter).toEqual(fixture.selection);
      expect(fixture.p4bProjectionDecision.fallback).toBe('exact-source');
      expect(fixture.p7Expected.sourceAfter.length).toBeGreaterThan(0);
      expect(['cell-slot', 'table-widget', 'source']).toContain(fixture.p7Expected.beforeFocus);
      expect(fixture.p7Expected.affectedRanges).toEqual(
        fixture.p7Expected.changes.map((change) => [change.from, change.to]),
      );
      for (const change of fixture.p7Expected.changes) {
        expect(change.insertedLineEndings).toHaveLength((change.insert.match(/\n/g) ?? []).length);
      }
      expect(['single', 'none']).toContain(fixture.p7Expected.historyGroup);
      expect(fixture.p7Expected.undoExpectation).toBe(
        fixture.p7Expected.historyGroup === 'single' ? 'restore-source-and-selection' : 'none',
      );
      expect(fixture.p7Expected.targetSourceOffset).toBe(
        fixture.p7Expected.targetCell === null ? null : fixture.p7Expected.selectionAfter.anchor,
      );
      if (fixture.trustedRanges) {
        const ranges = fixture.trustedRanges;
        const inTable = ([from, to]: readonly [number, number]) => {
          expect(from).toBeGreaterThanOrEqual(ranges.table[0]);
          expect(to).toBeGreaterThanOrEqual(from);
          expect(to).toBeLessThanOrEqual(ranges.table[1]);
        };
        expect(fixture.source.slice(...ranges.table)).toBe(ranges.fragments.table);
        expect(fixture.source.slice(...ranges.delimiter)).toBe(ranges.fragments.delimiter);
        inTable(ranges.delimiter);
        expect(ranges.rows).toHaveLength(ranges.fragments.rows.length);
        expect(ranges.cells).toHaveLength(ranges.fragments.cells.length);
        for (const [index, range] of ranges.rows.entries()) {
          inTable(range);
          expect(fixture.source.slice(...range)).toBe(ranges.fragments.rows[index]);
          expect(index === 0 || ranges.rows[index - 1][1] < range[0]).toBe(true);
          expect(fixture.cellSlot?.rows[index]).toEqual({ from: range[0], to: range[1] });
        }
        for (const [index, range] of ranges.cells.entries()) {
          inTable(range);
          expect(fixture.source.slice(...range)).toBe(ranges.fragments.cells[index]);
          expect(index === 0 || ranges.cells[index - 1][1] <= range[0]).toBe(true);
          expect(fixture.cellSlot?.cells[index]).toEqual({ from: range[0], to: range[1] });
        }
        expect(fixture.cellSlot?.table).toEqual({ from: ranges.table[0], to: ranges.table[1] });
        expect(fixture.cellSlot?.delimiter).toEqual({ from: ranges.delimiter[0], to: ranges.delimiter[1] });
        const target = fixture.p7Expected.targetCell;
        const targetOffset = fixture.p7Expected.targetSourceOffset;
        if (target !== null && target < ranges.cells.length && targetOffset !== null) {
          const [from, to] = ranges.cells[target];
          expect(targetOffset).toBeGreaterThanOrEqual(from);
          expect(targetOffset).toBeLessThanOrEqual(to);
        }
        if (target !== null && target >= ranges.cells.length && targetOffset !== null) {
          // Appended-row targets are not part of P4B's pre-change trusted
          // ranges, but must land at a declared post-change canonical empty
          // cell point — never merely at arbitrary padding after a pipe.
          const postRange = fixture.p7Expected.postChangeCellRanges[target - ranges.cells.length];
          expect(postRange).toBeDefined();
          expect(targetOffset).toBeGreaterThanOrEqual(postRange![0]);
          expect(targetOffset).toBeLessThanOrEqual(postRange![1]);
          expect(targetOffset).toBe(postRange![0]);
        }
      }
      if (fixture.eolContext) {
        expect(fixture.eolContext.rawSource.replace(/\r\n|\r/g, '\n')).toBe(fixture.source);
        expect(fixture.p7Expected.rawSourceAfter?.replace(/\r\n|\r/g, '\n')).toBe(fixture.p7Expected.sourceAfter);
        const currentEol = fixture.eolContext.lineEndings[fixture.eolContext.lineEndings.length - 1] === 'crlf' ? '\r\n' : '\r';
        expect(fixture.p7Expected.rawSourceAfter).toContain(`${currentEol}|   |   |`);
      }
    }
    expect(FROZEN_TABLE_INTERACTION_FIXTURES[0].trustedRanges?.cells).toHaveLength(4);
    expect(FROZEN_TABLE_INTERACTION_FIXTURES[0].cellSlot?.fallback).toBe('exact-source');
    const malformed = FROZEN_TABLE_INTERACTION_FIXTURES[FROZEN_TABLE_INTERACTION_FIXTURES.length - 1];
    expect(malformed.trustedRanges).toBeNull();
    expect(malformed.cellSlot).toBeNull();
    expect(malformed.p7Expected.action).toBe('RevealSource');
    expect(FROZEN_TABLE_INTERACTION_FIXTURES.some((fixture) => fixture.p7Expected.action === 'AppendRow')).toBe(true);
    expect(FROZEN_TABLE_INTERACTION_FIXTURES.some((fixture) => fixture.p7Expected.action === 'NoOp')).toBe(true);
    expect(FROZEN_TABLE_INTERACTION_FIXTURES.some((fixture) => fixture.p7Expected.action === 'DelegateToCodeMirror')).toBe(true);
    const tabAppend = FROZEN_TABLE_INTERACTION_FIXTURES.find((fixture) => fixture.name === 'tab-at-last-data-cell-appends-one-row')!;
    expect(tabAppend.p7Expected).toMatchObject({ targetCell: 4, selectionAfter: { anchor: 32, head: 32 }, postChangeCellRanges: [[32, 32], [36, 36]], historyGroup: 'single' });
    expect(tabAppend.p7Expected.sourceAfter.slice(29)).toBe('\n|   |   |');
    const enterAppend = FROZEN_TABLE_INTERACTION_FIXTURES.find((fixture) => fixture.name === 'enter-commits-and-appends-after-last-data-row')!;
    expect(enterAppend.p7Expected).toMatchObject({ targetCell: 5, selectionAfter: { anchor: 36, head: 36 }, postChangeCellRanges: [[32, 32], [36, 36]], historyGroup: 'single' });
    const enterExisting = FROZEN_TABLE_INTERACTION_FIXTURES.find((fixture) => fixture.name === 'enter-in-a-nonfinal-row-moves-to-same-column-in-existing-next-row')!;
    expect(enterExisting.p7Expected).toMatchObject({ targetCell: 5, selectionAfter: { anchor: 36, head: 36 }, changes: [] });
    const clampedColumn = FROZEN_TABLE_INTERACTION_FIXTURES.find((fixture) => fixture.name === 'arrow-down-clamps-column-offset-to-shorter-target-cell')!;
    expect(clampedColumn).toMatchObject({ source: '| aa | b |\n|----|---|\n| wide | q |\n| z | r |' });
    expect(clampedColumn.p7Expected).toMatchObject({ targetCell: 4, targetSourceOffset: 38, selectionAfter: { anchor: 38, head: 38 } });
    const selectedEnter = FROZEN_TABLE_INTERACTION_FIXTURES.find((fixture) => fixture.name.startsWith('nonempty-selection-enter-'))!;
    expect(selectedEnter.selection).toEqual({ anchor: 26, head: 27 });
    expect(selectedEnter.p7Expected).toMatchObject({ targetCell: 5, selectionAfter: { anchor: 36, head: 36 } });
    const eolAppends = FROZEN_TABLE_INTERACTION_FIXTURES.filter((fixture) => fixture.eolContext);
    expect(eolAppends.map((fixture) => fixture.name)).toEqual([
      'append-row-crlf-inherits-current-eol',
      'append-row-cr-inherits-current-eol',
      'append-row-mixed-inherits-current-eol',
    ]);
    const escapes = FROZEN_TABLE_INTERACTION_FIXTURES.filter((fixture) => fixture.operation === 'Escape');
    expect(escapes.map((fixture) => fixture.p7Expected.beforeFocus)).toEqual(['cell-slot', 'table-widget']);
    for (const name of [
      'arrow-left-at-second-cell-start-enters-previous-cell',
      'arrow-right-at-last-cell-end-is-noop',
      'shift-tab-at-second-cell-moves-to-previous-cell',
      'composition-arrow-delegates-without-cross-cell-navigation',
      'composition-tab-delegates-without-cross-cell-navigation',
      'nonempty-selection-shift-tab-commits-without-deleting-selection',
      'escaped-pipe-cell-remains-untrusted-source',
      'multiline-cell-remains-untrusted-source',
      'nested-html-cell-remains-untrusted-source',
    ]) expect(FROZEN_TABLE_INTERACTION_FIXTURES.some((fixture) => fixture.name === name)).toBe(true);
  });
});

describe('P4B structural commands remain default-OFF', () => {
  afterEach(() => {
    resetAllCohortFlags();
    while (open.length) open.pop()!.destroy();
    document.body.innerHTML = '';
  });

  it('defers heading contentStart Enter to the existing source keymap when its cohort is disabled', () => {
    resetAllCohortFlags();
    expect(isHeadingStrongEnabled()).toBe(false);
    expect(isQuoteListsEnabled()).toBe(false);
    const h = harness('# title', 2);
    expect(h.press('Enter')).toBe(true);
    expect(h.doc()).toBe('# \ntitle');
    expect(h.txs).toHaveLength(1);
    expect(h.txs[0].isUserEvent('input.structure')).toBe(false);
  });
});
