// ── Bounded lookahead for marked block tokenizer `start` callbacks ──────
//
// Marked invokes every registered block-level extension's `start(remaining)`
// at each block boundary (its lexer passes `remaining.slice(1)` and uses the
// smallest non-negative index to cut the paragraph scan). A `start` that scans
// the whole remaining string therefore costs O(remaining) per block — O(n²)
// over the document. On fragmented documents (headings/lists/short
// paragraphs) that quadratic term dominated everything: 1.9MB lexed in 25.6s
// before #411, while the same text without extension `start` hooks lexed in
// 82ms.
//
// Bounded here means: only the first `TOKENIZER_START_WINDOW` code units of
// the passed string are inspected. A match beyond the window is reported as
// "no candidate this round" (-1); Marked then lets the built-in tokenizers
// consume the next block and calls `start` again on the shorter tail, so an
// opener that slid out of the window is found a few block boundaries later.
// The only loss case — a single built-in block longer than the window whose
// interior contains a real `$$`/sentinel opener line — is caught by the
// admission round-trip fingerprint and preserved as a local literal block, so
// round-trip losslessness is unchanged (existing safety net, not a new carve-out).

/**
 * Lookahead window (UTF-16 code units) for block tokenizer `start` scans.
 * 64KB exceeds any realistic single Markdown block by orders of magnitude
 * while keeping each boundary probe (one substring copy + SIMD indexOf) in
 * the microseconds — measured cost on a 10MB fragmented document is linear
 * (~0.2-0.5s of `start` overhead total).
 */
export const TOKENIZER_START_WINDOW = 64 * 1024;

/**
 * `String.prototype.indexOf` bounded to the lookahead window, for tokenizers
 * whose opener is a plain prefix (e.g. the opaque sentinel). Returns the same
 * value as `source.indexOf(needle)` when the first hit lies inside the
 * window, and -1 otherwise.
 */
export function indexOfWithinStartWindow(source: string, needle: string): number {
  if (source.length <= TOKENIZER_START_WINDOW) return source.indexOf(needle);
  return source.substring(0, TOKENIZER_START_WINDOW).indexOf(needle);
}
