// P6 M2a/M2b — boundary deletion over hidden inline markers (ADR structural
// interaction matrix; design/phases/P6-true-wysiwyg-hidden-markers.md §4 / §9).
//
// A hidden marker is a `Decoration.replace` over source the user cannot see. If
// Backspace/Delete behaved like ordinary source deletion at a marker boundary,
// one keystroke would silently eat a `*` of `**bold**` (or a `[`/`]`/`(`/`)` of
// a link) and leave an unbalanced pair in the saved bytes — an invisible edit
// that corrupts the document. The ADR therefore defines the boundary contract:
//
//   | Backspace at the AFTER boundary of the closing marker | reveal the owning
//     construct, delete one grapheme from the END of the content range; the
//     paired markers stay intact. Empty content → NoOp.
//   | Delete at the BEFORE boundary of the opening marker | reveal the owning
//     construct, delete one grapheme from the START of the content range; the
//     paired markers stay intact. Empty content → NoOp.
//   | Backspace just after the opening marker, or Delete just before the closing
//     marker (the INNER boundaries) | reveal and NoOp — a delimiter is never
//     removed on its own.
//
// M2b extends this to LINK constructs (design §9.5): a link is a non-symmetric
// multi-segment marker, so the boundary rule targets its DISPLAY TEXT (between
// the first opening and first-closing LinkMark) while keeping the `[`…`](`…`)` /
// `<…>` / `[ref]` skeleton intact. The definition line (`[ref]: dest`) only NoOps
// at its delimiter-adjacent edges.
//
// This module is the ONLY place that implements it. It stays faithful to the P6
// single-source-of-truth rule: it never rewrites markers into the doc, never
// touches CSS, and never reads DOM text — every decision is made from the
// projection's `ConstructRange` geometry (source offsets), and the resulting
// change is one ordinary CodeMirror transaction over the source range.
//
// Rollback: the handler declines outright unless the owning construct's
// `livePreview.<c>.hidden` switch is ON (default OFF). With the flag OFF the
// keymap is inert and Backspace/Delete stay byte-for-byte the pre-P6 behaviour.

import { EditorState, Prec, type Extension } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { EditorView, keymap, type KeyBinding } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { getProjectionSnapshot, pairedInlineGeometry, type ConstructRange } from './projection';
import { clsToLivePreviewConstruct, isLivePreviewHiddenOn } from './livePreviewFlags';

/** The resolved boundary hit for a keystroke (source offsets, never DOM). */
type BoundaryHit =
  /** Delete one grapheme from the end of the content range (Backspace outside the closing marker). */
  | { kind: 'delete-content-end'; contentFrom: number; contentTo: number }
  /** Delete one grapheme from the start of the content range (Delete outside the opening marker). */
  | { kind: 'delete-content-start'; contentFrom: number; contentTo: number }
  /** Inside the pair at a delimiter — reveal only, never delete the delimiter. */
  | { kind: 'noop' };

/** Backspace steps backwards over one grapheme; Delete steps forwards. */
function stepGrapheme(text: string, offset: number, backwards: boolean): number {
  if (!backwards) {
    if (offset >= text.length) return offset;
    // Keep a surrogate pair together: never land between a high and low half.
    const hi = text.charCodeAt(offset);
    if (hi >= 0xd800 && hi <= 0xdbff && offset + 1 < text.length) {
      const lo = text.charCodeAt(offset + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) return offset + 2;
    }
    return offset + 1;
  }
  if (offset <= 0) return 0;
  const lo = text.charCodeAt(offset - 1);
  if (lo >= 0xdc00 && lo <= 0xdfff && offset - 2 >= 0) {
    const hi = text.charCodeAt(offset - 2);
    if (hi >= 0xd800 && hi <= 0xdbff) return offset - 2;
  }
  return offset - 1;
}

/**
 * True when this construct's markers are hidden-capable RIGHT NOW. The check is
 * on the switch, not on the last-resolved visibility: a construct adjacent to the
 * caret is `revealed`, yet it is the hidden marker that makes the boundary rule
 * necessary — the keystroke is what must not eat the delimiter.
 */
function hiddenCapable(range: ConstructRange): boolean {
  const kind = clsToLivePreviewConstruct(range.cls);
  return kind !== null && isLivePreviewHiddenOn(kind);
}

/**
 * Resolve the ADR boundary hit for an M2b LINK construct (design §9.5). A link is
 * non-symmetric multi-segment, and its display text runs between the first
 * opening and first-closing LinkMark — so a Backspace right after the closing
 * delimiter deletes one grapheme from that TEXT only, never touching the
 * `[`…`](`…`)` / `<…>` / `[ref]` skeleton. The definition line (`[ref]: dest`)
 * has no paired text around a single delimiter, so it only NoOps at the
 * delimiter-adjacent edges to keep the `[ref]:` label from being eaten.
 */
function linkBoundaryHit(range: ConstructRange, pos: number, backwards: boolean): BoundaryHit | null {
  const m = range.markers;
  if (m.length === 0) return null; // naked URL / non-form link — ordinary source
  if (m.length === 1) {
    // Definition line `[ref]: dest` — protect the label, let the (source-visible)
    // destination be edited by ordinary caret editing at the definition line.
    if (backwards && pos === m[0][1]) return { kind: 'noop' }; // after `:` — don't eat it
    if (!backwards && pos === range.from) return { kind: 'noop' }; // before `[` — don't eat it
    return null;
  }
  // Multi-delimiter forms (inline / reference / autolink): the display text lives
  // between the first opening and first-closing LinkMark.
  const textFrom = m[0][1];
  const textTo = m[1][0];
  if (textTo < textFrom) return null; // malformed — fall through to source delete
  if (backwards && pos === range.to) {
    return { kind: 'delete-content-end', contentFrom: textFrom, contentTo: textTo };
  }
  if (!backwards && pos === range.from) {
    return { kind: 'delete-content-start', contentFrom: textFrom, contentTo: textTo };
  }
  // Inner boundaries — reveal only, never delete a delimiter.
  if (backwards && pos === textFrom) return { kind: 'noop' }; // after `[`/`<`
  if (!backwards && pos === textTo) return { kind: 'noop' }; // before `]`/`>`
  return null;
}

/**
 * M3 block (quote / list / fence) boundary hit (ADR §6 cross-cutting block rule).
 *
 * The block markers are the OPENING syntax at each block line (`>` of a quote,
 * `-`/`1.`/`- [ ]` of a list item) plus a fence's opening/closing ```. When the
 * caret sits exactly at a block-marker inner boundary, an ordinary source
 * Backspace/Delete would silently eat one of those invisible syntax characters
 * and break the block skeleton — so the ADR protects it:
 *
 *   - Backspace right AFTER the opening marker (caret at content start) → reveal
 *     and NoOp (a delimiter is never removed on its own); the deliberately
 *     structural "remove a marker layer / list level" Backspace stays with
 *     `structuralInteraction`, which runs FIRST and consumes it.
 *   - Delete right BEFORE the opening marker → reveal and NoOp.
 *   - For a fence, Backspace right BEFORE its CLOSING ``` deletes the body's
 *     last grapheme (the closing mark stays whole).
 *
 * The fence's open/close geometry cannot come from `range.markers` (frozen
 * empty) and is resolved here from the Lezer tree so the snapshot shape is
 * untouched. Returns null at ordinary positions → source deletion.
 */
function blockBoundaryHit(
  view: EditorView,
  range: ConstructRange,
  pos: number,
  backwards: boolean,
): BoundaryHit | null {
  const kind = clsToLivePreviewConstruct(range.cls);
  if (kind === 'quote' || kind === 'list') {
    const m = range.markers;
    if (m.length === 0) return null;
    const afterMarker = m[0][1]; // content starts right after the first marker
    if (backwards && pos === afterMarker) return { kind: 'noop' }; // don't eat `>`/`-`
    if (!backwards && pos === range.from) return { kind: 'noop' }; // don't eat `>`/`-`
    return null;
  }
  if (kind === 'fence') {
    const marks = fenceMarksAt(view, range);
    if (!marks) return null;
    // Inner boundaries around EITHER ``` — never delete a single backtick
    // (ADR §6 cross-cutting: Backspace after opening / before closing → reveal
    // and NoOp). Block markers are opening-style, so the skeleton is preserved.
    if (backwards && pos === marks.openTo) return { kind: 'noop' }; // after opening ```
    if (!backwards && pos === range.from) return { kind: 'noop' }; // before opening ```
    if (backwards && pos === marks.closeFrom) return { kind: 'noop' }; // before closing ```
    return null;
  }
  return null;
}

/** Resolve a fence construct's open/close marks + body bounds from the Lezer tree. */
interface FenceMarks {
  openTo: number;
  closeFrom: number;
  bodyFrom: number;
}
function fenceMarksAt(view: EditorView, range: ConstructRange): FenceMarks | null {
  const tree = syntaxTree(view.state);
  // Resolve at range.from + 1, NOT range.from: a `side:0` resolution AT the exact
  // fence start returns the Document root (the position sits on a node boundary),
  // so walking `parent` never reaches FencedCode. One char in is guaranteed to be
  // inside the opening ``` (a real fence's open mark is ≥3 backticks).
  const node = tree.resolveInner(Math.min(range.from + 1, view.state.doc.length), 0);
  let cur: SyntaxNode | null = node;
  while (cur && cur.name !== 'FencedCode') cur = cur.parent;
  if (!cur) return null;
  let openTo = -1;
  let closeFrom = -1;
  let bodyFrom = -1;
  let child: SyntaxNode | null = cur.firstChild;
  for (; child; child = child.nextSibling) {
    if (child.name === 'CodeMark' && openTo < 0) {
      openTo = child.to;
    } else if (child.name === 'CodeMark') {
      closeFrom = child.from;
    } else if (child.name === 'CodeText') {
      bodyFrom = child.from;
    }
  }
  if (openTo < 0 || closeFrom < 0) return null; // unclosed / no open mark — malformed
  return { openTo, closeFrom, bodyFrom: bodyFrom < 0 ? openTo : bodyFrom };
}

/**
 * Find the paired inline construct whose marker boundary the caret sits at.
 * Returns `null` when the caret is at an ordinary source position, so Backspace/
 * Delete fall through to the default (exact-source) behaviour.
 */
function boundaryHitAt(view: EditorView, pos: number, backwards: boolean): BoundaryHit | null {
  const snapshot = getProjectionSnapshot();
  // Only trust snapshot geometry when the projection actually rendered it. In
  // Source mode the plugin is absent (`source`), and a huge doc degrades to
  // source fallback — in both cases no marker is hidden on screen, so the
  // boundary rule must not fire.
  if (snapshot.state !== 'rendered') return null;
  // Staleness guard: the snapshot is a module singleton, so refuse to act on
  // geometry that cannot belong to this document. A mismatch means the snapshot
  // predates the current doc — fall through to ordinary source deletion rather
  // than deleting at offsets computed for a different document.
  const docLength = view.state.doc.length;
  if (!snapshot.constructs.every((c) => c.from >= 0 && c.to <= docLength)) return null;
  // Innermost first: with `**`code`**` the inner construct owns its own boundary.
  const candidates = snapshot.constructs.filter(hiddenCapable).sort((a, b) => b.from - a.from);
  for (const range of candidates) {
    // M2b link: non-symmetric multi-segment marker with its own boundary
    // resolution (a naked URL child has markers=[] → linkBoundaryHit returns
    // null and we keep scanning for a deeper/more relevant candidate).
    const kind = clsToLivePreviewConstruct(range.cls);
    // M2b link: non-symmetric multi-segment marker with its own boundary
    // resolution (a naked URL child has markers=[] → linkBoundaryHit returns
    // null and we keep scanning for a deeper/more relevant candidate).
    if (kind === 'link') {
      const linkHit = linkBoundaryHit(range, pos, backwards);
      if (linkHit) return linkHit;
      continue;
    }
    // M3 block (quote / list / fence): block-marker boundary resolution.
    if (kind === 'quote' || kind === 'list' || kind === 'fence') {
      const blockHit = blockBoundaryHit(view, range, pos, backwards);
      if (blockHit) return blockHit;
      continue;
    }
    const geo = pairedInlineGeometry(range);
    if (!geo) continue;
    if (backwards) {
      // After the closing marker → delete the content's last grapheme.
      if (pos === geo.closeTo) {
        return { kind: 'delete-content-end', contentFrom: geo.contentFrom, contentTo: geo.contentTo };
      }
      // Just after the opening marker (the inner boundary) → reveal, no delete.
      if (pos === geo.contentFrom) return { kind: 'noop' };
    } else {
      // Before the opening marker → delete the content's first grapheme.
      if (pos === geo.openFrom) {
        return { kind: 'delete-content-start', contentFrom: geo.contentFrom, contentTo: geo.contentTo };
      }
      // Just before the closing marker (the inner boundary) → reveal, no delete.
      if (pos === geo.contentTo) return { kind: 'noop' };
    }
  }
  return null;
}

function handleDelete(view: EditorView, backwards: boolean): boolean {
  // Read-only, composing, and range selections keep ordinary source behaviour:
  // an IME session owns its own composition, and a non-empty selection is an
  // explicit user sweep that the ADR treats as a plain source delete.
  if (view.state.facet(EditorState.readOnly)) return false;
  if (view.composing) return false;
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const hit = boundaryHitAt(view, sel.head, backwards);
  if (!hit) return false;
  // `noop` returns true (handled): the keystroke is consumed so the delimiter
  // survives, and the construct is already revealed by the adjacent caret.
  if (hit.kind === 'noop') return true;
  const text = view.state.doc.sliceString(hit.contentFrom, hit.contentTo);
  if (text === '') return true; // empty content → reveal only, per ADR
  if (backwards) {
    const from = stepGrapheme(text, text.length, true);
    if (from === text.length) return true; // nothing left to step over
    const absFrom = hit.contentFrom + from;
    view.dispatch({
      changes: { from: absFrom, to: hit.contentTo, insert: '' },
      selection: { anchor: absFrom },
      userEvent: 'delete.structure',
      annotations: isolateHistory.of('full'),
    });
    return true;
  }
  const to = stepGrapheme(text, 0, false);
  if (to === 0) return true;
  view.dispatch({
    changes: { from: hit.contentFrom, to: hit.contentFrom + to, insert: '' },
    selection: { anchor: hit.contentFrom },
    userEvent: 'delete.structure',
    annotations: isolateHistory.of('full'),
  });
  return true;
}

/**
 * P6 M2a command layer: Backspace/Delete over a hidden inline marker boundary.
 * Installed at `Prec.highest` alongside the P4B structural keymap so it is seen
 * before generic source deletion. It declines (returns false) for every position
 * that is not a hidden-marker boundary, so the ordinary source path is unchanged.
 */
export const hiddenMarkerInteractionKeymap: Extension = Prec.highest(
  keymap.of([
    { key: 'Backspace', run: (view) => handleDelete(view, true) },
    { key: 'Delete', run: (view) => handleDelete(view, false) },
  ] satisfies readonly KeyBinding[]),
);
