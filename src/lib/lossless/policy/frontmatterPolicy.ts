// P4B task 7.7 — FrontMatter safe projection policy (design 05 §7; specs
// rich-markdown-blocks §"FrontMatter 与 raw HTML 使用显式安全策略").
//
// ── PARSER GAP (VERIFIED, honest terminal) ─────────────────────────────────
// `FrontMatter` nodes are NOT produced by the current Lezer config:
// `losslessSourceEditor.ts` uses `markdown({ extensions: [GFM] })`, and plain
// GFM does NOT emit a `FrontMatter` node (ADR §3.1 — the `---\ntitle: hi\n---`
// block parses as `HorizontalRule` + `SetextHeading2`). The `case
// 'FrontMatter'` in projection.ts is effectively dead today. Consequently the
// ONLY safe projection available is exact source — and that holds BY
// CONSTRUCTION, because there is no node to decorate and the document is never
// touched: the lossless Core owns the bytes; save reads the Core, never a
// renderer. The "复杂 FrontMatter → 完整 range 回退源码、保存保持原 bytes"
// requirement is therefore ALREADY satisfied structurally.
//
// This module records that gap and provides the policy scaffolding so that when
// a `frontmatter` Lezer extension IS added (future work; not in this config),
// the safe-subset boundary is already understood and fail-closed:
//
//   - Owner: `frontmatter` resolves to `source-fallback` (default) ALWAYS, but
//     the registration makes the policy explicit and flag-gated
//     (`p4b.frontmatter-policy`), consistent with the task 7.5 owner pattern.
//     Flag OFF ⇒ inert ⇒ plain default.
//   - A source-only widget descriptor (`allowsUnsafeHtml:false`,
//     `containerPolicy:'none'`, fallback `exact-source`).
//   - `classifySafeFrontmatter` — a PURE, fail-closed safe-subset classifier
//     proving the boundary is understood and tested even though it is not
//     wired to a node today. Complex YAML (anchors/aliases `&`/`*`, custom tags
//     `!!`, non-simple `key: value`, parse-error heuristics) ⇒ `{safe:false}`
//     ⇒ exact source. Only simple single-level `key: value` lines are `safe`.
//
// No widget DOM is built for FrontMatter (no node → nothing to mount). The
// deliverable is the explicit flag-gated owner, the source-only policy
// declaration, the fail-closed classifier, and this parser-gap documentation.

import {
  defineWidget,
  type SourceRangeSet,
  type WidgetDescriptor,
} from '../widgets/protocol';
import { isFrontmatterPolicyEnabled } from '../cohortFlags';
import { registerConstructOwner } from '../renderOwnerRegistry';

// ── Stable ids / labels ─────────────────────────────────────────────────────

const FRONTMATTER_WIDGET_ID = 'frontmatter-policy';
const FRONTMATTER_LABEL = 'p4b.frontmatter-policy';

// ── Safe-subset classifier (PURE, fail-closed, diagnostics) ────────────────

/**
 * A single simple `key: value` line: a bareword-ish key, `:`, then a value.
 * The VALUE must be a plain scalar — NOT a flow collection (`[ ]` / `{ }`),
 * a sequence (`- `), a block scalar (`|` / `>`), an alias (`*`), a merge
 * (`<<`), or a tag (`!`). Anything else is NOT in the safe subset and fails
 * closed below.
 */
const SIMPLE_KV = /^[A-Za-z_][A-Za-z0-9_-]*\s*:\s*(.+)$/;

/**
 * Conservative scalar check for a `key:` value. Rejects any leading collection /
 * tag / alias / block indicator and any flow collection characters anywhere in
 * the value — so `key: [a, b]`, `key: {a: 1}`, `key: - x`, `key: |`, `key: *x`
 * all fail closed. A quoted scalar (`"a: b"`) or punctuation scalar (`a? b!`)
 * is still trivially safe; only collection/tag/alias shape is rejected.
 */
function isSimpleScalarValue(v: string): boolean {
  const t = v.trim();
  if (t === '') return false;
  if (/^[\[{\-|>&*!?]/.test(t)) return false; // flow/seq/block/alias/tag/merge
  if (/[\[\]{}]/.test(t)) return false; // any flow-collection characters inside
  return true;
}

/**
 * Classify a FrontMatter YAML body (the lines between the `---` fences, EXCLUDING
 * the fences) into the safe subset. Fail-closed:
 *
 *   - `safe:true` ONLY for a block of simple, single-level `key: value` lines
 *     (blank lines and `#` comments are ignored);
 *   - `safe:false` (→ exact source) for anchors/aliases (`&` / `*`),
 *     custom tags (`!!`), any non-`key: value` line, a non-array input, or any
 *     parse ambiguity. Complex FrontMatter is never structurally projected.
 *
 * This is a conservative classifier used to PROVE the safe-subset boundary; it
 * is not currently wired to a node (see module header — no `FrontMatter` node
 * exists yet), so its output today can only ever push toward exact source.
 */
export function classifySafeFrontmatter(yamlLines: string[]): { safe: boolean; reason?: string } {
  if (!Array.isArray(yamlLines)) return { safe: false, reason: 'not-an-array' };
  for (let i = 0; i < yamlLines.length; i++) {
    const line = yamlLines[i];
    const trimmed = typeof line === 'string' ? line.trim() : '';
    if (trimmed === '' || trimmed.startsWith('#')) continue; // blank / comment → skip
    // Anchors / aliases / merge keys — https://yaml.org anchor `&name`, alias
    // `*name`, merge `<<: *name`. Conservatively ANY `&`/`*` pushes exact source
    // (an anchor can also hide a recursive structure).
    if (trimmed.includes('&') || trimmed.includes('*')) {
      return { safe: false, reason: `anchor-or-alias-at-line-${i + 1}` };
    }
    // Custom tags — `!!str` etc. always fail closed.
    if (trimmed.includes('!!')) {
      return { safe: false, reason: `custom-tag-at-line-${i + 1}` };
    }
    // Anything not a simple `key: value` line (list `-`, flow `[`/`{`, nested
    // mapping `  key:`, directives `%`, multi-doc `---`, empty value, etc.)
    // fails closed.
    const m = SIMPLE_KV.exec(trimmed);
    if (!m) {
      return { safe: false, reason: `not-simple-kv-at-line-${i + 1}` };
    }
    // The value itself must be a plain scalar — a flow collection (`{a: 1}`,
    // `[a, b]`), sequence, block scalar, alias or tag is complex YAML → reject.
    if (!isSimpleScalarValue(m[1])) {
      return { safe: false, reason: `not-scalar-value-at-line-${i + 1}` };
    }
  }
  return { safe: true };
}

// ── Widget descriptor (protocol declaration — source-only surface) ─────────

const FRONTMATTER_DESCRIPTOR_INPUT = {
  id: FRONTMATTER_WIDGET_ID,
  kind: 'frontmatter',
  ownerKind: 'frontmatter',
  flag: 'frontmatterPolicy',
  label: FRONTMATTER_LABEL,
  // Nothing to mount (no node today); the whole range is the exact-source
  // fallback region.
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
  accessibility: { name: 'frontmatter source', role: 'region', atomic: true },
  print: { default: 'source' },
  fallbackBehavior: 'exact-source',
} as const;

/** The frozen protocol descriptor of the FrontMatter policy surface. */
export const frontmatterPolicyDescriptor: WidgetDescriptor = defineWidget(
  FRONTMATTER_DESCRIPTOR_INPUT as unknown as WidgetDescriptor,
);

// ── Owner registration (explicit + flag-gated; default is already source-fb) ─

// Module-init owner registration: inert while the flag is OFF (default). While
// ON it is ACTIVE and labels resolution `p4b.frontmatter-policy` (still
// `source-fallback` — the policy is explicit and observable).
const teardownFrontmatterOwner = registerConstructOwner('frontmatter', 'source-fallback', {
  flag: () => isFrontmatterPolicyEnabled(),
  label: FRONTMATTER_LABEL,
});

/** Independent teardown of the FrontMatter policy owner (idempotent). */
export function teardownFrontmatterPolicy(): void {
  teardownFrontmatterOwner();
}
