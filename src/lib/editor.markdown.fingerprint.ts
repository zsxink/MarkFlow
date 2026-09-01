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

/**
 * Attributes that are runtime-only and must never affect the semantic
 * fingerprint (they may differ between baseline and candidate without meaning
 * any authored-data change). `slot` is the opaque atom's session-transient
 * registry id (task 8.4): opaque *content* is compared by registry integrity
 * (1:1 restore validates raw + digest), never by the slot bytes, so a candidate
 * re-rendered with a fresh nonce still fingerprints equal to the live doc.
 */
const RUNTIME_ONLY_KEYS = new Set(['src', 'colgroup', 'colwidth', 'rowspan-real', 'data-pos', 'slot']);

function isRuntimeOnlyKey(key: string): boolean {
  return RUNTIME_ONLY_KEYS.has(key) || key.startsWith('data-');
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
      // .parse, which differ on empty arrays) fingerprint identically.
      const normalized = ((value as JSONContent[] | undefined) ?? []).map(normalizeNode);
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
        if (isRuntimeOnlyKey(aKey)) continue;
        sorted[aKey] = attrs[aKey];
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
