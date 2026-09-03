// ── Stage-two semantic fingerprint + canonicalization policy (6.3) ──────
//
// The fingerprint is a stable, content-only digest of a parsed ProseMirror
// document. It strips runtime-only attributes (image `src` that was resolved to
// an `asset:` URL, table layout columns, node-view state, `data-*`) so a
// candidate that differs from its baseline ONLY by representation work has the
// same fingerprint. It is used by admission verification (6.4) and by the
// reconcile classifier (8.2) to prove a candidate reparses to the same editor
// semantics.
//
// The canonicalization policy names the registered, semantically-neutral
// Markdown differences the pipeline is allowed to introduce (the same set as
// the differential gate 5.4). Two sources that differ only by these are
// considered equivalent for round-trip safety.

import type { JSONContent } from '@tiptap/core';
import { assetToOriginalMap } from './editor.state';

/**
 * Attributes that are runtime-only and must never affect the semantic
 * fingerprint (they may differ between baseline and candidate without meaning
 * any authored-data change). `slot` is the opaque atom's session-transient
 * registry id (task 8.4): opaque *content* is compared by registry integrity
 * (1:1 restore validates raw + digest), never by the slot bytes, so a candidate
 * re-rendered with a fresh nonce still fingerprints equal to the live doc.
 */
const RUNTIME_ONLY_KEYS = new Set(['colgroup', 'colwidth', 'rowspan-real', 'data-pos', 'slot', 'authoredSrc']);

function isRuntimeOnlyKey(key: string): boolean {
  return RUNTIME_ONLY_KEYS.has(key) || key.startsWith('data-');
}

/** Parser/extension defaults that have no authored Markdown representation. */
function isDefaultAttribute(node: JSONContent, key: string, value: unknown): boolean {
  // `setContent` materializes absent optional attrs as null while manager.parse
  // omits them. Markdown cannot distinguish those representations.
  if (value === null || value === undefined) return true;

  if ((node.type === 'tableCell' || node.type === 'tableHeader')
    && (key === 'colspan' || key === 'rowspan') && value === 1) return true;

  if (node.type === 'orderedList' && key === 'start' && value === 1) return true;

  // CustomLink injects these DOM-safety defaults; Markdown authors only control
  // href/title. Preserve href/title below, but ignore extension configuration.
  if (node.type === 'link') {
    if (key === 'class') return true;
    if (key === 'rel' && value === 'noopener noreferrer nofollow') return true;
    if (key === 'target' && value === '_blank') return true;
  }

  return false;
}

function authoredImageSource(attrs: Record<string, unknown>): unknown {
  // The resolver records this on the node, not only in a global Map.  A global
  // URL map cannot distinguish `a/../img.png` from `img.png` when both resolve
  // to the same runtime asset URL.
  const authored = attrs.authoredSrc;
  if (typeof authored === 'string') return authored;
  const src = attrs.src;
  return typeof src === 'string' ? (assetToOriginalMap.get(src) ?? src) : src;
}

/**
 * Produce a normalized, semantically-stable JSON string for a document node.
 * Node/mark types, text, and *authored* attributes (alt, title, href, language,
 * checked) are preserved; runtime-only attributes are stripped; object keys are
 * sorted so ordering differences never change the digest.
 */
function normalizeNode(node: JSONContent): unknown {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(node).sort()) {
    const value = (node as Record<string, unknown>)[key];
    if (isRuntimeOnlyKey(key)) continue;
    if (key === 'marks') {
      // Marks are a list of { type, attrs }; normalize each deeply. An empty
      // marks array is omitted so the two parse paths (setContent vs manager
      // .parse, which differ on empty arrays) fingerprint identically. A mark
      // set is unordered in ProseMirror semantics, so parser-specific order is
      // normalized without changing mark ranges or authored attributes.
      const normalized = ((value as JSONContent[] | undefined) ?? [])
        .map(normalizeNode)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      if (normalized.length > 0) out[key] = normalized;
    } else if (key === 'content') {
      const normalized = ((value as JSONContent[] | undefined) ?? []).map(normalizeNode);
      if (normalized.length > 0) out[key] = normalized;
    } else if (key === 'attrs') {
      // Sort attrs and drop runtime-only ones. An all-stripped attrs object is
      // semantically indistinguishable from "no attrs", so omit the key.
      const attrs = (value as Record<string, unknown> | undefined) ?? {};
      const sorted: Record<string, unknown> = {};
      for (const aKey of Object.keys(attrs).sort()) {
        if (isRuntimeOnlyKey(aKey) || isDefaultAttribute(node, aKey, attrs[aKey])) continue;
        sorted[aKey] = attrs[aKey];
      }
      if (node.type === 'image') {
        const src = authoredImageSource(attrs);
        if (src !== undefined) sorted.src = src;
      }
      if (Object.keys(sorted).length > 0) out[key] = sorted;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Deterministic content-only fingerprint (stable across runtime state). */
export function semanticFingerprint(doc: JSONContent): string {
  return JSON.stringify(normalizeNode(doc ?? { type: 'doc', content: [] }));
}

/**
 * Registered, semantically-neutral canonicalizations (in sync with the
 * differential gate 5.4 names). A markdown source is "safe" against another if
 * it differs only by these.
 */
export const CANONICALIZATIONS = [
  'list-continuation-indent',
  'table-column-padding',
  'table-pipe-escaping',
  'code-trailing-newline',
  'file-tail-newline',
  'link-href-escaping',
  'soft-break-normalization',
] as const;

// ── Known-but-NOT-registered canonicalization ──────────────────────────
//
// `inline-code-trailing-space` is deliberately absent from the allowlist. A
// code span with a trailing space (e.g. `` `# ` ``, `` `- ` ``, `` `1. ` ``)
// does NOT round-trip through the v3 markdown serializer: the trailing space
// is moved out of the code span and re-attached to the following text
// (`` `# ` `` → `` `#` `` + `" 前缀"`), so the re-parsed fingerprint differs
// from the source. Because the code *content* changes, treating it as neutral
// would weaken the no-loss guarantee, so `verifyAdmission` rejects such docs
// to `source-only` (reason `parse-verification-failed`). Documenting per
// issue decision: keep them in Source until a lossless serializer fix (or an
// explicit, reviewed canonicalization) exists. Do NOT add this to
// `CANONICALIZATIONS` without revisiting that decision.

export type Canonicalization = (typeof CANONICALIZATIONS)[number];

/**
 * Apply the pure-text canonicalizations (currently just EOF trailing-newline
 * normalization) so two sources that differ only by approved neutral formatting
 * normalize to the same string. The structural canonicalizations (column
 * padding, escaping, indentation, soft-break) are compared at the PARSED level
 * via `semanticFingerprint` by the admission/reconcile layer, not here.
 */
export function canonicalize(markdown: string): string {
  // file-tail-newline: collapse any run of trailing newlines to a single one so
  // an appended blank line at EOF does not count as a content difference.
  return markdown.replace(/\n+$/, '\n');
}

/**
 * String-level equivalence under the pure-text canonicalizations. For a full
 * check use `semanticFingerprint` on the parsed JSON of both sides (see 6.4 /
 * 8.2); this helper is only for cheap pre-checks and markers.
 */
export function isSemanticallyEquivalent(a: string, b: string): boolean {
  return a === b || canonicalize(a) === canonicalize(b);
}
