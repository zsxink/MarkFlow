// P4B task 7.7 — raw HTML policy surface (design 05 §7; specs
// rich-markdown-blocks §"FrontMatter 与 raw HTML 使用显式安全策略").
//
// SECURITY POSTURE: source-only, the strongest default-off. An HTML block is
// NEVER mounted as a DOM preview in the editing surface: `raw-html` declares
// `allowsUnsafeHtml: false` and `containerPolicy: 'none'`, so no script can ever
// run and no unauthorized resource can ever load from a preview. The block is
// shown as exact source bytes, still fully editable and savable (save reads the
// lossless Core, never a renderer).
//
//   - `allowsUnsafeHtml:false` + `containerPolicy:'none'` are the hard
//     invariants (protocol.ts). No `.innerHTML` anywhere in this module; no
//     `createElement` carrying sanitized HTML; the strongest posture = source.
//     A future sanitized read-only preview is recorded as a PENDING decision in
//     the module header — NOT built, deliberately (see "Sanitized preview"
//     below).
//   - Owner: `htmlBlock` resolves to `source-fallback` ALWAYS (the default
//     owner), but the registration below makes the policy EXPLICIT and
//     flag-gated (`p4b.raw-html-policy`), consistent with the task 7.5 owner
//     pattern. Flag OFF (default) ⇒ inert ⇒ owner is the plain default.
//   - The ViewPlugin DECORATES (never replaces) each visible HTMLBlock with a
//     single semantic mark (`mf-html-block` + `data-raw-html-policy="source"`)
//     so the policy is observable and testable. Decoration never hides, replaces
//     or mutates the source bytes — the raw HTML text stays exact and editable.
//   - `isSafeHtmlBlock` is a conservative diagnostics-only allow/deny — it never
//     mounts anything; when unsafe the module simply returns no widget (exact
//     source shown), which is the same behaviour as safe (source-only policy).
//   - `revealSource` is trivially a no-op: the source is ALWAYS shown, so there
//     is nothing to reveal.
//
// Parser ground truth (VERIFIED, ADR §3.1): `@lezer/markdown` (GFM) DOES produce
// `HTMLBlock` nodes for `<script>`, `<div>`, `<iframe>`, `<object>`, etc. — the
// node span is the full raw-HTML source span `[from, to)` in `EditorState.doc`
// UTF-16 coordinates. All range math here is Lezer-trusted (never DOM
// textContent, never a cached position).
//
// ── Sanitized preview (PENDING, intentionally deferred) ────────────────────
// The spec ("Raw HTML 默认 SHALL 显示源码或经过严格 sanitize 的只读 preview")
// offers a sanitized read-only preview as an ALTERNATIVE to showing source. The
// strong default chosen here is SOURCE-ONLY: no preview DOM at all, so nothing
// can execute. A DOMPurify-sanitized preview WOULD be feasible (DOMPurify is
// already a dependency, `src/lib/exportLossless.ts`), but it is deliberately
// NOT built because a sanitized DOM still risks misconfiguration, still needs a
// `containerPolicy` upgrade from `'none'`, and adds a second render path for no
// user-facing benefit yet. It is correctly deferred; the safe-source default
// satisfies the spec's first alternative and the hard invariants.

import { EditorView, ViewPlugin, Decoration, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { EditorState, Extension } from '@codemirror/state';
import { RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import {
  defineWidget,
  validateSourceRangeSet,
  type SourceRangeSet,
  type WidgetDescriptor,
  type WidgetSourceChange,
} from '../widgets/protocol';
import { nearestAncestor, type SyntaxNodeLike } from '../widgets/widgetSource';
import { isRawHtmlPolicyEnabled } from '../cohortFlags';
import { registerConstructOwner } from '../renderOwnerRegistry';

// ── Stable ids / labels / DOM classes ───────────────────────────────────────

const RAW_HTML_WIDGET_ID = 'raw-html-policy';
const RAW_HTML_LABEL = 'p4b.raw-html-policy';

/** Semantic classes exposed for unit + desktop E2E assertions. */
export const POLICY_CLASSES = {
  htmlBlock: 'mf-html-block',
} as const;

/** The `data-raw-html-policy` marker value stamped on a policy surface. */
export const RAW_HTML_DATA_ATTR = 'data-raw-html-policy';
export const RAW_HTML_DATA_VALUE = 'source';

// ── Security pre-scan (diagnostics / decision only — NEVER mounts) ─────────

/**
 * Conservative allow/deny used ONLY for diagnostics/decision — never to mount
 * raw HTML. Returns `true` only for a block the strict subset considers safe;
 * every dangerous construct (script, event handler, active URL protocol,
 * foreignObject, dangerous embed element) returns `false` (reject → the module
 * returns no widget, exact source shown). Fail-closed: anything non-trivial or
 * mis-typed is rejected.
 */
const UNSAFE_PATTERNS: readonly RegExp[] = [
  /<script\b/i, // opening script tag
  /<\/script\s*>/i, // closing script tag
  /on\w+\s*=/i, // any event-handler attribute: onclick=, onmouseover=, ...
  /\bjavascript\s*:/i, // javascript: URL
  /\bdata\s*:\s*text\/html/i, // data:text/html payload
  /\bvbscript\s*:/i, // vbscript: URL
  /foreignobject/i, // SVG foreignObject (HTML-inside-SVG escape hatch)
  /<(?:iframe|object|embed)\b/i, // dangerous/malicious embed elements
  /<\/(?:iframe|object|embed)\s*>/i, // ... and their closers
];

/**
 * `true` when `html` is a safe HTML-block subset. Conservative by design:
 * guards every hard invariant (no script, no event handler, no active URL, no
 * foreignObject, no dangerous embed), and fails closed on any hit or non-string.
 */
export function isSafeHtmlBlock(html: string): boolean {
  if (typeof html !== 'string' || html.length === 0) return false;
  for (const re of UNSAFE_PATTERNS) {
    if (re.test(html)) return false;
  }
  return true;
}

// ── Source-range resolver (Lezer-trusted, protocol `SourceRangeSet`) ────────

/** A visible HTML block's sharp source span, plus its exact bytes. */
export interface HtmlBlockRange {
  /** Full `HTMLBlock` source span `[from, to)` (EditorState.doc, UTF-16). */
  from: number;
  to: number;
  /** The exact raw-HTML bytes (source-derived from the DOC, never DOM). */
  text: string;
}

function htmlBlockNodeAt(state: EditorState, pos: number): SyntaxNodeLike | null {
  if (pos < 0 || pos > state.doc.length) return null;
  const node = syntaxTree(state).resolveInner(pos, 0);
  return nearestAncestor(node, 'HTMLBlock');
}

/**
 * Protocol `SourceRangeSet` for the `HTMLBlock` at `pos` (doc coordinates).
 * The whole block is the `source` AND the `content` (there is no inner content
 * distinct from the raw HTML), and `markers` is `[]` — the whole block is the
 * fallback region; there are no discrete interactive markers to reveal.
 * Re-resolved from the CURRENT doc; returns null when `pos` is not inside an
 * HTML block. UTF-16 half-open, `validateSourceRangeSet`-gated.
 */
export function htmlBlockTargetFromState(state: EditorState, pos: number): SourceRangeSet | null {
  const node = htmlBlockNodeAt(state, pos);
  if (!node) return null;
  const set: SourceRangeSet = {
    source: { from: node.from, to: node.to },
    content: { from: node.from, to: node.to },
    markers: [],
  };
  if (validateSourceRangeSet(set, state.doc.length).length > 0) return null;
  return set;
}

/**
 * Collect every visible `HTMLBlock` range in the viewport (Lezer-iterated,
 * same invalidation closure as the projection: visible ranges only). Off-screen
 * blocks are never parsed or decorated. Document order (blocks never nest, so
 * `from` is strictly ascending — safe for the RangeSetBuilder).
 */
export function collectVisibleHtmlBlocks(view: EditorView): HtmlBlockRange[] {
  const state = view.state;
  const tree = syntaxTree(state);
  const visible = view.visibleRanges;
  const out: HtmlBlockRange[] = [];
  if (tree.length === 0) return out;
  tree.iterate({
    enter(n) {
      if (n.name !== 'HTMLBlock') return true;
      if (!visible.some((r) => n.from < r.to && n.to > r.from)) return false;
      out.push({ from: n.from, to: n.to, text: state.doc.slice(n.from, n.to).toString() });
      return false; // never descend into raw HTML — it is not Markdown
    },
  });
  return out;
}

/**
 * Reveal-source affordance. For this SOURCE-only policy surface reveal is
 * trivially "already showing source": the raw HTML bytes are always displayed
 * exactly, so there is nothing to reveal. Returns `null` (no-op) and NEVER
 * builds DOM or changes bytes. The signature is the protocol contract
 * (`WidgetSourceChange | null`) so callers can route it uniformly.
 */
export function revealSource(_state: EditorState, _pos: number): WidgetSourceChange | null {
  return null;
}

// ── Widget descriptor (protocol declaration — source-only surface) ─────────

const RAW_HTML_DESCRIPTOR_INPUT = {
  id: RAW_HTML_WIDGET_ID,
  kind: 'raw-html',
  ownerKind: 'htmlBlock',
  flag: 'rawHtmlPolicy',
  label: RAW_HTML_LABEL,
  // Nothing to mount: the whole block is the fallback region, shown as source.
  ranges: (): SourceRangeSet | null => null,
  surface: { type: 'readonly' },
  interaction: { commands: ['reveal-source'], atomic: false, revealOnFocus: 'source', readOnly: 'source-drop' },
  atomic: false,
  async: { asyncAllowed: false, staleResultHandler: 'discard-and-log', retry: 'none' },
  security: {
    untrustedContent: true,
    allowsUnsafeHtml: false, // never mounts raw HTML
    containerPolicy: 'none', // no markup may be mounted at all
    allowedUrlProtocols: [], // no external request
    externalNetworkGated: false,
  },
  accessibility: { name: 'raw html source', role: 'region', atomic: true },
  print: { default: 'source' },
  fallbackBehavior: 'exact-source',
} as const;

/** The frozen protocol descriptor of the raw-HTML policy surface. */
export const rawHtmlPolicyDescriptor: WidgetDescriptor = defineWidget(
  RAW_HTML_DESCRIPTOR_INPUT as unknown as WidgetDescriptor,
);

// ── Owner registration (explicit + flag-gated; default is already source-fb) ─

// Module-init owner registration: inert while the flag is OFF (default), so the
// kind resolves to the plain `source-fallback` default with source `'default'`.
// While ON the registration is ACTIVE and labels resolution `p4b.raw-html-policy`
// (still `source-fallback` — the policy is explicit and observable).
const teardownRawHtmlOwner = registerConstructOwner('htmlBlock', 'source-fallback', {
  flag: () => isRawHtmlPolicyEnabled(),
  label: RAW_HTML_LABEL,
});

/** Independent teardown of the raw-HTML policy owner (idempotent). */
export function teardownRawHtmlPolicy(): void {
  teardownRawHtmlOwner();
}

// ── The ViewPlugin: mark (never replace) visible HTML blocks ────────────────

function fallbackEmptyDecorations(): DecorationSet {
  return new RangeSetBuilder<Decoration>().finish();
}

function buildPolicyDecorations(view: EditorView): DecorationSet {
  if (!isRawHtmlPolicyEnabled()) return fallbackEmptyDecorations();
  const builder = new RangeSetBuilder<Decoration>();
  // A semantic MARK — it adds a class + data attribute to the block's text,
  // never replaces or hides it. The raw bytes stay exact, selectable, editable.
  const mark = Decoration.mark({
    class: POLICY_CLASSES.htmlBlock,
    attributes: { [RAW_HTML_DATA_ATTR]: RAW_HTML_DATA_VALUE },
  });
  for (const r of collectVisibleHtmlBlocks(view)) {
    builder.add(r.from, r.to, mark);
  }
  return builder.finish();
}

/**
 * The task 7.7 raw-HTML policy ViewPlugin: DECORATES each visible HTMLBlock
 * with a single semantic mark when the flag is ON; emits NOTHING when the flag
 * is OFF (default — source is byte-identical, no decoration, no owner change).
 * A build throw degrades to an empty decoration set (exact source stays
 * editable — failure fallback, design 05 §9).
 */
export const rawHtmlPolicyPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      try {
        this.decorations = buildPolicyDecorations(view);
      } catch {
        this.decorations = fallbackEmptyDecorations();
      }
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.view.composing) {
        try {
          this.decorations = buildPolicyDecorations(update.view);
        } catch {
          this.decorations = fallbackEmptyDecorations();
        }
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

/**
 * The full 7.7 raw-HTML policy extension. Install in the SAME projection
 * compartment as `projectionExtension()` / `widgetProjectionExtension()` so it
 * mounts/unmounts with Live Preview and never exists in plain Source.
 */
export function rawHtmlPolicyExtension(): Extension {
  return [rawHtmlPolicyPlugin];
}
