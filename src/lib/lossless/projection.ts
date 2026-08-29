// Lossless Live Preview — local Markdown/Lezer projection decorations.
//
// P2 (design 03 §2, tasks 4.3-4.7): a single EditorView renders the source
// text; when the projection compartment is active, semantic decorations are
// layered ON TOP of the unchanged `EditorState.doc` (never a doc rewrite, never
// a serializer round-trip). Only visible ranges are decorated (viewport +
// overscan), and an active selection / composition reveals the marker of an
// intersecting construct (marker stays weak otherwise — never hidden in P2).
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

import { RangeSet, RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { getOwnerRegistrySnapshot, resolveConstructOwner, type ConstructKind } from './renderOwnerRegistry';

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
}

export interface ProjectionSnapshot {
  state: ProjectionState;
  constructs: ConstructRange[];
  count: number;
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
    case 'FencedCode':
      return 'fence';
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

// ── ViewPlugin: build + hold the DecorationSet ────────────────────────

let lastSnapshot: ProjectionSnapshot = { state: 'source', constructs: [], count: 0 };

export function getProjectionSnapshot(): ProjectionSnapshot {
  return lastSnapshot;
}

export function resetProjectionSnapshot(): void {
  lastSnapshot = { state: 'source', constructs: [], count: 0 };
}

/** Reflect a binding teardown in the debug state (task 4.9 `disposed`). */
export function setProjectionDisposed(): void {
  lastSnapshot = { state: 'disposed', constructs: [], count: 0 };
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

  // Active reveal: when the current selection (or a small neighborhood around a
  // collapsed caret / composition) intersects a construct, promote that
  // construct to `mf-active` (full marker visibility). Selection is the ONLY
  // cursor state that drives reveal — never DOM textContent.
  const selection = state.selection.main;
  const radius = 2;
  const revealFrom = Math.max(0, selection.from - (selection.empty ? radius : 0));
  const revealTo = Math.min(doc.length, selection.to + (selection.empty ? radius : 0));
  const intersects = (r: ConstructRange) => r.from <= revealTo && r.to >= revealFrom;

  const finalBuilder = new RangeSetBuilder<Decoration>();
  const markerDeco = Decoration.mark({ class: 'mf-marker' });
  // Collect every decoration (construct + its discrete marker delimiters) and
  // add them in ascending `from` order. Nested constructs (e.g. a Link
  // containing a URL, or emphasis inside bold) can place a later construct
  // INSIDE an earlier construct's marker span, so insertion must follow the
  // builder's sorted invariant — otherwise RangeSetBuilder throws
  // "Ranges must be added sorted". The DOM nesting is derived from the ranges'
  // geometry, not from insertion order, so this re-order is purely additive.
  const additions: Array<{ from: number; to: number; deco: Decoration }> = [];
  for (const range of constructs) {
    const active = intersects(range);
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
    if (!active) {
      for (const [mf, mt] of range.markers) {
        additions.push({ from: mf, to: mt, deco: markerDeco });
      }
    }
  }
  additions.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const { from, to, deco } of additions) {
    finalBuilder.add(from, to, deco);
  }

  lastSnapshot = { state: degraded ? 'degraded' : 'rendered', constructs, count };
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
      lastSnapshot = { state: 'projecting', constructs: [], count: 0 };
      try {
        this.decorations = buildDecorations(view);
      } catch {
        // A throw during the first build (e.g. a forced test failure or a
        // parser hiccup) must NOT crash the plugin: degrade to an empty
        // decoration set and keep the same EditorView mountable/editable.
        this.decorations = RangeSet.empty;
        lastSnapshot = { state: 'degraded', constructs: [], count: 0 };
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
          lastSnapshot = { state: 'degraded', constructs: [], count: 0 };
        }
      }
    }

    destroy() {
      // Switching back to Source (or closing the binding) removes this plugin.
      // The snapshot must reflect that the projection is off — never reuse a
      // stale rendered/stale/composing state for the next enable cycle.
      lastSnapshot = { state: 'source', constructs: [], count: 0 };
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
 */
export function projectionExtension(): Extension {
  return [projectionPlugin];
}
