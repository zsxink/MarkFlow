// P4B task 7.4 — widget source-range mathematics (shared, pure, Lezer-trusted).
//
// Both pilot widgets (task checkbox, code fence controls) must locate their
// interactive marker/source ranges WITHOUT textContent/slice indexing: the ONLY
// trusted local source-map is the Lezer syntax tree (P4A ADR §3.1 terminal
// `SPIKE_COMPLETE_NO_CORE_IR`). This module computes the shapes a 7.4 widget
// needs from the tree itself:
//
//   - task items: the `Task` node (construct span) and its `TaskMarker` child
//     (exactly `[ ]`/`[x]`/`[X]`, length 3) — the exact checkbox source span a
//     click toggles;
//   - fences: the `FencedCode` node (construct span), the opening `CodeMark`,
//     the `CodeInfo` info-string span (the ONLY patchable region), the leading
//     language token (the exact patchable span), and the `CodeText` code body
//     (what copy reads — from source, never DOM);
//   - visible-range collectors, so the pilot renders widgets only for the
//     constructs the user can see (mirrors the projection viewport closure;
//     off-screen blocks are never parsed or decorated).
//
// All ranges are UTF-16 half-open `[from, to)` in the CodeMirror
// `EditorState.doc` coordinate system — the same system the local projection
// and the widget protocol (`protocol.ts` SourceInterval) use. Nothing here reads
// DOM textContent; nothing here builds a transaction; nothing here renders.

import { EditorView } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

/** A single source-computed task-item widget target. */
export interface TaskWidgetTarget {
  /** Enclosing `Task` node range `[from, to)` — the widget's source range. */
  source: { from: number; to: number };
  /** The inner content (text after the marker) inside the Task. */
  content: { from: number; to: number };
  /** The `[ ]` / `[x]` marker span — the click target AND the toggle patch. */
  marker: { from: number; to: number };
  /** True when the source marker is the completed form `[x]` / `[X]`. */
  checked: boolean;
  /** The plain item text (source-derived, for the a11y name / aria-checked). */
  name: string;
}

/** A single fence widget target (owner `fence`). */
export interface FenceWidgetTarget {
  /** Enclosing `FencedCode` node range `[from, to)` — the widget source range. */
  source: { from: number; to: number };
  /** The code body `CodeText` span (empty allowed) — what copy reads. */
  content: { from: number; to: number };
  /** The opening backtick/tilde marker span (`CodeMark`). */
  openMark: { from: number; to: number };
  /**
   * The info string span (`CodeInfo`) inside the opening marker, if present.
   * Absent → `null`. This is the ONLY region a fence widget may patch, and only
   * its leading language token is ever replaced (the rest of the info string —
   * e.g. attributes — stays untouched).
   */
  info: { from: number; to: number } | null;
  /** The leading language token of the info string ('' when there is none). */
  language: string;
  /** The language token span inside `info` (the exact patchable span), or null. */
  langToken: { from: number; to: number } | null;
}

/** Shared read-only + live-preview context every widget consumes. */
export interface WidgetViewContext {
  view: EditorView;
  /** True only while the live preview projection is active (preview mode +
   *  flag). The 7.4 harness installs this plugin in the SAME projection
   *  compartment, so its presence already proves projecting. */
  projecting: boolean;
  /** True when the view is read-only: widgets render disabled, never commit. */
  readOnly: boolean;
}

const TASK_NODE = 'Task';
const TASK_MARKER_NODE = 'TaskMarker';
const FENCE_NODE = 'FencedCode';
const CODE_MARK_NODE = 'CodeMark';
const CODE_INFO_NODE = 'CodeInfo';
const CODE_TEXT_NODE = 'CodeText';

const MARKER_UNCHECKED = '[ ]';
const MARKER_CHECKED_LOWER = '[x]';
const MARKER_CHECKED_UPPER = '[X]';

/** Minimal structural subset of a Lezer `SyntaxNode` used by this module. */
export interface SyntaxNodeLike {
  readonly from: number;
  readonly to: number;
  readonly name: string;
  readonly parent: SyntaxNodeLike | null;
  readonly firstChild: SyntaxNodeLike | null;
  readonly nextSibling: SyntaxNodeLike | null;
}

/** Find the nearest ancestor of `node` (inclusive) whose name equals `name`. */
export function nearestAncestor(node: SyntaxNodeLike, name: string): SyntaxNodeLike | null {
  for (let n: SyntaxNodeLike | null = node; n; n = n.parent) {
    if (n.name === name) return n;
  }
  return null;
}

/** The `Task` node containing `pos` (doc coordinates), or null. */
export function taskNodeAt(state: EditorState, pos: number): SyntaxNodeLike | null {
  if (pos < 0 || pos > state.doc.length) return null;
  const node = syntaxTree(state).resolveInner(pos, 0);
  return nearestAncestor(node, TASK_NODE);
}

/** The `FencedCode` node containing `pos` (doc coordinates), or null. */
export function fenceNodeAt(state: EditorState, pos: number): SyntaxNodeLike | null {
  if (pos < 0 || pos > state.doc.length) return null;
  const node = syntaxTree(state).resolveInner(pos, 0);
  return nearestAncestor(node, FENCE_NODE);
}

/** First DIRECT child of `node` whose name equals `name`, or null. */
function firstChildNamed(node: SyntaxNodeLike, name: string): SyntaxNodeLike | null {
  for (let child: SyntaxNodeLike | null = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

/** Last direct child of `node` whose name equals `name`, or null. */
function lastChildNamed(node: SyntaxNodeLike, name: string): SyntaxNodeLike | null {
  let found: SyntaxNodeLike | null = null;
  for (let child: SyntaxNodeLike | null = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) found = child;
  }
  return found;
}

/** True when `[from, to)` intersects at least one visible range. */
function intersectsVisible(
  from: number,
  to: number,
  visible: readonly { from: number; to: number }[],
): boolean {
  return visible.some((r) => from < r.to && to > r.from);
}

/** Build a `TaskWidgetTarget` from a `Task` node (source-derived only). */
function targetFromTaskNode(node: SyntaxNodeLike, state: EditorState): TaskWidgetTarget | null {
  const marker = firstChildNamed(node, TASK_MARKER_NODE);
  if (!marker || marker.to - marker.from !== 3) return null;
  const markerText = state.doc.slice(marker.from, marker.to).toString();
  if (markerText !== MARKER_UNCHECKED && markerText !== MARKER_CHECKED_LOWER && markerText !== MARKER_CHECKED_UPPER) {
    return null;
  }
  return {
    source: { from: node.from, to: node.to },
    content: { from: marker.to, to: node.to },
    marker: { from: marker.from, to: marker.to },
    checked: markerText !== MARKER_UNCHECKED,
    // Screen-reader name is the item's SOURCE text (design 05 §8: the reader
    // must never lose the Markdown). Single-line-bounded; a CJK/emoji item
    // keeps its full UTF-16 course.
    name: state.doc.lineAt(node.from).text.trim(),
  };
}

/** Build a `FenceWidgetTarget` from a `FencedCode` node (source-derived only). */
function targetFromFenceNode(node: SyntaxNodeLike, state: EditorState): FenceWidgetTarget | null {
  const openMark = firstChildNamed(node, CODE_MARK_NODE);
  if (!openMark) return null;
  const codeText = firstChildNamed(node, CODE_TEXT_NODE);
  const info = firstChildNamed(node, CODE_INFO_NODE);
  const infoText = info ? state.doc.slice(info.from, info.to).toString() : '';
  // Language = the leading whitespace-delimited token of the info string
  // (````` ```js title="x" ```` → 'js'; ```` ``` ```` → ''). Pure source-derived.
  const trimmed = infoText.trimStart();
  const infoStartOffset = infoText.length - trimmed.length;
  const langEndRel = trimmed.search(/[\s/]/);
  const language = langEndRel === -1 ? trimmed : trimmed.slice(0, langEndRel);
  const langToken = info && language !== ''
    ? { from: info.from + infoStartOffset, to: info.from + infoStartOffset + language.length }
    : null;
  return {
    source: { from: node.from, to: node.to },
    content: codeText ? { from: codeText.from, to: codeText.to } : { from: openMark.to, to: openMark.to },
    openMark: { from: openMark.from, to: openMark.to },
    info: info ? { from: info.from, to: info.to } : null,
    language: info ? language : '',
    langToken,
  };
}

/**
 * Compute the task-item widget target at `pos`, re-resolved from the CURRENT
 * doc at CURRENT coordinates — never a cached position (protocol: ranges shift
 * with edits; a commit must target today's span, not the span that was on
 * screen when the widget was built). Returns null when the position is not
 * inside a GFM task item.
 */
export function taskItemAt(view: EditorView, pos: number): TaskWidgetTarget | null {
  return taskTargetFromState(view.state, pos);
}

/** State-only variant of `taskItemAt` (unit + commit path, no view needed). */
export function taskTargetFromState(state: EditorState, pos: number): TaskWidgetTarget | null {
  const task = taskNodeAt(state, pos);
  return task ? targetFromTaskNode(task, state) : null;
}

/**
 * Compute the code-fence widget target at `pos`, re-resolved from the CURRENT
 * doc. Returns null when the position is not inside a fence.
 */
export function fenceAt(view: EditorView, pos: number): FenceWidgetTarget | null {
  return fenceTargetFromState(view.state, pos);
}

/** State-only variant of `fenceAt` (unit + commit path, no view needed). */
export function fenceTargetFromState(state: EditorState, pos: number): FenceWidgetTarget | null {
  const fence = fenceNodeAt(state, pos);
  return fence ? targetFromFenceNode(fence, state) : null;
}

/**
 * Collect every task-item widget target whose range intersects the viewport.
 * Tree-iterated (same invalidation closure as the projection: visible ranges
 * only). Off-screen task items are never parsed or decorated. The returned
 * list is in document order.
 */
export function collectVisibleTaskTargets(view: EditorView): TaskWidgetTarget[] {
  const state = view.state;
  const tree = syntaxTree(state);
  const visible = view.visibleRanges;
  const out: TaskWidgetTarget[] = [];
  if (tree.length === 0) return out;
  tree.iterate({
    enter(n) {
      if (n.name !== TASK_NODE) return true;
      if (!intersectsVisible(n.from, n.to, visible)) return false;
      const target = targetFromTaskNode(n.node, state);
      if (target) out.push(target);
      return false; // never descend into the task's inline children
    },
  });
  return out;
}

/**
 * Collect every code-fence widget target whose range intersects the viewport
 * AND has an info string (a language to badge). Fences without an info string
 * stay plain source (no controls to mount — exactly what the pilot needs).
 * Document order.
 */
export function collectVisibleFenceTargets(view: EditorView): FenceWidgetTarget[] {
  const state = view.state;
  const tree = syntaxTree(state);
  const visible = view.visibleRanges;
  const out: FenceWidgetTarget[] = [];
  if (tree.length === 0) return out;
  tree.iterate({
    enter(n) {
      if (n.name !== FENCE_NODE) return true;
      if (!intersectsVisible(n.from, n.to, visible)) return false;
      const target = targetFromFenceNode(n.node, state);
      if (target && target.info) out.push(target);
      return false; // never descend into code text
    },
  });
  return out;
}

/** Length of the closing fence marker (trailing ` ``` `/`~~~` span), in UTF-16
 *  code units — used only for the `content` span math. */
export function closingFenceMarkLength(node: SyntaxNodeLike): number {
  const closing = lastChildNamed(node, CODE_MARK_NODE);
  return closing ? closing.to - closing.from : 0;
}

/**
 * Read-only gate shared by the 7.4 harness and the widgets: a widget renders
 * disabled and NEVER commits from a read-only view. `projecting` is carried
 * explicitly; the harness passes true (the plugin only exists in the preview
 * compartment).
 */
export function resolveWidgetViewContext(view: EditorView, projecting: boolean): WidgetViewContext {
  const readOnly = !view.state.facet(EditorView.editable);
  return { view, projecting, readOnly };
}