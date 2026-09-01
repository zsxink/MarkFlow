// ── Opaque render / restore bridge (task 7.4 / design Decision 5) ─────────
//
// The two directions that turn opaque raw spans into WYSIWYG-safe sentinels
// and back, validated one-to-one:
//
//   render(source)
//     scan exact opaque ranges → register each in a fresh session registry →
//     replace each raw span with its sentinel → return the sentinel source +
//     the registry (which also carries the user source + raw payloads).
//
//   restore(serialized, registry)
//     find every sentinel in the serialized markdown → require one-to-one
//     occurrence with the registered slots, in registration order, with an
//     intact digest → substitute sentinels with their raw payloads → and
//     finally assert NO sentinel namespace remains. Any missing, duplicated,
//     reordered, unknown slot, or a leftover sentinel → `conflict` with no
//     candidate (the bridge caller must not emit Markdown containing tokens).
//
// The registry is the ONLY holder of raw payloads; the returned markdown in
// render() contains sentinels (slot-only), never opaque bytes.

import {
  OPAQUE_SENTINEL_PREFIX,
  OPAQUE_SENTINEL_SUFFIX,
  OpaqueRegistry,
  opaqueDigest,
  parseSentinel,
  scanCodeRegions,
  scanOpaqueSpans,
  type OpaqueSpan,
} from './editor.markdown.opaque';

export type OpaqueRenderResult =
  | { ok: true; markdown: string; registry: OpaqueRegistry; spans: OpaqueSpan[] }
  | { ok: false; code: 'scan-failed' | 'register-failed' };

export type OpaqueRestoreResult =
  | { ok: true; markdown: string }
  | {
      ok: false;
      code:
        | 'unknown-slot'
        | 'duplicate-slot'
        | 'missing-slot'
        | 'reorder'
        | 'digest'
        | 'sentinel-left';
      slot?: string;
    };

/** Find all sentinel slots in order, with their positions. */
function findSentinels(text: string): Array<{ slot: string; from: number; to: number }> {
  const found: Array<{ slot: string; from: number; to: number }> = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf(OPAQUE_SENTINEL_PREFIX, i);
    if (start === -1) break;
    const end = text.indexOf(OPAQUE_SENTINEL_SUFFIX, start + OPAQUE_SENTINEL_PREFIX.length);
    if (end === -1) break;
    const slot = parseSentinel(text.slice(start, end + 1));
    if (slot) found.push({ slot, from: start, to: end + 1 });
    i = end + 1;
  }
  return found;
}

/**
 * Render `source` into sentinel form for WYSIWYG admission. Scans the opaque
 * allowlist, registers every span against a fresh session registry, and swaps
 * each raw span for its sentinel. Any ambiguous/unclosed boundary fails the
 * scan (the caller then keeps the document `source-only`).
 */
export function renderOpaque(
  source: string,
  options: { registry?: OpaqueRegistry } = {},
): OpaqueRenderResult {
  const codeRegions = scanCodeRegions(source);
  if (codeRegions.unclosed) return { ok: false, code: 'scan-failed' };
  const scan = scanOpaqueSpans(source, { codeRegions: codeRegions.regions });
  if (!scan.ok) return { ok: false, code: 'scan-failed' };

  const spans: OpaqueSpan[] = scan.spans;
  const registry = options.registry ?? new OpaqueRegistry(source);
  const replacements: Array<{ from: number; to: number; text: string }> = [];

  for (const span of spans) {
    const raw = source.slice(span.from, span.to);
    const result = registry.register(span.category, raw, { from: span.from, to: span.to });
    if (!result.ok) return { ok: false, code: 'register-failed' };
    replacements.push({ from: span.from, to: span.to, text: result.sentinel });
  }

  // Apply replacements from the end so earlier offsets stay valid.
  let out = '';
  let last = 0;
  for (const r of [...replacements].sort((a, b) => a.from - b.from)) {
    out += source.slice(last, r.from);
    out += r.text;
    last = r.to;
  }
  out += source.slice(last);

  return { ok: true, markdown: out, registry, spans };
}

/**
 * Restore sentinels in `serialized` back to their raw payloads, validated
 * one-to-one. Returns a `conflict` without a candidate on any violation.
 */
export function restoreOpaque(serialized: string, registry: OpaqueRegistry): OpaqueRestoreResult {
  const found = findSentinels(serialized);

  // 1. Every sentinel must be a known slot (no forged/foreign sentinels).
  for (const f of found) {
    if (!registry.get(f.slot)) {
      return { ok: false, code: 'unknown-slot', slot: f.slot };
    }
  }

  // 2. Duplicate slot occurrences (one-to-one violated).
  const seen = new Set<string>();
  for (const f of found) {
    if (seen.has(f.slot)) return { ok: false, code: 'duplicate-slot', slot: f.slot };
    seen.add(f.slot);
  }

  // 3. Every registered slot must appear (a deleted atom → missing).
  const registeredOrder = registry.all().map((e) => e.slot);
  const foundSet = new Set(found.map((f) => f.slot));
  for (const slot of registeredOrder) {
    if (!foundSet.has(slot)) return { ok: false, code: 'missing-slot', slot };
  }

  // 4. Sentinels must appear in registration (top-to-bottom) order.
  const serializedOrder = found.map((f) => f.slot);
  const position = new Map<string, number>();
  registeredOrder.forEach((slot, index) => {
    if (!position.has(slot)) position.set(slot, index);
  });
  for (let k = 1; k < serializedOrder.length; k += 1) {
    const prev = position.get(serializedOrder[k - 1]);
    const cur = position.get(serializedOrder[k]);
    if (prev === undefined || cur === undefined || cur <= prev) {
      return { ok: false, code: 'reorder', slot: serializedOrder[k] };
    }
  }

  // 5. Substitute sentinels with raw payloads (bottom-up).
  let out = serialized;
  for (const f of [...found].sort((a, b) => b.from - a.from)) {
    const entry = registry.get(f.slot)!;
    // Digest integrity: the recorded digest must equal the raw we substitute.
    if (opaqueDigest(entry.raw) !== entry.digest) {
      return { ok: false, code: 'digest', slot: f.slot };
    }
    out = out.slice(0, f.from) + entry.raw + out.slice(f.to);
  }

  // 6. Final no-sentinel assertion: nothing internal may reach disk.
  if (out.includes(OPAQUE_SENTINEL_PREFIX)) {
    return { ok: false, code: 'sentinel-left' };
  }

  return { ok: true, markdown: out };
}
