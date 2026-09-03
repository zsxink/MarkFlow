// ── Opaque clipboard policy (task 7.5 / design Decision 5) ────────────────
//
// Copy/cut of a selected opaque atom must place its ORIGINAL raw Markdown on
// the clipboard — never the sentinel slot and never the internal placeholder
// label. A pasted foreign/unresolvable sentinel is treated as user text (the
// opaque node's `parseMarkdown` already ensures that) so it can never be
// resolved into an internal node without the current session registry.
//
// This module provides the pure substitution used by the editor's copy/cut
// handler: any sentinel in the serialized selection markdown is replaced by
// its registry raw; an unresolvable sentinel is left verbatim (it is just
// prose at that point).

import {
  OPAQUE_SENTINEL_PREFIX,
  OPAQUE_SENTINEL_SUFFIX,
  type OpaqueRegistry,
  parseSentinel,
} from './editor.markdown.opaque';

/**
 * Resolve any opaque sentinels in `text` back to their raw payloads.
 * An unresolvable sentinel (not in the registry) is left unchanged — it is
 * user content, not an internal token, and must never be dropped or rewritten.
 */
export function resolveClipboardOpaque(text: string, registry: OpaqueRegistry | null): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf(OPAQUE_SENTINEL_PREFIX, i);
    if (start === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, start);
    const end = text.indexOf(OPAQUE_SENTINEL_SUFFIX, start + OPAQUE_SENTINEL_PREFIX.length);
    if (end === -1) {
      out += text.slice(start); // lone opener: keep as-is
      break;
    }
    const sentinel = text.slice(start, end + 1);
    const slot = parseSentinel(sentinel);
    const entry = slot ? registry?.get(slot) : undefined;
    if (entry) {
      out += entry.raw; // substitute the raw payload
    } else {
      out += sentinel; // unresolvable → keep as user text
    }
    i = end + 1;
  }
  return out;
}

/** Whether `text` still contains an opaque sentinel (safety assertion). */
export function clipboardHasSentinel(text: string): boolean {
  return text.includes(OPAQUE_SENTINEL_PREFIX);
}
