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

import { RangeSet, RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';

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
  | 'degraded'; // fell back to source (huge doc / exception)

/**
 * A semantic construct to decorate: its content range plus the derived marker
 * span (the syntax characters). Exposed for semantic assertions (the content
 * AND the marker coexist) without leaking body text into the debug snapshot.
 */
export interface ConstructRange {
  from: number;
  to: number;
  /** Start of the marker (syntax) characters. */
  markerFrom: number;
  markerTo: number;
  /** Semantic class (`mf-h1`…, `mf-strong`, …). */
  cls: string;
}

export interface ProjectionSnapshot {
  state: ProjectionState;
  constructs: ConstructRange[];
  count: number;
}

// ── Construct classification ──────────────────────────────────────────

/**
 * Map a Lezer node to a semantic construct. Returns null for nodes P2 does not
 * project (HTML blocks, tables, frontmatter, images…) so they stay raw source.
 */
function classifyNode(name: string): { cls: string; level?: number } | null {
  if (name.startsWith('ATXHeading')) {
    const level = Number(name.slice('ATXHeading'.length)) || 1;
    return { cls: PROJECTION_CLASSES.heading, level };
  }
  if (name.startsWith('SetextHeading')) {
    return { cls: PROJECTION_CLASSES.heading, level: name.endsWith('2') ? 2 : 1 };
  }
  switch (name) {
    // GFM/CommonMark lezer: bold is `StrongEmphasis`, italic is `Emphasis`.
    case 'StrongEmphasis':
      return { cls: PROJECTION_CLASSES.strong };
    case 'Emphasis':
      return { cls: PROJECTION_CLASSES.emphasis };
    case 'Strikethrough':
      return { cls: PROJECTION_CLASSES.strikethrough };
    case 'InlineCode':
      return { cls: PROJECTION_CLASSES.inlineCode };
    case 'Link':
    case 'URL':
      return { cls: PROJECTION_CLASSES.link };
    case 'Blockquote':
      return { cls: PROJECTION_CLASSES.blockquote };
    case 'ListItem':
      return { cls: PROJECTION_CLASSES.listItem };
    case 'FencedCode':
      return { cls: PROJECTION_CLASSES.fence };
    default:
      return null;
  }
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

function buildDecorations(view: EditorView): DecorationSet {
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

      const cls = classifyNode(node.name);
      if (cls) {
        if (seen.has(nodeFrom)) return true;
        seen.add(nodeFrom);
        constructs.push({
          from: nodeFrom,
          to: nodeTo,
          // The marker span is refined below once we know which delimiter
          // nodes fall inside this construct.
          markerFrom: nodeFrom,
          markerTo: nodeFrom + Math.min(nodeTo - nodeFrom, 2),
          cls: cls.cls,
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

  // Assign precise marker spans to each construct using the collected
  // delimiter nodes that fall inside its range.
  for (const range of constructs) {
    const inside = markerSpans
      .filter(([mf, mt]) => mf >= range.from && mt <= range.to)
      .sort((a, b) => a[0] - b[0]);
    if (inside.length > 0) {
      range.markerFrom = inside[0][0];
      range.markerTo = inside[inside.length - 1][1];
    }
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
  for (const range of constructs) {
    const active = intersects(range);
    finalBuilder.add(
      range.from,
      range.to,
      active
        ? Decoration.mark({ class: `mf-construct ${range.cls} ${PROJECTION_CLASSES.active}` })
        : decorationFor(range.cls),
    );
    // Weak-reveal the marker characters unless the construct is active.
    if (!active && range.markerTo > range.markerFrom) {
      finalBuilder.add(range.markerFrom, range.markerTo, markerDeco);
    }
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
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.view.composing
      ) {
        try {
          this.decorations = buildDecorations(update.view);
          if (update.docChanged) lastSnapshot = { ...lastSnapshot, state: 'stale' };
        } catch {
          // Projection failure must never break input or save: degrade to raw
          // source (empty decoration set) and keep the plugin alive.
          this.decorations = RangeSet.empty;
          lastSnapshot = { state: 'degraded', constructs: [], count: 0 };
        }
      }
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
