// P4B structural interaction substrate (task 7.2a).
//
// This module deliberately operates on CodeMirror source positions only. It
// implements the unambiguous heading/list/quote rows in the structural
// interaction ADR; tables remain fixtures-only until P7 supplies a trusted
// table widget and cell ranges.

import { EditorState, Prec, type Extension } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { EditorView, keymap, type KeyBinding } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { isHeadingStrongEnabled, isQuoteListsEnabled } from './cohortFlags';
import type { TableCellSlotProtocol } from './widgets/protocol';

type Change = { from: number; to: number; insert: string };

interface HeadingLine {
  readonly line: ReturnType<EditorState['doc']['lineAt']>;
  /** Lezer ATX owner start; may follow a trusted quote/list outer prefix. */
  readonly structuralStart: number;
  /** Source prefix outside the ATX owner that must survive a split. */
  readonly outerPrefix: string;
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly closingMarkerFrom: number | null;
  readonly empty: boolean;
}

interface ListLine {
  readonly lineFrom: number;
  /** Trusted source prefix owned by an enclosing quote/list container. */
  readonly outerPrefix: string;
  /** Current item's removable indent/marker/task prefix, never its container. */
  readonly prefixFrom: number;
  readonly indent: string;
  readonly item: SyntaxNode;
  readonly container: SyntaxNode;
  readonly indentFrom: number;
  readonly indentTo: number;
  readonly marker: string;
  readonly taskMarker: string;
  readonly ordered: boolean;
  readonly ordinal: number | null;
  readonly orderedDigitsLength: number;
  readonly contentStart: number;
  /** Semantic content ends on this item's current physical marker line. */
  readonly contentEnd: number;
  readonly empty: boolean;
}

interface QuoteLine {
  readonly node: SyntaxNode;
  readonly line: ReturnType<EditorState['doc']['lineAt']>;
  readonly prefix: string;
  readonly firstMarkerFrom: number;
  readonly firstMarkerTo: number;
  readonly contentStart: number;
  readonly empty: boolean;
}

const UNSAFE_ANCESTORS = new Set([
  'FencedCode', 'CodeBlock', 'HTMLBlock', 'HTMLTag', 'CommentBlock', 'Table',
]);
type StructuralKind = 'heading' | 'list' | 'quote';

function ancestors(node: SyntaxNode | null): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let current = node; current; current = current.parent) result.push(current);
  return result;
}

function trustedOwnerAt(
  state: EditorState,
  pos: number,
  predicate: (candidate: SyntaxNode) => boolean,
): SyntaxNode | null {
  // Do not synchronously force a full-document parse on every keydown. The
  // currently available incremental tree is authoritative only when it gives
  // us a complete leaf→owner path; otherwise this returns null and source
  // editing remains the fail-closed fallback.
  const tree = syntaxTree(state);
  for (const resolvedPos of pos > 0 ? [pos, pos - 1] : [pos]) {
    const path = ancestors(tree.resolveInner(resolvedPos, -1));
    const ownerIndex = path.findIndex(predicate);
    if (ownerIndex < 0) continue;
    // Unsafe children are BELOW the structural owner in the caret path, so an
    // owner-only ancestor check is insufficient for list-contained tables and
    // quote-contained fenced/HTML bodies.
    if (path.slice(0, ownerIndex).some((candidate) => UNSAFE_ANCESTORS.has(candidate.name))) {
      return null;
    }
    return path[ownerIndex];
  }
  return null;
}

/** The nearest structural node on the trusted caret path wins nested routing. */
function structuralKindAt(state: EditorState, pos: number): StructuralKind | null {
  const tree = syntaxTree(state);
  for (const resolvedPos of pos > 0 ? [pos, pos - 1] : [pos]) {
    const path = ancestors(tree.resolveInner(resolvedPos, -1));
    const ownerIndex = path.findIndex((node) => node.name.startsWith('ATXHeading')
      || node.name === 'ListItem' || node.name === 'Blockquote');
    if (ownerIndex < 0 || path.slice(0, ownerIndex).some((node) => UNSAFE_ANCESTORS.has(node.name))) continue;
    const owner = path[ownerIndex];
    if (owner.name.startsWith('ATXHeading')) return 'heading';
    if (owner.name === 'ListItem') return 'list';
    return 'quote';
  }
  return null;
}

function headingFor(state: EditorState, pos: number): HeadingLine | null {
  return structuralKindAt(state, pos) === 'heading' && isHeadingStrongEnabled() ? headingAt(state, pos) : null;
}

function listFor(state: EditorState, pos: number): ListLine | null {
  return structuralKindAt(state, pos) === 'list' && isQuoteListsEnabled() ? listAt(state, pos) : null;
}

function quoteFor(state: EditorState, pos: number): QuoteLine | null {
  return structuralKindAt(state, pos) === 'quote' && isQuoteListsEnabled() ? quoteAt(state, pos) : null;
}

function skipWhitespace(state: EditorState, from: number, to: number): number {
  let pos = from;
  while (pos < to) {
    const char = state.sliceDoc(pos, pos + 1);
    if (char !== ' ' && char !== '\t') break;
    pos++;
  }
  return pos;
}

function isIndentation(text: string): boolean {
  for (const char of text) if (char !== ' ' && char !== '\t') return false;
  return true;
}

function trimWhitespaceBackwards(state: EditorState, from: number, floor: number): number {
  let pos = from;
  while (pos > floor) {
    const char = state.sliceDoc(pos - 1, pos);
    if (char !== ' ' && char !== '\t') break;
    pos--;
  }
  return pos;
}

function directChild(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

function canHandle(view: EditorView): boolean {
  return !view.state.facet(EditorState.readOnly);
}

function structuralCohortEnabled(): boolean {
  return isHeadingStrongEnabled() || isQuoteListsEnabled();
}

/** IME owns ordinary source input; consume only a trusted enabled construct. */
function compositionStructuralOwner(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  return headingFor(view.state, pos) !== null || listFor(view.state, pos) !== null || quoteFor(view.state, pos) !== null;
}

function dispatch(view: EditorView, changes: Change | readonly Change[], anchor: number): boolean {
  view.dispatch({
    changes,
    selection: { anchor },
    userEvent: 'input.structure',
    annotations: isolateHistory.of('full'),
  });
  return true;
}

/** Exact-source fallback for an unsupported nonempty selection. */
function dispatchSourceDeletion(view: EditorView, from: number, to: number): boolean {
  view.dispatch({
    changes: { from, to, insert: '' },
    selection: { anchor: from },
    userEvent: 'delete.selection',
  });
  return true;
}

function headingAt(state: EditorState, pos: number): HeadingLine | null {
  const line = state.doc.lineAt(pos);
  const node = trustedOwnerAt(state, pos, (candidate) => candidate.name.startsWith('ATXHeading'));
  if (!node) return null;
  const markers: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === 'HeaderMark') markers.push(child);
  }
  const marker = markers[0];
  if (!marker || marker.from !== node.from) return null;
  const contentStart = skipWhitespace(state, marker.to, node.to);
  const closingMarker = markers[1] ?? null;
  const contentEnd = closingMarker
    ? trimWhitespaceBackwards(state, closingMarker.from, contentStart)
    : node.to;
  // A trailing ATX marker is syntax, never editable heading content. This also
  // rejects the separator immediately before it rather than guessing whether
  // it belongs to literal content.
  if (pos < contentStart || pos > contentEnd) return null;
  return {
    line, structuralStart: node.from, outerPrefix: state.sliceDoc(line.from, node.from), contentStart, contentEnd,
    closingMarkerFrom: closingMarker?.from ?? null,
    empty: contentStart === contentEnd,
  };
}

/**
 * Split a list item's current-line prefix using only Lezer QuoteMark nodes.
 * Each quote marker owns at most one following separator byte; all remaining
 * whitespace before the ListMark is list-relative indentation. This is what
 * lets `>   - child` retain `> ` while outdenting only its two spaces.
 */
function quotePrefixEndOnLine(
  state: EditorState,
  line: ReturnType<EditorState['doc']['lineAt']>,
  itemFrom: number,
): number | null {
  const markers: SyntaxNode[] = [];
  syntaxTree(state).iterate({
    from: line.from,
    to: itemFrom,
    enter(node) {
      if (node.name === 'QuoteMark' && node.from >= line.from && node.to <= itemFrom) {
        markers.push(node.node);
      }
    },
  });
  if (markers.length === 0) return line.from;
  markers.sort((a, b) => a.from - b.from || a.to - b.to);
  let cursor = line.from;
  for (const marker of markers) {
    // Between quote markers the grammar proves only an optional one-byte
    // marker separator. Anything else belongs to unproven source and declines.
    if (marker.from === cursor) {
      cursor = marker.to;
    } else if (marker.from === cursor + 1 && (state.sliceDoc(cursor, marker.from) === ' ' || state.sliceDoc(cursor, marker.from) === '\t')) {
      cursor = marker.to;
    } else {
      return null;
    }
    if (cursor < itemFrom) {
      const separator = state.sliceDoc(cursor, cursor + 1);
      if (separator === ' ' || separator === '\t') cursor++;
    }
  }
  return cursor;
}

function listAt(state: EditorState, pos: number): ListLine | null {
  const item = trustedOwnerAt(state, pos, (candidate) => candidate.name === 'ListItem');
  if (!item) return null;
  const container = item.parent;
  if (!container || (container.name !== 'BulletList' && container.name !== 'OrderedList')) return null;
  const markerNode = directChild(item, 'ListMark');
  if (!markerNode || markerNode.from !== item.from) return null;
  const line = state.doc.lineAt(item.from);
  // A ListItem may be directly contained by a Blockquote.  In that case the
  // bytes before the list container are not indentation: they are an
  // independently parsed outer prefix that every continuation must retain.
  // Conversely nested-list indentation belongs between the direct list
  // container and its ListItem.  This distinction is entirely syntax-tree
  // derived; a literal/non-structural prefix fails closed below.
  if (container.from > item.from) return null;
  // Lezer's nested BulletList begins at its ListMark (and deliberately omits
  // leading indentation), so `container.from` cannot distinguish an outer
  // quote prefix from child-list indent. The current line's QuoteMark nodes
  // do: retain their stable marker/separator prefix, and keep only remaining
  // whitespace as list-relative indentation.
  const quotePrefixEnd = quotePrefixEndOnLine(state, line, item.from);
  if (quotePrefixEnd === null) return null;
  const outerPrefix = state.sliceDoc(line.from, quotePrefixEnd);
  const indent = state.sliceDoc(quotePrefixEnd, item.from);
  // Lezer establishes ListItem ownership; this only verifies that its source
  // prefix has not become a non-indentation literal between parse updates.
  if (!isIndentation(indent)) return null;
  const task = directChild(item, 'Task');
  const taskMarkerNode = task === null ? null : directChild(task, 'TaskMarker');
  const contentStart = taskMarkerNode
    ? skipWhitespace(state, taskMarkerNode.to, task!.to)
    : directChild(item, 'Paragraph')?.from ?? skipWhitespace(state, markerNode.to, item.to);
  // The direct ListMark belongs only to its marker line. A continuation/nested
  // body has no independently proven current-line marker in P4B, so it falls
  // back to source rather than reusing the first-line range.
  if (pos < contentStart || pos > line.to) return null;
  const marker = state.sliceDoc(markerNode.from, markerNode.to)
    + state.sliceDoc(markerNode.to, taskMarkerNode?.from ?? contentStart);
  const taskMarker = taskMarkerNode ? state.sliceDoc(taskMarkerNode.from, taskMarkerNode.to) : '';
  return {
    lineFrom: line.from,
    outerPrefix,
    prefixFrom: outerPrefix.length > 0 ? item.from : line.from,
    indent,
    item,
    container,
    indentFrom: quotePrefixEnd,
    indentTo: item.from,
    marker,
    taskMarker,
    ordered: container.name === 'OrderedList',
    ordinal: container.name === 'OrderedList'
      ? Number(state.sliceDoc(markerNode.from, markerNode.to).slice(0, -1))
      : null,
    orderedDigitsLength: Math.max(0, markerNode.to - markerNode.from - 1),
    contentStart,
    contentEnd: line.to,
    // The AST ListItem may include nested descendants. Empty is a property of
    // this marker's physical line, never of the whole subtree.
    empty: contentStart === line.to,
  };
}

function quoteAt(state: EditorState, pos: number): QuoteLine | null {
  const node = trustedOwnerAt(state, pos, (candidate) => candidate.name === 'Blockquote');
  if (!node) return null;
  const marker = directChild(node, 'QuoteMark');
  if (!marker || marker.from !== node.from) return null;
  const line = state.doc.lineAt(node.from);
  // This is deliberately a current-physical-line range. A blockquote's next
  // Paragraph child can begin on a later line, so deriving contentStart from
  // the whole Blockquote would make `> \n> child` falsely untrusted.
  if (marker.from < line.from || marker.to > line.to) return null;
  const contentStart = skipWhitespace(state, marker.to, line.to);
  // As with lists, never borrow a first-line QuoteMark for later quote body
  // lines unless a future per-line source map proves their ownership.
  if (pos < contentStart || pos > line.to) return null;
  return {
    node,
    line,
    // The inner QuoteMark may be preceded by an outer quote/list prefix on the
    // same physical line. Its continuation must retain every such owner.
    prefix: state.sliceDoc(line.from, contentStart),
    firstMarkerFrom: marker.from,
    firstMarkerTo: contentStart,
    contentStart,
    // Likewise a Blockquote can span subsequent quote lines; only the current
    // trusted marker line determines whether this Enter exits a quote layer.
    empty: contentStart === line.to,
  };
}

function previousSibling(state: EditorState, item: ListLine): ListLine | null {
  let previous: SyntaxNode | null = null;
  for (let child = item.container.firstChild; child; child = child.nextSibling) {
    if (child.from === item.item.from && child.to === item.item.to && child.name === item.item.name) break;
    if (child.name === 'ListItem') previous = child;
  }
  return previous ? listAt(state, directChild(previous, 'Paragraph')?.from ?? previous.to) : null;
}

function parentItem(state: EditorState, item: ListLine): ListLine | null {
  const parentItemNode = item.container.parent;
  if (!parentItemNode || parentItemNode.name !== 'ListItem') return null;
  return listAt(state, directChild(parentItemNode, 'Paragraph')?.from ?? parentItemNode.to);
}

interface DirectParentOutdent {
  readonly changes: readonly Change[];
  readonly deltaLength: number;
}

function isDescendantOf(node: SyntaxNode, ancestor: SyntaxNode): boolean {
  for (let current: SyntaxNode | null = node; current; current = current.parent) {
    // Lezer can materialize equivalent node wrappers while iterating a tree,
    // so identity alone is not a stable cross-lookup comparison.
    if (current === ancestor || (current.name === ancestor.name && current.from === ancestor.from && current.to === ancestor.to)) return true;
  }
  return false;
}

/**
 * Return every physical marker line belonging to one proven ListItem subtree.
 * A ListItem's `to` includes nested descendants, but it can also include
 * continuation prose whose prefix P4B cannot safely relocate.  Requiring a
 * direct ListMark on every covered physical line deliberately turns that case
 * into a handled NoOp instead of corrupting hierarchy by moving only a parent.
 */
function subtreeMarkerLines(state: EditorState, root: ListLine): readonly ListLine[] | null {
  const result: ListLine[] = [];
  let line = state.doc.lineAt(root.item.from);
  while (line.from < root.item.to || (result.length === 0 && line.from === root.lineFrom)) {
    const candidates: SyntaxNode[] = [];
    syntaxTree(state).iterate({
      from: line.from,
      to: line.to,
      enter(ref) {
        if (ref.name !== 'ListItem' || !isDescendantOf(ref.node, root.item)) return;
        const marker = directChild(ref.node, 'ListMark');
        if (marker && marker.from >= line.from && marker.to <= line.to) candidates.push(ref.node);
      },
    });
    if (candidates.length !== 1) return null;
    const resolved = listAt(state, line.to);
    if (!resolved
      || resolved.item.name !== candidates[0].name
      || resolved.item.from !== candidates[0].from
      || resolved.item.to !== candidates[0].to
      || resolved.outerPrefix !== root.outerPrefix) return null;
    result.push(resolved);
    if (line.to >= root.item.to || line.number === state.doc.lines) break;
    line = state.doc.line(line.number + 1);
  }
  return result;
}

function mapAnchorThroughChanges(anchor: number, changes: readonly Change[]): number {
  let mapped = anchor;
  for (const change of changes) {
    // All structural prefix changes are proved to end before their marker's
    // content range.  If that invariant ever stops holding, decline instead
    // of guessing CodeMirror's association at an overlapping endpoint.
    if (change.from >= anchor) continue;
    if (change.to > anchor) return anchor;
    mapped += change.insert.length - (change.to - change.from);
  }
  return mapped;
}

function subtreeIndentChanges(
  state: EditorState,
  root: ListLine,
  baseline: string,
  delta: string,
  direction: 'add' | 'remove',
): readonly Change[] | null {
  if (!isIndentation(baseline) || !isIndentation(delta) || delta.length === 0) return null;
  const lines = subtreeMarkerLines(state, root);
  if (!lines) return null;
  const changes: Change[] = [];
  for (const line of lines) {
    if (!line.indent.startsWith(baseline)) return null;
    const offset = line.indentFrom + baseline.length;
    if (direction === 'add') {
      changes.push({ from: offset, to: offset, insert: delta });
      continue;
    }
    if (state.sliceDoc(offset, offset + delta.length) !== delta) return null;
    changes.push({ from: offset, to: offset + delta.length, insert: '' });
  }
  return changes;
}

/**
 * Exiting an empty list item removes its own marker and promotes every proven
 * descendant marker by the direct child delta. That keeps the source tree
 * closed (rather than leaving indented children hanging below a paragraph).
 */
function topLevelExitChanges(state: EditorState, item: ListLine): readonly Change[] | null {
  const lines = subtreeMarkerLines(state, item);
  if (!lines) return null;
  const changes: Change[] = [{ from: item.prefixFrom, to: item.contentStart, insert: '' }];
  if (lines.length === 1) return changes;
  const firstChild = lines[1];
  if (!firstChild.indent.startsWith(item.indent)) return null;
  const delta = firstChild.indent.slice(item.indent.length);
  if (delta.length === 0 || !isIndentation(delta)) return null;
  const style = delta[0];
  if (!Array.from(delta).every((char) => char === style)) return null;
  for (const child of lines.slice(1)) {
    if (!child.indent.startsWith(item.indent)) return null;
    const offset = child.indentFrom + item.indent.length;
    if (state.sliceDoc(offset, offset + delta.length) !== delta) return null;
    changes.push({ from: offset, to: offset + delta.length, insert: '' });
  }
  return changes;
}

function directParentOutdent(state: EditorState, item: ListLine): DirectParentOutdent | null {
  const parent = parentItem(state, item);
  if (!parent) return null;
  // A direct child outdents by only the indentation introduced BELOW its
  // direct parent. Deleting `[lineFrom,item.from)` would erase every ancestor
  // level for a doubly nested item. Mixed tab/space prefixes cannot prove a
  // Markdown column mapping, so they deliberately decline.
  if (!item.indent.startsWith(parent.indent)) return null;
  const delta = item.indent.slice(parent.indent.length);
  if (delta.length === 0 || !isIndentation(delta)) return null;
  const deltaStyle = delta[0];
  if (!Array.from(delta).every((char) => char === deltaStyle)) return null;
  if (parent.indent.length > 0 && !Array.from(parent.indent).every((char) => char === deltaStyle)) {
    return null;
  }
  const changes = subtreeIndentChanges(state, item, parent.indent, delta, 'remove');
  if (!changes) return null;
  return { changes, deltaLength: delta.length };
}

function hasDirectParent(item: ListLine): boolean {
  return item.container.parent?.name === 'ListItem';
}

function outdentList(view: EditorView, item: ListLine, selectionPos = view.state.selection.main.head): boolean {
  const outdent = directParentOutdent(view.state, item);
  if (!outdent) return false;
  return dispatch(
    view,
    outdent.changes,
    mapAnchorThroughChanges(selectionPos, outdent.changes),
  );
}

function listContinuation(item: ListLine): string | null {
  // CommonMark limits ordered-list markers to nine digits. Continuing the
  // largest legal marker would produce ten digits, which Lezer correctly no
  // longer recognizes as a sibling list item; decline rather than emit a
  // structurally invalid patch.
  if (item.ordered && (item.ordinal === null || item.ordinal >= 999_999_999)) return null;
  const marker = item.ordered
    ? String((item.ordinal ?? 0) + 1) + item.marker.slice(item.orderedDigitsLength)
    : item.marker;
  return item.outerPrefix + item.indent + marker + (item.taskMarker ? '[ ] ' : '');
}

function fullContentSelection(
  from: number,
  to: number,
  contentStart: number,
  contentEnd: number,
): boolean {
  return from === contentStart && to === contentEnd;
}

function headingToParagraphChanges(heading: HeadingLine): readonly Change[] {
  const opening = { from: heading.structuralStart, to: heading.contentStart, insert: '' };
  return heading.closingMarkerFrom === null
    ? [opening]
    : [opening, { from: heading.contentEnd, to: heading.line.to, insert: '' }];
}

function rangeEnter(view: EditorView, from: number, to: number): boolean {
  const heading = headingFor(view.state, from);
  if (heading && to <= heading.contentEnd) {
    if (fullContentSelection(from, to, heading.contentStart, heading.contentEnd)) {
      if (heading.closingMarkerFrom !== null) {
        return dispatch(view, { from: heading.structuralStart, to: heading.line.to, insert: '' }, heading.structuralStart);
      }
      return dispatch(view, [
        { from: heading.structuralStart, to: heading.contentStart, insert: '' },
        { from, to, insert: '' },
      ], heading.structuralStart);
    }
    // Selection deletion collapses at contentStart before Enter is resolved.
    // A surviving heading therefore follows the normal contentStart row: its
    // new paragraph belongs before the intact heading, not after `# `.
    if (from === heading.contentStart) {
      return dispatch(view, [
        { from, to, insert: '' },
        { from: heading.structuralStart, to: heading.structuralStart, insert: '\n' + heading.outerPrefix },
      ], heading.structuralStart);
    }
    if (heading.closingMarkerFrom !== null) {
      // Keep the original closing syntax on the heading prefix, then make the
      // semantic suffix a plain paragraph. At semantic contentEnd this is the
      // same as appending a paragraph after the complete heading line.
      const closingSyntax = view.state.sliceDoc(heading.contentEnd, heading.line.to);
      const suffix = view.state.sliceDoc(to, heading.contentEnd);
      return dispatch(
        view,
        { from, to: heading.line.to, insert: closingSyntax + '\n' + heading.outerPrefix + suffix },
        from + closingSyntax.length + 1 + heading.outerPrefix.length,
      );
    }
    return dispatch(view, { from, to, insert: '\n' + heading.outerPrefix }, from + 1 + heading.outerPrefix.length);
  }
  const quote = quoteFor(view.state, from);
  if (quote && to <= quote.line.to) {
    if (fullContentSelection(from, to, quote.contentStart, quote.line.to)) {
      return dispatch(view, [
        { from: quote.firstMarkerFrom, to: quote.firstMarkerTo, insert: '' },
        { from, to, insert: '' },
      ], quote.firstMarkerFrom);
    }
    return dispatch(view, { from, to, insert: '\n' + quote.prefix }, from + 1 + quote.prefix.length);
  }
  const list = listFor(view.state, from);
  if (list && to <= list.contentEnd) {
    if (fullContentSelection(from, to, list.contentStart, list.contentEnd)) {
      const outdent = directParentOutdent(view.state, list);
      if (hasDirectParent(list) && !outdent) return true;
      if (outdent) {
        return dispatch(
          view,
          [...outdent.changes, { from, to, insert: '' }],
          mapAnchorThroughChanges(from, outdent.changes),
        );
      }
      const exit = topLevelExitChanges(view.state, list);
      if (!exit) return true;
      return dispatch(view, [...exit, { from, to, insert: '' }], list.prefixFrom);
    }
    const continuation = listContinuation(list);
    if (continuation === null) return true;
    return dispatch(view, { from, to, insert: '\n' + continuation }, from + 1 + continuation.length);
  }
  return dispatch(view, { from, to, insert: '\n' }, from + 1);
}

function rangeBackspace(view: EditorView, from: number, to: number): boolean {
  const heading = headingFor(view.state, from);
  if (heading && to <= heading.contentEnd && from === heading.contentStart) {
    if (heading.closingMarkerFrom !== null && fullContentSelection(from, to, heading.contentStart, heading.contentEnd)) {
        return dispatch(view, { from: heading.structuralStart, to: heading.line.to, insert: '' }, heading.structuralStart);
    }
    return dispatch(view, [
      ...headingToParagraphChanges(heading),
      { from, to, insert: '' },
    ], heading.structuralStart);
  }
  const quote = quoteFor(view.state, from);
  if (quote && to <= quote.line.to && from === quote.contentStart) {
    return dispatch(view, [
      { from: quote.firstMarkerFrom, to: quote.firstMarkerTo, insert: '' },
      { from, to, insert: '' },
    ], quote.firstMarkerFrom);
  }
  const list = listFor(view.state, from);
  if (list && to <= list.contentEnd && from === list.contentStart) {
    const outdent = directParentOutdent(view.state, list);
    if (hasDirectParent(list) && !outdent) return true;
    if (outdent) {
      return dispatch(
        view,
        [...outdent.changes, { from, to, insert: '' }],
        mapAnchorThroughChanges(from, outdent.changes),
      );
    }
    const exit = topLevelExitChanges(view.state, list);
    if (!exit) return true;
    return dispatch(view, [...exit, { from, to, insert: '' }], list.prefixFrom);
  }
  return dispatch(view, { from, to, insert: '' }, from);
}

function enter(view: EditorView): boolean {
  if (!canHandle(view)) return false;
  if (view.composing) return compositionStructuralOwner(view);
  if (!view.state.selection.main.empty && structuralCohortEnabled()) {
    const { from, to } = view.state.selection.main;
    return rangeEnter(view, from, to);
  }
  const pos = view.state.selection.main.head;
  const heading = headingFor(view.state, pos);
  if (heading) {
    if (heading.empty) {
      return dispatch(
        view,
        heading.closingMarkerFrom === null
          ? { from: heading.structuralStart, to: heading.contentStart, insert: '' }
          : { from: heading.structuralStart, to: heading.line.to, insert: '' },
        heading.structuralStart,
      );
    }
    if (pos === heading.contentStart) {
      return dispatch(view, { from: heading.structuralStart, to: heading.structuralStart, insert: '\n' + heading.outerPrefix }, heading.structuralStart);
    }
    if (heading.closingMarkerFrom !== null) {
      if (pos === heading.contentEnd) {
        return dispatch(view, { from: heading.line.to, to: heading.line.to, insert: '\n' }, heading.line.to + 1);
      }
      const closingSyntax = view.state.sliceDoc(heading.contentEnd, heading.line.to);
      const suffix = view.state.sliceDoc(pos, heading.contentEnd);
      return dispatch(
        view,
        { from: pos, to: heading.line.to, insert: closingSyntax + '\n' + heading.outerPrefix + suffix },
        pos + closingSyntax.length + 1 + heading.outerPrefix.length,
      );
    }
    // At the end a plain paragraph follows; in the middle the suffix is also
    // plain because no heading marker is copied after the inserted boundary.
    return dispatch(view, { from: pos, to: pos, insert: '\n' + heading.outerPrefix }, pos + 1 + heading.outerPrefix.length);
  }

  const quote = quoteFor(view.state, pos);
  if (quote) {
    if (quote.empty) {
    return dispatch(
      view,
      { from: quote.firstMarkerFrom, to: quote.firstMarkerTo, insert: '' },
      quote.firstMarkerFrom,
    );
    }
    if (pos === quote.contentStart) {
      return dispatch(
        view,
        { from: quote.line.from, to: quote.line.from, insert: quote.prefix + '\n' },
        quote.line.from + quote.prefix.length,
      );
    }
    return dispatch(view, { from: pos, to: pos, insert: '\n' + quote.prefix }, pos + 1 + quote.prefix.length);
  }
  const list = listFor(view.state, pos);
  if (!list) return false;
  if (list.empty) {
    if (outdentList(view, list)) return true;
    if (hasDirectParent(list)) return true;
    const exit = topLevelExitChanges(view.state, list);
    return exit ? dispatch(view, exit, list.prefixFrom) : true;
  }
  const continuation = listContinuation(list);
  if (continuation === null) return true;
  // A nonempty item creates its next sibling after its complete subtree, not
  // directly after the marker line where doing so would capture children.
  if (pos === list.contentEnd) {
    const subtree = subtreeMarkerLines(view.state, list);
    if (!subtree) return true;
    const insertAt = list.item.to;
    return dispatch(view, { from: insertAt, to: insertAt, insert: '\n' + continuation }, insertAt + 1 + continuation.length);
  }
  return dispatch(view, { from: pos, to: pos, insert: '\n' + continuation }, pos + 1 + continuation.length);
}

function backspace(view: EditorView): boolean {
  if (!canHandle(view)) return false;
  if (view.composing) return compositionStructuralOwner(view);
  if (!view.state.selection.main.empty && structuralCohortEnabled()) {
    const { from, to } = view.state.selection.main;
    return rangeBackspace(view, from, to);
  }
  const pos = view.state.selection.main.head;
  const heading = headingFor(view.state, pos);
  if (heading && pos === heading.contentStart) {
    return dispatch(view, headingToParagraphChanges(heading), heading.structuralStart);
  }
  const quote = quoteFor(view.state, pos);
  if (quote && pos === quote.contentStart) {
    return dispatch(
      view,
      { from: quote.firstMarkerFrom, to: quote.firstMarkerTo, insert: '' },
      quote.firstMarkerFrom,
    );
  }
  const list = listFor(view.state, pos);
  if (list && pos === list.contentStart) {
    if (outdentList(view, list)) return true;
    if (hasDirectParent(list)) return true;
    const exit = topLevelExitChanges(view.state, list);
    return exit ? dispatch(view, exit, list.prefixFrom) : true;
  }
  return false;
}

function deleteForward(view: EditorView): boolean {
  if (!canHandle(view) || !structuralCohortEnabled()) return false;
  if (view.composing) return compositionStructuralOwner(view);
  if (view.state.selection.main.empty) return false;
  const { from, to } = view.state.selection.main;
  return dispatch(view, { from, to, insert: '' }, from);
}

function indentList(
  view: EditorView,
  item: ListLine,
  collapseAt: number,
  selection?: { readonly from: number; readonly to: number },
): boolean {
  const fallback = () => selection
    ? dispatchSourceDeletion(view, selection.from, selection.to)
    : true;
  // The ADR defines a top-level/no-parent Tab as a handled NoOp. Returning
  // false here would let a lower-priority generic indentation command invent
  // an implicit parent.
  const parent = previousSibling(view.state, item);
  if (!parent) return fallback();
  if (parent.outerPrefix !== item.outerPrefix) return fallback();
  // CodeMirror offsets count a tab as one UTF-16 unit, not its Markdown visual
  // column. Do not manufacture a child prefix when either sibling needs tab or
  // mixed-width geometry; P4B keeps the exact source and leaves that ambiguity
  // for a future column-aware table/list substrate.
  if (parent.indent.includes('\t') || item.indent.includes('\t')) return fallback();
  // A child marker starts at its direct parent's content column. This retains
  // multi-digit ordered-list geometry without borrowing any unrelated block.
  const columns = Math.max(
    1,
    (parent.contentStart - parent.lineFrom) - (item.item.from - item.lineFrom),
  );
  const unit = ' '.repeat(columns);
  const changes = subtreeIndentChanges(view.state, item, item.indent, unit, 'add');
  if (!changes) return fallback();
  return dispatch(
    view,
    selection ? [...changes, { from: selection.from, to: selection.to, insert: '' }] : changes,
    mapAnchorThroughChanges(collapseAt, changes),
  );
}

function outdentListSelection(
  view: EditorView,
  item: ListLine,
  collapseAt: number,
  selection?: { readonly from: number; readonly to: number },
): boolean {
  const outdent = directParentOutdent(view.state, item);
  if (!outdent) return selection
    ? dispatchSourceDeletion(view, selection.from, selection.to)
    : true;
  return dispatch(
    view,
    selection ? [...outdent.changes, { from: selection.from, to: selection.to, insert: '' }] : outdent.changes,
    mapAnchorThroughChanges(collapseAt, outdent.changes),
  );
}

function selectedCurrentList(view: EditorView): {
  readonly item: ListLine | null;
  readonly from: number;
  readonly to: number;
} | null {
  const selection = view.state.selection.main;
  if (selection.empty) return null;
  // Do not turn Tab/Shift-Tab into deletion outside a trustworthy list row.
  // In particular unsafe fence/HTML/table descendants make structuralKindAt
  // return null, so ordinary CodeMirror owns those selections unchanged.
  if (!isQuoteListsEnabled() || structuralKindAt(view.state, selection.from) !== 'list') return null;
  const item = listAt(view.state, selection.from);
  if (!item) return null;
  if (selection.from < item.contentStart || selection.to > item.contentEnd) {
    return { item: null, from: selection.from, to: selection.to };
  }
  return { item, from: selection.from, to: selection.to };
}

function indent(view: EditorView): boolean {
  if (!canHandle(view)) return false;
  if (view.composing) return compositionStructuralOwner(view);
  if (!view.state.selection.main.empty) {
    const selected = selectedCurrentList(view);
    if (!selected) return false;
    return selected.item
      ? indentList(view, selected.item, selected.from, selected)
      : dispatchSourceDeletion(view, selected.from, selected.to);
  }
  // Indent/outdent are list-only commands. Keep their direct ListItem lookup
  // independent from Enter/Backspace's nearest-owner router so an end-of-line
  // cursor can still resolve its sibling container at a Lezer boundary.
  const item = isQuoteListsEnabled() ? listAt(view.state, view.state.selection.main.head) : null;
  if (!item) return false;
  return indentList(view, item, view.state.selection.main.head);
}

function outdent(view: EditorView): boolean {
  if (!canHandle(view)) return false;
  if (view.composing) return compositionStructuralOwner(view);
  if (!view.state.selection.main.empty) {
    const selected = selectedCurrentList(view);
    if (!selected) return false;
    return selected.item
      ? outdentListSelection(view, selected.item, selected.from, selected)
      : dispatchSourceDeletion(view, selected.from, selected.to);
  }
  const item = isQuoteListsEnabled() ? listAt(view.state, view.state.selection.main.head) : null;
  if (!item) return false;
  return outdentListSelection(view, item, view.state.selection.main.head);
}

/**
 * P4B command layer. It intentionally handles only trusted, collapsed
 * heading/list/quote positions. Table ranges have no widget owner in P4B, so
 * they fall through to source editing unchanged.
 */
export const structuralInteractionKeymap: Extension = Prec.highest(
  keymap.of([
    { key: 'Enter', run: enter },
    { key: 'Backspace', run: backspace },
    { key: 'Delete', run: deleteForward },
    { key: 'Tab', run: indent },
    { key: 'Shift-Tab', run: outdent },
  ] satisfies readonly KeyBinding[]),
);

/** P7 contract freeze only — no table widget or table command is implemented. */
export interface FrozenTableInteractionFixture {
  readonly name: string;
  readonly source: string;
  readonly trustedRanges: {
    readonly table: [number, number];
    readonly delimiter: [number, number];
    readonly rows: readonly [number, number][];
    readonly cells: readonly [number, number][];
    /** Exact source slices make half-open fixture coordinates auditable. */
    readonly fragments: {
      readonly table: string;
      readonly delimiter: string;
      readonly rows: readonly string[];
      readonly cells: readonly string[];
    };
  } | null;
  readonly selection: { readonly anchor: number; readonly head: number };
  readonly composing: boolean;
  /** Only EOL-sensitive append rows need raw-byte provenance in P4B. */
  readonly eolContext?: {
    readonly rawSource: string;
    readonly lineEndings: readonly ('lf' | 'crlf' | 'cr')[];
  };
  /** P7-only typed slot metadata; null means no table range was trusted. */
  readonly cellSlot: TableCellSlotProtocol | null;
  readonly operation:
    | 'Click'
    | 'ArrowLeft'
    | 'ArrowRight'
    | 'ArrowUp'
    | 'ArrowDown'
    | 'Tab'
    | 'Shift-Tab'
    | 'Enter'
    | 'Escape'
    | 'Home'
    | 'End';
  /** Projection decision only: reveal exact source; never construct a widget. */
  readonly p4bProjectionDecision: {
    readonly action: 'RevealSource';
    readonly sourceAfter: string;
    readonly changes: readonly Change[];
    readonly focus: 'source';
    readonly selectionAfter: { readonly anchor: number; readonly head: number };
    readonly fallback: 'exact-source';
  };
  /** Frozen P7 target — intentionally declarative, never dispatched by P4B. */
  readonly p7Expected: {
    readonly action: 'EnterCellSlot' | 'MoveCell' | 'AppendRow' | 'CommitAndMove' | 'NoOp' | 'DelegateToCodeMirror' | 'RevealSource';
    readonly sourceAfter: string;
    readonly changes: readonly (Change & {
      /** One provenance entry for every logical LF in this P7 change. */
      readonly insertedLineEndings: readonly ('inherit' | 'lf' | 'crlf' | 'cr')[];
    })[];
    readonly affectedRanges: readonly [number, number][];
    /** Required to distinguish first/second Escape with identical source key. */
    readonly beforeFocus: 'cell-slot' | 'table-widget' | 'source';
    readonly focus: 'cell-slot' | 'table-widget' | 'source';
    readonly selectionAfter: { readonly anchor: number; readonly head: number };
    readonly targetCell: number | null;
    /** Absolute source offset in the target cell, after P7 column clamping. */
    readonly targetSourceOffset: number | null;
    readonly fallback: 'exact-source' | null;
    /** Widget command history is atomic; navigation/reveal/delegation has none. */
    readonly historyGroup: 'single' | 'none';
    readonly undoExpectation: 'restore-source-and-selection' | 'none';
    /** Appended cells use post-change canonical content points/ranges. */
    readonly postChangeCellRanges: readonly [number, number][];
    /** Raw EOL result for EOL-sensitive append rows; P4B never executes it. */
    readonly rawSourceAfter: string | null;
  };
}

const TABLE_SOURCE = '| a | b |\n|---|---|\n| 1 | 2 |';
const TABLE_RANGES = {
  table: [0, 29] as [number, number],
  delimiter: [10, 19] as [number, number],
  rows: [[0, 9], [20, 29]] as readonly [number, number][],
  cells: [[2, 3], [6, 7], [22, 23], [26, 27]] as readonly [number, number][],
  fragments: {
    table: TABLE_SOURCE, delimiter: '|---|---|', rows: ['| a | b |', '| 1 | 2 |'], cells: ['a', 'b', '1', '2'],
  },
};
const TABLE_CELL_SLOT: TableCellSlotProtocol = {
  table: { from: 0, to: 29 },
  delimiter: { from: 10, to: 19 },
  rows: [{ from: 0, to: 9 }, { from: 20, to: 29 }],
  cells: [{ from: 2, to: 3 }, { from: 6, to: 7 }, { from: 22, to: 23 }, { from: 26, to: 27 }],
  interaction: { atomic: true, revealOnFocus: 'source', readOnly: 'source-drop' },
  fallback: 'exact-source',
};
const TABLE_TWO_DATA_ROWS_SOURCE = `${TABLE_SOURCE}\n| 3 | 4 |`;
const TABLE_TWO_DATA_ROWS_RANGES = {
  table: [0, 39] as [number, number],
  delimiter: [10, 19] as [number, number],
  rows: [[0, 9], [20, 29], [30, 39]] as readonly [number, number][],
  cells: [[2, 3], [6, 7], [22, 23], [26, 27], [32, 33], [36, 37]] as readonly [number, number][],
  fragments: {
    table: TABLE_TWO_DATA_ROWS_SOURCE, delimiter: '|---|---|', rows: ['| a | b |', '| 1 | 2 |', '| 3 | 4 |'], cells: ['a', 'b', '1', '2', '3', '4'],
  },
};
const TABLE_TWO_DATA_ROWS_CELL_SLOT: TableCellSlotProtocol = {
  table: { from: 0, to: 39 }, delimiter: { from: 10, to: 19 },
  rows: [{ from: 0, to: 9 }, { from: 20, to: 29 }, { from: 30, to: 39 }],
  cells: [{ from: 2, to: 3 }, { from: 6, to: 7 }, { from: 22, to: 23 }, { from: 26, to: 27 }, { from: 32, to: 33 }, { from: 36, to: 37 }],
  interaction: { atomic: true, revealOnFocus: 'source', readOnly: 'source-drop' }, fallback: 'exact-source',
};
const TABLE_COLUMN_CLAMP_SOURCE = '| aa | b |\n|----|---|\n| wide | q |\n| z | r |';
const TABLE_COLUMN_CLAMP_RANGES = {
  table: [0, 44] as [number, number], delimiter: [11, 21] as [number, number],
  rows: [[0, 10], [22, 34], [35, 44]] as readonly [number, number][],
  cells: [[2, 4], [7, 8], [24, 28], [31, 32], [37, 38], [41, 42]] as readonly [number, number][],
  fragments: {
    table: TABLE_COLUMN_CLAMP_SOURCE, delimiter: '|----|---|', rows: ['| aa | b |', '| wide | q |', '| z | r |'], cells: ['aa', 'b', 'wide', 'q', 'z', 'r'],
  },
};
const TABLE_COLUMN_CLAMP_CELL_SLOT: TableCellSlotProtocol = {
  table: { from: 0, to: 44 }, delimiter: { from: 11, to: 21 },
  rows: [{ from: 0, to: 10 }, { from: 22, to: 34 }, { from: 35, to: 44 }],
  cells: [{ from: 2, to: 4 }, { from: 7, to: 8 }, { from: 24, to: 28 }, { from: 31, to: 32 }, { from: 37, to: 38 }, { from: 41, to: 42 }],
  interaction: { atomic: true, revealOnFocus: 'source', readOnly: 'source-drop' }, fallback: 'exact-source',
};

function frozenTableRow(
  name: string,
  operation: FrozenTableInteractionFixture['operation'],
  selection: FrozenTableInteractionFixture['selection'],
  p7Expected: FrozenTableInteractionFixture['p7Expected'],
  composing = false,
): FrozenTableInteractionFixture {
  return {
    name,
    source: TABLE_SOURCE,
    trustedRanges: TABLE_RANGES,
    cellSlot: TABLE_CELL_SLOT,
    selection,
    composing,
    operation,
    p4bProjectionDecision: {
      action: 'RevealSource', sourceAfter: TABLE_SOURCE, changes: [], focus: 'source',
      selectionAfter: selection, fallback: 'exact-source',
    },
    p7Expected,
  };
}

function p7(
  action: FrozenTableInteractionFixture['p7Expected']['action'],
  selectionAfter: FrozenTableInteractionFixture['selection'],
  targetCell: number | null,
  options: Partial<Omit<FrozenTableInteractionFixture['p7Expected'], 'action' | 'selectionAfter' | 'targetCell'>> = {},
): FrozenTableInteractionFixture['p7Expected'] {
  return {
    action,
    sourceAfter: options.sourceAfter ?? TABLE_SOURCE,
    changes: options.changes ?? [],
    affectedRanges: options.affectedRanges ?? [],
    beforeFocus: options.beforeFocus ?? 'cell-slot',
    focus: options.focus ?? 'cell-slot',
    selectionAfter,
    targetCell,
    targetSourceOffset: targetCell === null ? null : selectionAfter.anchor,
    fallback: options.fallback ?? null,
    historyGroup: options.historyGroup ?? (action === 'AppendRow' || action === 'CommitAndMove' ? 'single' : 'none'),
    undoExpectation: options.undoExpectation ?? (action === 'AppendRow' || action === 'CommitAndMove' ? 'restore-source-and-selection' : 'none'),
    postChangeCellRanges: options.postChangeCellRanges ?? [],
    rawSourceAfter: options.rawSourceAfter ?? null,
  };
}

function withRawEol(source: string, eol: '\r\n' | '\r'): string {
  return source.replace(/\n/g, eol);
}

/** P7 append freeze: UTF-16 positions remain logical while raw EOL bytes inherit. */
function frozenAppendEolRow(
  name: string,
  eol: '\r\n' | '\r',
  lineEndings: readonly ('crlf' | 'cr')[],
): FrozenTableInteractionFixture {
  const sourceAfter = `${TABLE_SOURCE}\n|   |   |`;
  return {
    name,
    source: TABLE_SOURCE,
    eolContext: { rawSource: withRawEol(TABLE_SOURCE, eol), lineEndings },
    trustedRanges: TABLE_RANGES,
    cellSlot: TABLE_CELL_SLOT,
    selection: { anchor: 26, head: 26 },
    composing: false,
    operation: 'Tab',
    p4bProjectionDecision: {
      action: 'RevealSource', sourceAfter: TABLE_SOURCE, changes: [], focus: 'source',
      selectionAfter: { anchor: 26, head: 26 }, fallback: 'exact-source',
    },
    p7Expected: p7('AppendRow', { anchor: 32, head: 32 }, 4, {
      sourceAfter,
      changes: [{ from: 29, to: 29, insert: '\n|   |   |', insertedLineEndings: ['inherit'] }],
      affectedRanges: [[29, 29]],
      postChangeCellRanges: [[32, 32], [36, 36]],
      rawSourceAfter: withRawEol(sourceAfter, eol),
    }),
  };
}

/** Every §5 row freezes P4B's exact-source result AND P7's intended result. */
export const FROZEN_TABLE_INTERACTION_FIXTURES: readonly FrozenTableInteractionFixture[] = Object.freeze([
  frozenTableRow('click-enters-cell-slot', 'Click', { anchor: 2, head: 2 }, p7('EnterCellSlot', { anchor: 2, head: 2 }, 0)),
  frozenTableRow('arrow-left-within-cell-moves-one-source-position', 'ArrowLeft', { anchor: 3, head: 3 }, p7('MoveCell', { anchor: 2, head: 2 }, 0)),
  frozenTableRow('arrow-right-within-cell-moves-one-source-position', 'ArrowRight', { anchor: 2, head: 2 }, p7('MoveCell', { anchor: 3, head: 3 }, 0)),
  frozenTableRow('arrow-left-at-first-content-start-is-noop', 'ArrowLeft', { anchor: 2, head: 2 }, p7('NoOp', { anchor: 2, head: 2 }, 0)),
  frozenTableRow('arrow-left-at-second-cell-start-enters-previous-cell', 'ArrowLeft', { anchor: 6, head: 6 }, p7('MoveCell', { anchor: 3, head: 3 }, 0)),
  frozenTableRow('arrow-right-at-content-end-enters-next-cell', 'ArrowRight', { anchor: 3, head: 3 }, p7('MoveCell', { anchor: 6, head: 6 }, 1)),
  frozenTableRow('arrow-right-at-last-cell-end-is-noop', 'ArrowRight', { anchor: 27, head: 27 }, p7('NoOp', { anchor: 27, head: 27 }, 3)),
  frozenTableRow('arrow-up-at-first-data-row-is-noop', 'ArrowUp', { anchor: 22, head: 22 }, p7('NoOp', { anchor: 22, head: 22 }, 2)),
  frozenTableRow('arrow-down-at-last-data-row-is-noop', 'ArrowDown', { anchor: 22, head: 22 }, p7('NoOp', { anchor: 22, head: 22 }, 2)),
  {
    name: 'arrow-down-moves-to-same-column-in-next-data-row', source: TABLE_TWO_DATA_ROWS_SOURCE,
    trustedRanges: TABLE_TWO_DATA_ROWS_RANGES, cellSlot: TABLE_TWO_DATA_ROWS_CELL_SLOT,
    selection: { anchor: 23, head: 23 }, composing: false, operation: 'ArrowDown',
    p4bProjectionDecision: { action: 'RevealSource', sourceAfter: TABLE_TWO_DATA_ROWS_SOURCE, changes: [], focus: 'source', selectionAfter: { anchor: 23, head: 23 }, fallback: 'exact-source' },
    p7Expected: { action: 'MoveCell', sourceAfter: TABLE_TWO_DATA_ROWS_SOURCE, changes: [], affectedRanges: [], beforeFocus: 'cell-slot', focus: 'cell-slot', selectionAfter: { anchor: 33, head: 33 }, targetCell: 4, targetSourceOffset: 33, fallback: null, historyGroup: 'none', undoExpectation: 'none', postChangeCellRanges: [], rawSourceAfter: null },
  },
  {
    name: 'arrow-up-moves-to-same-column-in-previous-data-row', source: TABLE_TWO_DATA_ROWS_SOURCE,
    trustedRanges: TABLE_TWO_DATA_ROWS_RANGES, cellSlot: TABLE_TWO_DATA_ROWS_CELL_SLOT,
    selection: { anchor: 33, head: 33 }, composing: false, operation: 'ArrowUp',
    p4bProjectionDecision: { action: 'RevealSource', sourceAfter: TABLE_TWO_DATA_ROWS_SOURCE, changes: [], focus: 'source', selectionAfter: { anchor: 33, head: 33 }, fallback: 'exact-source' },
    p7Expected: { action: 'MoveCell', sourceAfter: TABLE_TWO_DATA_ROWS_SOURCE, changes: [], affectedRanges: [], beforeFocus: 'cell-slot', focus: 'cell-slot', selectionAfter: { anchor: 23, head: 23 }, targetCell: 2, targetSourceOffset: 23, fallback: null, historyGroup: 'none', undoExpectation: 'none', postChangeCellRanges: [], rawSourceAfter: null },
  },
  {
    name: 'enter-in-a-nonfinal-row-moves-to-same-column-in-existing-next-row', source: TABLE_TWO_DATA_ROWS_SOURCE,
    trustedRanges: TABLE_TWO_DATA_ROWS_RANGES, cellSlot: TABLE_TWO_DATA_ROWS_CELL_SLOT,
    selection: { anchor: 26, head: 26 }, composing: false, operation: 'Enter',
    p4bProjectionDecision: { action: 'RevealSource', sourceAfter: TABLE_TWO_DATA_ROWS_SOURCE, changes: [], focus: 'source', selectionAfter: { anchor: 26, head: 26 }, fallback: 'exact-source' },
    p7Expected: { action: 'CommitAndMove', sourceAfter: TABLE_TWO_DATA_ROWS_SOURCE, changes: [], affectedRanges: [], beforeFocus: 'cell-slot', focus: 'cell-slot', selectionAfter: { anchor: 36, head: 36 }, targetCell: 5, targetSourceOffset: 36, fallback: null, historyGroup: 'single', undoExpectation: 'restore-source-and-selection', postChangeCellRanges: [], rawSourceAfter: null },
  },
  {
    name: 'arrow-down-clamps-column-offset-to-shorter-target-cell', source: TABLE_COLUMN_CLAMP_SOURCE,
    trustedRanges: TABLE_COLUMN_CLAMP_RANGES, cellSlot: TABLE_COLUMN_CLAMP_CELL_SLOT,
    // `wide` offset 2 moves to one-character `z`; the P7 target therefore
    // clamps at its content end (absolute source position 38), not row text.
    selection: { anchor: 26, head: 26 }, composing: false, operation: 'ArrowDown',
    p4bProjectionDecision: { action: 'RevealSource', sourceAfter: TABLE_COLUMN_CLAMP_SOURCE, changes: [], focus: 'source', selectionAfter: { anchor: 26, head: 26 }, fallback: 'exact-source' },
    p7Expected: { action: 'MoveCell', sourceAfter: TABLE_COLUMN_CLAMP_SOURCE, changes: [], affectedRanges: [], beforeFocus: 'cell-slot', focus: 'cell-slot', selectionAfter: { anchor: 38, head: 38 }, targetCell: 4, targetSourceOffset: 38, fallback: null, historyGroup: 'none', undoExpectation: 'none', postChangeCellRanges: [], rawSourceAfter: null },
  },
  frozenTableRow('tab-enters-next-cell', 'Tab', { anchor: 22, head: 22 }, p7('MoveCell', { anchor: 26, head: 26 }, 3)),
  frozenTableRow('tab-at-last-data-cell-appends-one-row', 'Tab', { anchor: 26, head: 26 }, p7('AppendRow', { anchor: 32, head: 32 }, 4, {
    sourceAfter: `${TABLE_SOURCE}\n|   |   |`,
    changes: [{ from: 29, to: 29, insert: '\n|   |   |', insertedLineEndings: ['inherit'] }], affectedRanges: [[29, 29]],
    postChangeCellRanges: [[32, 32], [36, 36]],
  })),
  frozenTableRow('shift-tab-at-first-cell-is-noop', 'Shift-Tab', { anchor: 2, head: 2 }, p7('NoOp', { anchor: 2, head: 2 }, 0)),
  frozenTableRow('shift-tab-at-second-cell-moves-to-previous-cell', 'Shift-Tab', { anchor: 6, head: 6 }, p7('MoveCell', { anchor: 2, head: 2 }, 0)),
  frozenTableRow('enter-commits-and-appends-after-last-data-row', 'Enter', { anchor: 26, head: 26 }, p7('CommitAndMove', { anchor: 36, head: 36 }, 5, {
    sourceAfter: `${TABLE_SOURCE}\n|   |   |`, changes: [{ from: 29, to: 29, insert: '\n|   |   |', insertedLineEndings: ['inherit'] }], affectedRanges: [[29, 29]],
    postChangeCellRanges: [[32, 32], [36, 36]],
  })),
  frozenTableRow('escape-from-cell-slot-commits-and-focuses-table-widget', 'Escape', { anchor: 22, head: 22 }, p7('CommitAndMove', { anchor: 22, head: 22 }, 2, { beforeFocus: 'cell-slot', focus: 'table-widget' })),
  frozenTableRow('escape-from-table-widget-reveals-table-source', 'Escape', { anchor: 22, head: 22 }, p7('RevealSource', { anchor: 0, head: 0 }, null, { beforeFocus: 'table-widget', focus: 'source', fallback: 'exact-source' })),
  frozenTableRow('home-moves-to-current-cell-start', 'Home', { anchor: 3, head: 3 }, p7('MoveCell', { anchor: 2, head: 2 }, 0)),
  frozenTableRow('end-moves-to-current-cell-end', 'End', { anchor: 2, head: 2 }, p7('MoveCell', { anchor: 3, head: 3 }, 0)),
  frozenTableRow('composition-delegates-without-cross-cell-navigation', 'Enter', { anchor: 3, head: 3 }, p7('DelegateToCodeMirror', { anchor: 3, head: 3 }, 0), true),
  frozenTableRow('composition-arrow-delegates-without-cross-cell-navigation', 'ArrowRight', { anchor: 3, head: 3 }, p7('DelegateToCodeMirror', { anchor: 3, head: 3 }, 0), true),
  frozenTableRow('composition-tab-delegates-without-cross-cell-navigation', 'Tab', { anchor: 3, head: 3 }, p7('DelegateToCodeMirror', { anchor: 3, head: 3 }, 0), true),
  frozenTableRow('nonempty-selection-enter-commits-last-data-cell-without-deleting-selection', 'Enter', { anchor: 26, head: 27 }, p7('CommitAndMove', { anchor: 36, head: 36 }, 5, {
    sourceAfter: `${TABLE_SOURCE}\n|   |   |`, changes: [{ from: 29, to: 29, insert: '\n|   |   |', insertedLineEndings: ['inherit'] }], affectedRanges: [[29, 29]],
    postChangeCellRanges: [[32, 32], [36, 36]],
  })),
  frozenTableRow('nonempty-selection-arrow-delegates-cell-local-selection-semantics', 'ArrowRight', { anchor: 2, head: 3 }, p7('DelegateToCodeMirror', { anchor: 3, head: 3 }, 0)),
  frozenTableRow('nonempty-selection-tab-commits-without-deleting-selection', 'Tab', { anchor: 2, head: 3 }, p7('MoveCell', { anchor: 6, head: 6 }, 1)),
  frozenTableRow('nonempty-selection-shift-tab-commits-without-deleting-selection', 'Shift-Tab', { anchor: 6, head: 7 }, p7('MoveCell', { anchor: 2, head: 2 }, 0)),
  frozenAppendEolRow('append-row-crlf-inherits-current-eol', '\r\n', ['crlf', 'crlf']),
  frozenAppendEolRow('append-row-cr-inherits-current-eol', '\r', ['cr', 'cr']),
  // The final existing separator is CR, therefore the appended boundary is
  // CR too; logical UTF-16 table/cell offsets remain unchanged by raw width.
  {
    ...frozenAppendEolRow('append-row-mixed-inherits-current-eol', '\r', ['crlf', 'cr']),
    eolContext: { rawSource: '| a | b |\r\n|---|---|\r| 1 | 2 |', lineEndings: ['crlf', 'cr'] },
    p7Expected: p7('AppendRow', { anchor: 32, head: 32 }, 4, {
      sourceAfter: `${TABLE_SOURCE}\n|   |   |`,
      changes: [{ from: 29, to: 29, insert: '\n|   |   |', insertedLineEndings: ['inherit'] }],
      affectedRanges: [[29, 29]], postChangeCellRanges: [[32, 32], [36, 36]],
      rawSourceAfter: '| a | b |\r\n|---|---|\r| 1 | 2 |\r|   |   |',
    }),
  },
  ...([
    ['escaped-pipe-cell-remains-untrusted-source', '| a\\|b | c |\n|---|---|\n| 1 | 2 |'],
    ['multiline-cell-remains-untrusted-source', '| a | b |\n|---|---|\n| one\n two | 2 |'],
    ['nested-html-cell-remains-untrusted-source', '| <span>a</span> | b |\n|---|---|\n| 1 | 2 |'],
  ] as const).map(([name, source]) => ({
    name,
    source,
    trustedRanges: null,
    cellSlot: null,
    selection: { anchor: 0, head: 0 },
    composing: false,
    operation: 'Enter' as const,
    p4bProjectionDecision: {
      action: 'RevealSource' as const, sourceAfter: source, changes: [], focus: 'source' as const,
      selectionAfter: { anchor: 0, head: 0 }, fallback: 'exact-source' as const,
    },
    p7Expected: {
      action: 'RevealSource' as const, sourceAfter: source, changes: [], affectedRanges: [], beforeFocus: 'source' as const,
      focus: 'source' as const, selectionAfter: { anchor: 0, head: 0 }, targetCell: null, targetSourceOffset: null, fallback: 'exact-source' as const,
      historyGroup: 'none' as const, undoExpectation: 'none' as const, postChangeCellRanges: [], rawSourceAfter: null,
    },
  })),
  {
    name: 'malformed-delimiter-remains-exact-source',
    source: '| a | b |\n|--|---|\n| 1 | 2 |',
    trustedRanges: null,
    cellSlot: null,
    selection: { anchor: 3, head: 3 },
    composing: true,
    operation: 'Enter',
    p4bProjectionDecision: {
      action: 'RevealSource',
      sourceAfter: '| a | b |\n|--|---|\n| 1 | 2 |',
      changes: [],
      focus: 'source',
      selectionAfter: { anchor: 3, head: 3 },
      fallback: 'exact-source',
    },
    p7Expected: {
      action: 'RevealSource', sourceAfter: '| a | b |\n|--|---|\n| 1 | 2 |', changes: [], affectedRanges: [], beforeFocus: 'source',
      focus: 'source', selectionAfter: { anchor: 3, head: 3 }, targetCell: null, targetSourceOffset: null, fallback: 'exact-source',
      historyGroup: 'none', undoExpectation: 'none', postChangeCellRanges: [], rawSourceAfter: null,
    },
  },
]);
