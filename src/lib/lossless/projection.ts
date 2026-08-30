// Lossless Live Preview — local Markdown/Lezer projection decorations.
//
// P2 (design 03 §2, tasks 4.3-4.7): a single EditorView renders the source
// text; when the projection compartment is active, semantic decorations are
// layered ON TOP of the unchanged `EditorState.doc` (never a doc rewrite, never
// a serializer round-trip). Only visible ranges are decorated (viewport +
// overscan), and an active selection / composition reveals the marker of an
// intersecting construct (marker stays weak otherwise — never hidden in P2).
//
// P4B task 7.1: the reveal decision is refined PER MARKER COHORT behind five
// independent default-OFF flags (cohortFlags.ts). When a flag is OFF the reveal
// is byte-for-byte the P2 radius logic; when ON it switches to a precise
// content-containment reveal (see `isConstructRevealed`). The construct/marker
// set itself is unchanged and stays frozen by the task 6.5 parity oracle.
//
// This module MUST NOT dispatch doc-changing transactions and MUST NOT touch
// Core IPC. It only builds a `DecorationSet` from the Lezer syntax tree.
//
// P4A task 6.5 (ADR §3.3): the construct classification decision below goes
// through the construct owner registry (renderOwnerRegistry.ts) so every
// construct kind has exactly ONE owner at any render moment — 'local' (this
// projection), 'source-fallback' (exact source), a P4B 'widget', or the
// ADR-reserved 'core' placeholder. No Core-IR request protocol exists (ADR
// terminal state `SPIKE_COMPLETE_NO_CORE_IR`): viewport rebuild, staleness and
// degraded fallback stay inside the CM update cycle (P2 tasks 4.5/4.10/4.13).

import { RangeSet, RangeSetBuilder, type Extension, type Text } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType, type ViewUpdate } from '@codemirror/view';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { getOwnerRegistrySnapshot, resolveConstructOwner, type ConstructKind } from './renderOwnerRegistry';
import {
  isEmphasisStrikeInlineCodeEnabled,
  isFenceEnabled,
  isHeadingStrongEnabled,
  isLinksEnabled,
  isQuoteListsEnabled,
} from './cohortFlags';
import {
  clsToLivePreviewConstruct,
  isLivePreviewHiddenOn,
  isLivePreviewProjectionOn,
} from './livePreviewFlags';

/** Construct classes exposed for semantic assertions (unit + desktop E2E). */
export const PROJECTION_CLASSES = {
  heading: 'mf-h',
  h1: 'mf-h1',
  h2: 'mf-h2',
  h3: 'mf-h3',
  h4: 'mf-h4',
  h5: 'mf-h5',
  h6: 'mf-h6',
  strong: 'mf-strong',
  emphasis: 'mf-emphasis',
  strikethrough: 'mf-strikethrough',
  inlineCode: 'mf-inline-code',
  link: 'mf-link',
  blockquote: 'mf-blockquote',
  listItem: 'mf-list-item',
  fence: 'mf-fence',
  hr: 'mf-hr',
  active: 'mf-active',
} as const;

export type ProjectionState =
  | 'source' // projection compartment off — plain Source
  | 'projecting' // building decorations
  | 'rendered' // decorations rendered for the visible ranges
  | 'stale' // doc changed, rebuild pending
  | 'composing' // composition active (rebuild followed the composing flag)
  | 'degraded' // fell back to source (huge doc / exception)
  | 'disposed'; // projection destroyed (mode switched back to Source / binding closed)

/**
 * A semantic construct to decorate: its content range plus its discrete marker
 * spans (the syntax characters, e.g. the two `**` of `**bold**`). Exposed for
 * semantic assertions (the content AND the markers coexist) without leaking
 * body text into the debug snapshot.
 */
export interface ConstructRange {
  from: number;
  to: number;
  /**
   * Discrete marker (syntax) spans inside the construct, each `[from, to)`.
   * Each delimiter range is weakened separately — NEVER the content between
   * two delimiters (design 03 §2: only the marker characters are weakened).
   */
  markers: Array<[number, number]>;
  /** Semantic class (`mf-h1`…, `mf-strong`, …). */
  cls: string;
  /** Heading level (1-6) when this construct is a heading; undefined otherwise. */
  level?: number;
  /** Resolved visual state for the most recent build (P6 hidden-marker owner). */
  visibility?: ConstructVisibility;
}

/**
 * Frozen cross-phase vocabulary. P6 may later produce `hidden` via replacing
 * decorations and atomic ranges; P4B must never do so.
 */
export type ConstructVisibility = 'visible' | 'dimmed' | 'hidden' | 'revealed';

/** The only visibility states P4B is permitted to return. */
export type P4bConstructVisibility = Exclude<ConstructVisibility, 'hidden'>;

/** Inputs shared by the P4B resolver and P6's future hidden-marker engine. */
export interface ConstructVisibilityOptions {
  /** Composition freezes the safe projection by forcing a reveal in P4B. */
  composing?: boolean;
  /** Reserved P6 request. P4B fail-closes to visible/dimmed rather than hiding. */
  hiddenRequested?: boolean;
}

export interface ProjectionSnapshot {
  state: ProjectionState;
  constructs: ConstructRange[];
  count: number;
  /** UTF-16 source ranges that are currently hidden as atomic marker units (P6). */
  hiddenAtomic: Array<[number, number]>;
}

// ── Construct classification (owner-registry wired, task 6.5 / ADR §3.3) ──

/**
 * Map a Lezer node name to its semantic construct kind — the registry key
 * space of renderOwnerRegistry.ts. Fallback-only Lezer nodes (HTML blocks,
 * tables, images…) are mapped explicitly for P4B cohort-level registry
 * granularity; their DEFAULT owner is 'source-fallback', so this mapping by
 * itself changes no behavior versus the pre-registry classifier. Names without
 * a dedicated mapping — including structural nodes Lezer does not produce
 * today (FrontMatter, FootnoteDefinition, ADR §3.1) — resolve to 'unknown'.
 */
function lezerNodeKind(name: string): ConstructKind {
  if (name.startsWith('ATXHeading') || name.startsWith('SetextHeading')) return 'heading';
  switch (name) {
    // GFM/CommonMark lezer: bold is `StrongEmphasis`, italic is `Emphasis`.
    case 'StrongEmphasis':
      return 'strong';
    case 'Emphasis':
      return 'emphasis';
    case 'Strikethrough':
      return 'strikethrough';
    case 'InlineCode':
      return 'inlineCode';
    case 'Link':
    case 'URL':
      return 'link';
    case 'Blockquote':
      return 'blockquote';
    case 'ListItem':
      return 'listItem';
    // GFM's `Task` is nested within its ListItem. It has a distinct registry
    // identity so the checkbox widget can claim ONLY TaskMarker while the
    // ListItem local owner keeps rendering the list container and list marker.
    case 'Task':
      return 'taskCheckbox';
    case 'FencedCode':
      return 'fence';
    // Thematic break (`---` / `***` / `___`): exact-source fallback by default;
    // P6 M1 promotes it to a local projected construct ONLY when
    // `livePreview.thematicBreak` is ON (gated below in classifyLezerNode, so
    // this mapping never changes behavior while the flag is OFF).
    case 'HorizontalRule':
      return 'thematicBreak';
    // Exact-source fallback kinds today (the pre-registry classifier returned
    // null for them): HTML-ish leaf blocks, GFM tables, images. `FrontMatter`
    // and `FootnoteDefinition` are never produced by the current Lezer config
    // (ADR §3.1 known gaps) — mapped for P4B frontmatter/footnote cohorts.
    case 'HTMLBlock':
    case 'Comment':
    case 'ProcessingInstruction':
      return 'htmlBlock';
    case 'Table':
    case 'TableHeader':
    case 'TableRow':
    case 'TableCell':
    case 'TableDelimiter':
      return 'table';
    case 'Image':
      return 'image';
    case 'FrontMatter':
      return 'frontmatter';
    case 'FootnoteDefinition':
      return 'footnoteDefinition';
    default:
      return 'unknown';
  }
}

/** Built-in decoration class per local kind (headings are handled by name). */
const LOCAL_KIND_CLS: Readonly<Partial<Record<ConstructKind, string>>> = Object.freeze({
  strong: PROJECTION_CLASSES.strong,
  emphasis: PROJECTION_CLASSES.emphasis,
  strikethrough: PROJECTION_CLASSES.strikethrough,
  inlineCode: PROJECTION_CLASSES.inlineCode,
  link: PROJECTION_CLASSES.link,
  blockquote: PROJECTION_CLASSES.blockquote,
  listItem: PROJECTION_CLASSES.listItem,
  fence: PROJECTION_CLASSES.fence,
});

/**
 * Classify a Lezer node for decoration: resolve the construct kind's OWNER via
 * the registry and only build decorations when this projection owns it. The
 * default registry replicates the pre-registry classifier 1:1 (parity oracle
 * test + frozen ConstructRange golden in projection.test.ts): the nine local
 * kinds decorate, everything else stays exact source. The `cls`/`level`
 * METADATA remains owned by this module — the registry decides WHO renders,
 * never what the decorations look like.
 *
 * Exported as the behavior-parity oracle for renderOwnerRegistry.test.ts (the
 * pre-registry `classifyNode` is frozen verbatim there) and for P4B cohort
 * assertions on what the local projection will/will not render.
 */
export function classifyLezerNode(name: string): { cls: string; level?: number } | null {
  const kind = lezerNodeKind(name);
  // P6 M1: a thematic break is promoted to a local projected construct (rendered
  // as a rule) ONLY when its projection flag is ON. While OFF it stays exact
  // source (default 'source-fallback' owner) — parity with the pre-P6 baseline.
  if (kind === 'thematicBreak' && isLivePreviewProjectionOn('thematicBreak')) {
    return { cls: PROJECTION_CLASSES.hr };
  }
  // Unique-owner invariant (task 6.5): only the 'local' owner decorates here;
  // 'source-fallback' (and a future 'widget'/'core' owner) keeps raw source.
  if (resolveConstructOwner(kind).owner !== 'local') return null;
  if (kind === 'heading') {
    if (name.startsWith('ATXHeading')) {
      const level = Number(name.slice('ATXHeading'.length)) || 1;
      return { cls: PROJECTION_CLASSES.heading, level };
    }
    return { cls: PROJECTION_CLASSES.heading, level: name.endsWith('2') ? 2 : 1 };
  }
  const cls = LOCAL_KIND_CLS[kind];
  // Unreachable with the static default registry (fallback kinds return above);
  // defensive so an owner inconsistency can never fabricate a decoration.
  return cls ? { cls } : null;
}

/** Decoration for a construct (level-aware for headings). */
function decorationFor(cls: string, level?: number): Decoration {
  const levelCls = level != null && level >= 1 && level <= 6 ? ` ${PROJECTION_CLASSES[`h${level}` as 'h1']}` : '';
  return Decoration.mark({ class: `mf-construct ${cls}${levelCls}` });
}

// ── P6 hidden-marker engine (ADR §2; sole owner of `hidden`) ────────────────
//
// When a P6-capable construct is inactive and its `livePreview.<c>.hidden`
// switch is ON, its marker is replaced (zero-width visible glyph) and the
// source range is published as an atomic unit via `EditorView.atomicRanges`
// (see `hiddenAtomicRanges` + `projectionExtension`). The source `EditorState.doc`
// is NEVER rewritten; save/clipboard/History read the unchanged source text.

/** Current atomic hidden-marker ranges (queried by `EditorView.atomicRanges`). */
let hiddenAtomicRanges: RangeSet<Decoration> = RangeSet.empty;

/**
 * Read-only thematic-break placeholder (ADR §2 allows a read-only glyph for an
 * empty/structural construct). It is NOT the save body — export and save read
 * the source `---` / `***` / `___` from `EditorState.doc`, never this widget.
 */
class ThematicBreakWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = PROJECTION_CLASSES.hr;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  eq(): boolean {
    return true;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Build the hidden (replacing + atomic) decorations for ONE P6 construct and
 * push them into `additions`. Returns `'hidden'` when the construct was hidden
 * (caller skips the normal path); otherwise it returns the safe fallback state
 * the caller must apply instead — `'visible'` for an empty heading that must
 * stay discoverable, `'dimmed'` for a construct whose markers cannot be hidden
 * (e.g. a setext heading's underline), so it keeps the weak-marker projection.
 */
function buildHiddenConstruct(
  range: ConstructRange,
  doc: Text,
  additions: Array<{ from: number; to: number; deco: Decoration }>,
  hiddenAtomicSpans: Array<[number, number]>,
): ConstructVisibility {
  // Thematic break: replace the whole `---`/`***`/`___` with a read-only rule.
  if (range.cls === PROJECTION_CLASSES.hr) {
    hiddenAtomicSpans.push([range.from, range.to]);
    additions.push({
      from: range.from,
      to: range.to,
      deco: Decoration.replace({ widget: new ThematicBreakWidget(), atomic: true }),
    });
    return 'hidden';
  }
  // Heading: hide the `#`(+ space) marker and mark the content. An EMPTY heading
  // (marker with no text) stays visible so it remains discoverable/editable.
  if (range.cls === PROJECTION_CLASSES.heading) {
    if (range.markers.length === 0) return 'visible'; // malformed header, no marker
    const markerFrom = range.markers[0][0];
    const markerTo = range.markers[0][1];
    // Setext headings (`Title\n===`) carry the underline as their HeaderMark,
    // not a leading `#`. The M1 hidden path is ATX-only; a setext heading must
    // fall back to the dimmed/visible path (ADR §7 source fallback) — treating
    // the underline as hideable would slice past the marker line and throw.
    if (!doc.sliceString(markerFrom, markerTo).startsWith('#')) return 'dimmed';
    const spaceLen = doc.sliceString(markerTo, markerTo + 1) === ' ' ? 1 : 0;
    const hideFrom = markerFrom;
    const hideTo = markerTo + spaceLen;
    const lineEnd = doc.lineAt(range.from).to;
    if (doc.sliceString(hideTo, lineEnd).trim() === '') return 'visible'; // empty → visible
    hiddenAtomicSpans.push([hideFrom, hideTo]);
    // Replace the marker (hidden, no widget → geometry stays cursor-atomic via facet).
    additions.push({ from: hideFrom, to: hideTo, deco: Decoration.replace({}) });
    // Mark the heading content (after the marker) with the semantic class.
    const levelCls = range.level != null ? ` ${PROJECTION_CLASSES[`h${range.level}` as 'h1']}` : '';
    additions.push({
      from: hideTo,
      to: range.to,
      deco: Decoration.mark({ class: `mf-construct ${range.cls}${levelCls}` }),
    });
    return 'hidden';
  }
  return 'dimmed';
}

// ── P4B task 7.1: per-cohort marker reveal refinement ────────────────────
//
// The base reveal (design 03 §2 / P2) weakens a construct's delimiter markers
// (`.mf-marker`) and promotes the WHOLE construct to `mf-active` when the
// selection intersects it within a fixed `radius = 2`. Task 7.1 divides this
// single behaviour into five independent, default-OFF marker cohorts
// (headingStrong, emphasisStrikeInlineCode, links, quoteLists, fence — gated by
// cohortFlags.ts). When a cohort flag is OFF (the default and the parity
// baseline) `isConstructRevealed` must be BYTE-IDENTICAL to the pre-7.1 radius
// logic. When a cohort flag is ON, that cohort's constructs switch to a precise
// reveal rule:
//
//   - a NON-EMPTY selection (mouse-drag range, Shift+Arrow, Home/End sweep,
//     Select All) ALWAYS fully reveals every construct it overlaps — identical
//     to base (Select All never leaves a marker ghosted);
//   - a COLLAPSED caret reveals ONLY when it sits strictly inside the construct
//     content range `(from, to)` (which covers the delimiter markers, since they
//     live inside content). This removes the base radius-2 "fringe": a caret up
//     to two code units OUTSIDE a construct (e.g. on the neighbouring blank line
//     after a heading, or just before its `#`) no longer lights up the marker.
//
// Reveal is a PURE function of (construct, selection, doc length, flag state) —
// never of DOM textContent — so it holds identically in read-only mode (only
// the selection drives it). CJK/emoji positions are UTF-16 safe: Lezer never
// splits a surrogate pair, so content containment is stable across emoji.

/** True when this construct's cohort flag is ON (task 7.1 per-cohort gate). */
function cohortRevealActive(cls: string, markers: Array<[number, number]>): boolean {
  switch (cls) {
    case PROJECTION_CLASSES.heading:
    case PROJECTION_CLASSES.strong:
      return isHeadingStrongEnabled();
    case PROJECTION_CLASSES.emphasis:
    case PROJECTION_CLASSES.strikethrough:
    case PROJECTION_CLASSES.inlineCode:
      return isEmphasisStrikeInlineCodeEnabled();
    case PROJECTION_CLASSES.link:
      // Task 7.1 ③: the refined reveal applies ONLY to the real `[text](url)`
      // Link delimiter construct — the one that owns the four `[ ] ( )` marker
      // spans. Naked URL / image-URL / legacy link-label `mf-link` shapes (0 or
      // non-4 markers, e.g. the GOLDEN from:156 / from:302 legacy entries) keep
      // the base radius reveal — their construct/markers are frozen, untouched.
      return markers.length === 4 && isLinksEnabled();
    case PROJECTION_CLASSES.blockquote:
    case PROJECTION_CLASSES.listItem:
      return isQuoteListsEnabled();
    case PROJECTION_CLASSES.fence:
      return isFenceEnabled();
    default:
      return false;
  }
}

/**
 * Decide whether `range` gets the full `mf-active` reveal for the current main
 * selection. P4B task 7.1: per-cohort refinement while a cohort flag is ON;
 * otherwise byte-identical to the pre-7.1 radius-2 logic (the parity baseline —
 * task 6.5 parity keeps the construct set frozen, and this keeps the reveal
 * frozen for all flags-OFF runs). Exported for direct unit testing of the
 * per-cohort interaction matrix (7.2) without driving the editor/DOM.
 */
export function isConstructRevealed(
  range: ConstructRange,
  selection: { from: number; to: number; empty: boolean },
  docLength: number,
): boolean {
  // Range selection / Select All: every overlapping construct fully reveals —
  // identical for every cohort, ON or OFF (a sweep must never ghost a marker).
  if (!selection.empty) {
    return range.from <= selection.to && range.to >= selection.from;
  }
  // Collapsed caret: per-cohort precise reveal when the cohort is ON.
  if (cohortRevealActive(range.cls, range.markers)) {
    const caret = selection.from;
    return range.from < caret && caret < range.to;
  }
  // Base radius-2 reveal — cohort OFF (default). Exactly the pre-7.1 logic.
  const radius = 2;
  const revealFrom = Math.max(0, selection.from - radius);
  const revealTo = Math.min(docLength, selection.to + radius);
  return range.from <= revealTo && range.to >= revealFrom;
}

/**
 * Resolve one construct's visual state without changing its source bytes.
 *
 * P6 is the SOLE owner of `hidden`: a construct is hidden only when its
 * `livePreview.<construct>.hidden` switch is ON (gated by `hiddenRequested`,
 * which the projection sets for P6-capable kinds), the caret/selection does
 * not intersect it, and no IME composition is active. P4B callers that pass
 * `hiddenRequested: true` for a NON-P6 kind (e.g. `strong`) safely degrade to
 * `dimmed` — they never own replacing/atomic hidden decorations. During IME
 * composition we take the conservative safe path and reveal rather than
 * moving any marker geometry.
 */
export function resolveConstructVisibility(
  range: ConstructRange,
  selection: { from: number; to: number; empty: boolean },
  docLength: number,
  options: ConstructVisibilityOptions = {},
): ConstructVisibility {
  if (isConstructRevealed(range, selection, docLength)) return 'revealed';
  // Composition reveals only the construct intersecting or immediately
  // adjacent to the active source caret. Revealing every visible construct
  // would make the whole viewport flash when a single IME session starts.
  if (options.composing && selection.empty) {
    const caret = selection.from;
    if (caret >= Math.max(0, range.from - 1) && caret <= Math.min(docLength, range.to + 1)) {
      return 'revealed';
    }
  }
  // P6 hidden-marker owner (ADR §2): the ONLY place replacing/atomic hidden
  // decorations are sanctioned. `hiddenRequested` is set by the projection for
  // P6-capable kinds; `isLivePreviewHiddenOn` enforces the per-construct
  // `.hidden` switch, so a flag-OFF (default) or non-P6 kind degrades safely.
  const kind = clsToLivePreviewConstruct(range.cls);
  if (options.hiddenRequested && kind && isLivePreviewHiddenOn(kind)) {
    return 'hidden';
  }
  if (options.hiddenRequested) return range.markers.length === 0 ? 'visible' : 'dimmed';
  if (range.markers.length === 0) return 'visible';
  return 'dimmed';
}

// ── ViewPlugin: build + hold the DecorationSet ────────────────────────

let lastSnapshot: ProjectionSnapshot = { state: 'source', constructs: [], count: 0, hiddenAtomic: [] };

export function getProjectionSnapshot(): ProjectionSnapshot {
  return lastSnapshot;
}

export function resetProjectionSnapshot(): void {
  lastSnapshot = { state: 'source', constructs: [], count: 0, hiddenAtomic: [] };
  hiddenAtomicRanges = RangeSet.empty;
}

/** Reflect a binding teardown in the debug state (task 4.9 `disposed`). */
export function setProjectionDisposed(): void {
  lastSnapshot = { state: 'disposed', constructs: [], count: 0, hiddenAtomic: [] };
  hiddenAtomicRanges = RangeSet.empty;
}

// ── Test-only failure injection (P2 §4.9 覆盖) ────────────────────────
//
// Proves the projection fallback contract (design P2 §4.9, task 4.13): when
// buildDecorations ACTUALLY THROWS, the plugin's try/catch degrades to an empty
// decoration set and the Source document still displays, edits, and saves. The
// injection is reachable only in E2E/test builds (`import.meta.env.MODE` is
// `'e2e'` in the desktop E2E build, `'test'` under vitest); production builds
// replace MODE with `'production'` and the whole branch is dead code.

type ProjectionTestFailMode = 'none' | 'next' | 'always';
let testFailMode: ProjectionTestFailMode = 'none';

/** True only in test/E2E builds; `MODE === 'production'` disables the injection. */
function projectionInjectionEnabled(): boolean {
  const mode = import.meta.env.MODE;
  return mode !== 'production';
}

/**
 * Test-only: force `buildDecorations` to throw. `'next'` throws on the next
 * invocation only (then clears); `'always'` throws on every invocation while
 * set. `'none'` (default) disables injection. No-op in production builds.
 */
export function setProjectionTestFailMode(mode: ProjectionTestFailMode): void {
  if (!projectionInjectionEnabled()) return;
  testFailMode = mode;
}

/** Test-only: whether the next decoration build is forced to throw. */
export function isProjectionTestFailMode(): ProjectionTestFailMode {
  return testFailMode;
}

function maybeInjectProjectionFailure(): void {
  if (!projectionInjectionEnabled()) return;
  if (testFailMode === 'next') {
    testFailMode = 'none';
    throw new Error('projection-test-injected-failure');
  }
  if (testFailMode === 'always') {
    throw new Error('projection-test-injected-failure');
  }
}

// E2E-only hooks: the desktop E2E (WebDriver) forces real projection failures
// on the real app. Present only in `e2e` builds, never in prod.
if (import.meta.env.MODE === 'e2e') {
  const projectionHooks = {
    /** Inject a throw on the NEXT projection build (then self-clears). */
    failNext: () => {
      setProjectionTestFailMode('next');
      return 'armed';
    },
    /** Inject a throw on EVERY projection build while the flag is set. */
    failAlways: () => {
      setProjectionTestFailMode('always');
      return 'armed';
    },
    /** Clear any armed failure injection. */
    clearFail: () => {
      setProjectionTestFailMode('none');
      return 'cleared';
    },
    /** Task 6.5: read-only construct owner registry snapshot (debug/E2E
     *  assertions; design/05 §9 — kind→owner map and counters only). */
    ownerRegistry: () => getOwnerRegistrySnapshot(),
  };
  (window as unknown as { __markflowProjection?: typeof projectionHooks }).__markflowProjection = projectionHooks;
}

function buildDecorations(view: EditorView): DecorationSet {
  maybeInjectProjectionFailure();
  const { state } = view;
  const tree = syntaxTree(state);
  const doc = state.doc;

  // P2 design 03 §4 — invalidation closure: only the target closure is
  // invalidated. This implementation rebuilds ONLY the visible ranges
  // (viewport + overscan); off-screen blocks are never re-parsed or
  // re-decorated, so a keystroke does not pay for the whole document. For
  // Normal/Large docs this is effectively a per-viewport closure. Huge docs
  // degrade to `degraded`: only visible ranges get decorations, the rest is
  // source fallback (never blank, never a full-doc parse).
  const totalLines = doc.lines;
  const HUGE_LINE_THRESHOLD = 50_000;
  const degraded = totalLines > HUGE_LINE_THRESHOLD;

  // Ensure the visible part is parsed (bounded; falls back to parsed portion).
  const lastVisible = view.visibleRanges[view.visibleRanges.length - 1];
  if (lastVisible) ensureSyntaxTree(state, lastVisible.to, 200);

  const constructs: ConstructRange[] = [];
  const seen = new Set<number>();
  const visible = view.visibleRanges;
  // Marker spans to weak-reveal (from Mark/* nodes); stored as [from, to).
  const markerSpans: Array<[number, number]> = [];
  let count = 0;

  tree.iterate({
    enter(node) {
      const nodeFrom = node.from;
      const nodeTo = node.to;
      if (nodeTo - nodeFrom === 0) return true;
      // Skip anything fully outside the visible ranges.
      if (!visible.some((r) => nodeFrom < r.to && nodeTo > r.from)) return false;

      // Collect exact marker spans from the Lezer delimiter nodes.
      if (node.name.endsWith('Mark')) {
        // When the task-checkbox widget owns its explicit TaskMarker slot,
        // this projection must not add a second mark decoration on the same
        // range. The enclosing ListItem remains a local construct and still
        // receives its own list-marker decoration below.
        if (node.name === 'TaskMarker' && resolveConstructOwner('taskCheckbox').owner === 'widget') {
          return true;
        }
        markerSpans.push([nodeFrom, nodeTo]);
        return true;
      }

      const cls = classifyLezerNode(node.name);
      if (cls) {
        if (seen.has(nodeFrom)) return true;
        seen.add(nodeFrom);
        constructs.push({
          from: nodeFrom,
          to: nodeTo,
          // The marker spans are refined below once we know which delimiter
          // nodes fall inside this construct.
          markers: [],
          cls: cls.cls,
          level: cls.level,
        });
        count++;
      }
      // Do not descend into fenced code / HTML / raw text blocks — their inner
      // content is not Markdown (avoids double decorations).
      if (node.name === 'FencedCode' || node.name === 'HTMLBlock' || node.name === 'CodeBlock') {
        return false;
      }
      return true;
    },
  });

  // Assign the precise discrete marker spans to each construct using the
  // delimiter nodes that fall inside its range — each delimiter range is kept
  // SEPARATE so only the syntax characters get weak-revealed, never the content
  // between two delimiters (design 03 §2).
  for (const range of constructs) {
    range.markers = markerSpans
      .filter(([mf, mt]) => mf >= range.from && mt <= range.to)
      .sort((a, b) => a[0] - b[0]);
  }

  // Visibility is a pure function of source ranges + selection/composition,
  // never rendered DOM textContent. P4B may reveal or dim markers but cannot
  // hide them; P6 is the sole owner of replacing/atomic hidden decorations.
  const selection = state.selection.main;

  const finalBuilder = new RangeSetBuilder<Decoration>();
  const markerDeco = Decoration.mark({ class: 'mf-marker' });
  // UTF-16 source ranges hidden as atomic marker units this build (P6). Fed to
  // `EditorView.atomicRanges` so the caret crosses each hidden marker as a
  // single unit (ADR §2) — the cursor never lands inside the invisible source.
  const hiddenAtomicSpans: Array<[number, number]> = [];
  // Collect every decoration (construct + its discrete marker delimiters) and
  // add them in ascending `from` order. Nested constructs (e.g. a Link
  // containing a URL, or emphasis inside bold) can place a later construct
  // INSIDE an earlier construct's marker span, so insertion must follow the
  // builder's sorted invariant — otherwise RangeSetBuilder throws
  // "Ranges must be added sorted". The DOM nesting is derived from the ranges'
  // geometry, not from insertion order, so this re-order is purely additive.
  const additions: Array<{ from: number; to: number; deco: Decoration }> = [];
  for (const range of constructs) {
    // P6-capable kinds are allowed to request the hidden state; the resolver
    // only returns `hidden` when the per-construct `.hidden` switch is ON.
    const hiddenRequested = clsToLivePreviewConstruct(range.cls) != null;
    let visibility = resolveConstructVisibility(range, selection, doc.length, {
      composing: view.composing,
      hiddenRequested,
    });
    range.visibility = visibility;
    if (visibility === 'hidden') {
      const hiddenOutcome = buildHiddenConstruct(range, doc, additions, hiddenAtomicSpans);
      if (hiddenOutcome === 'hidden') {
        // Hidden decorations were added; skip the normal visible/dimmed path.
        continue;
      }
      // The hide was declined (an empty heading must stay discoverable; a
      // setext underline cannot be hidden): fall back to the safe state the
      // builder chose — visible for an empty construct, dimmed otherwise.
      visibility = hiddenOutcome;
      range.visibility = visibility;
    }
    const active = visibility === 'revealed';
    additions.push({
      from: range.from,
      to: range.to,
      deco: active
        ? Decoration.mark({ class: `mf-construct ${range.cls} ${PROJECTION_CLASSES.active}` })
        : decorationFor(range.cls, range.level),
    });
    // Weak-reveal each marker delimiter range separately unless the construct
    // is active — only the syntax characters get `.mf-marker`, never the
    // content between two delimiters (design 03 §2).
    if (visibility === 'dimmed') {
      for (const [mf, mt] of range.markers) {
        additions.push({ from: mf, to: mt, deco: markerDeco });
      }
    }
  }
  additions.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const { from, to, deco } of additions) {
    finalBuilder.add(from, to, deco);
  }

  // Publish the atomic hidden-marker set for `EditorView.atomicRanges`. The
  // facet only uses each range's from/to (cursor atomicity); the value is a
  // real `Decoration` so the RangeSet builds (CM reads `.point` off the value).
  hiddenAtomicRanges =
    hiddenAtomicSpans.length > 0
      ? RangeSet.of(
          hiddenAtomicSpans.map(([f, t]) => ({ from: f, to: t, value: Decoration.replace({}) })),
          true,
        )
      : RangeSet.empty;

  lastSnapshot = { state: degraded ? 'degraded' : 'rendered', constructs, count, hiddenAtomic: hiddenAtomicSpans };
  return finalBuilder.finish();
}

/**
 * Projection ViewPlugin: rebuilds decorations when the doc, viewport, or
 * selection changes (also on composition). Follows the `highlightLimitPlugin`
 * pattern already in the codebase.
 */
export const projectionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      lastSnapshot = { state: 'projecting', constructs: [], count: 0, hiddenAtomic: [] };
      hiddenAtomicRanges = RangeSet.empty;
      try {
        this.decorations = buildDecorations(view);
      } catch {
        // A throw during the first build (e.g. a forced test failure or a
        // parser hiccup) must NOT crash the plugin: degrade to an empty
        // decoration set and keep the same EditorView mountable/editable.
        this.decorations = RangeSet.empty;
        lastSnapshot = { state: 'degraded', constructs: [], count: 0, hiddenAtomic: [] };
        hiddenAtomicRanges = RangeSet.empty;
      }
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.view.composing) {
        // Tasks 4.9: the state must reflect why we rebuild. `stale` is the
        // transient "rebuild pending" state; a composition build is tagged
        // `composing`; the rebuild itself resolves to `rendered`/`degraded`.
        if (update.view.composing) {
          lastSnapshot = { ...lastSnapshot, state: 'composing', constructs: [], count: 0 };
        } else if (update.docChanged) {
          lastSnapshot = { ...lastSnapshot, state: 'stale', constructs: [], count: 0 };
        }
        try {
          this.decorations = buildDecorations(update.view);
          // `buildDecorations` resolves to `rendered`/`degraded`. During an
          // active composition (e.g. a rebuild triggered alongside the IME
          // session) keep the `composing` tag so the debug state is truthful.
          if (update.view.composing && lastSnapshot.state !== 'degraded') {
            lastSnapshot = { ...lastSnapshot, state: 'composing' };
          }
        } catch {
          // Projection failure must never break input or save: degrade to raw
          // source (empty decoration set) and keep the plugin alive.
          this.decorations = RangeSet.empty;
          lastSnapshot = { state: 'degraded', constructs: [], count: 0, hiddenAtomic: [] };
          hiddenAtomicRanges = RangeSet.empty;
        }
      }
    }

    destroy() {
      // Switching back to Source (or closing the binding) removes this plugin.
      // The snapshot must reflect that the projection is off — never reuse a
      // stale rendered/stale/composing state for the next enable cycle.
      lastSnapshot = { state: 'source', constructs: [], count: 0, hiddenAtomic: [] };
      hiddenAtomicRanges = RangeSet.empty;
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

/**
 * Full projection extension (plugin only; the GFM extension must be part of the
 * `markdown({ extensions: [GFM] })` language config for `Strikethrough` nodes
 * to appear — see losslessSourceEditor.ts).
 *
 * P6 appends `EditorView.atomicRanges`: the hidden-marker source spans are
 * published here so the caret crosses each replaced marker as a single unit
 * (ADR §2) — the cursor never lands inside invisible source characters, which
 * CSS zero-width markers could not guarantee.
 */
export function projectionExtension(): Extension {
  return [
    projectionPlugin,
    EditorView.atomicRanges.of(() => hiddenAtomicRanges),
  ];
}
