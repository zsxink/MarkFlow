// ── Stage-two WYSIWYG eligibility classifier (design Decision 4) ────────
//
// A pure, deterministic function over the exact source that returns an
// admission verdict:
//
//   eligible              every construct is supported and the document can be
//                         safely edited in WYSIWYG
//   eligible-with-opaque  unsupported constructs are entirely covered by the
//                         registered opaque allowlist (front matter, block
//                         HTML, HTML comments) and are independently delimited
//   source-only           ambiguous/unclosed boundaries, an unknown construct,
//                         or a construct that crosses a supported/opaque region
//
// The initial opaque allowlist is deliberately narrow (design Decision 4):
//   - YAML front matter at the start of the file
//   - complete block HTML
//   - complete HTML comments
// Reference-style links, footnotes, inline HTML and math delimiters are
// `source-only` in the first release because their meaning can cross span
// boundaries. Generic fenced code blocks are supported (not opaque).

import type { EligibilityResult } from './editor.markdown.types';
import { scanCodeRegions, scanOpaqueSpans, type OpaqueSpan } from './editor.markdown.opaque';

export type { OpaqueSpan } from './editor.markdown.opaque';

/**
 * Deterministic eligibility classification. Returns `source-only` for any
 * unknown/unclosed/ambiguous construct or any construct that would cross an
 * opaque boundary; otherwise `eligible` or `eligible-with-opaque`.
 */
export function classifyEligibility(source: string): EligibilityResult {
  const src = source.replace(/\r\n/g, '\n');
  const len = src.length;
  if (src.trim().length === 0) {
    return { verdict: 'eligible', reason: 'supported' };
  }

  // ── 1. Recognize and consume the opaque allowlist first ─────────────
  // The precise range scanner (task 7.1) masks fenced-code content and rejects
  // unclosed/crossing regions up front; any failure is an ambiguous boundary.
  const codeRegions = scanCodeRegions(src);
  if (codeRegions.unclosed) {
    return { verdict: 'source-only', reason: 'ambiguous-boundary', category: 'code-fence' };
  }
  const scan = scanOpaqueSpans(src, { codeRegions: codeRegions.regions });
  if (!scan.ok) {
    return {
      verdict: 'source-only',
      reason: 'ambiguous-boundary',
      category: scan.category,
    };
  }
  const opaque: OpaqueSpan[] = scan.spans;

  // ── 2. Disqualify unsupported / source-only syntax ──────────────────
  // These run on the text OUTSIDE opaque spans so a front-matter or comment
  // containing them does not wrongly block admission.

  const visible = (from: number, to: number) => {
    // Rebuild a string with opaque spans blanked, so `$`/links inside
    // front matter / comments don't trigger false source-only.
    let out = '';
    let i = from;
    while (i < to) {
      const covering = opaque.find((o) => i >= o.from && i < o.to);
      if (covering) {
        out += ' '.repeat(Math.max(0, covering.to - covering.from));
        i = covering.to;
      } else {
        const next = opaque.find((o) => o.from > i);
        const segEnd = next ? Math.min(next.from, to) : to;
        out += src.slice(i, segEnd);
        i = segEnd;
      }
    }
    return out;
  };
  const body = visible(0, len);

  // Reference-style link definitions: `[label]: url`
  if (/^\s*\[[^\]]+\]:\s*\S+/m.test(body)) {
    return { verdict: 'source-only', reason: 'unknown-construct', category: 'reference-link' };
  }
  // Inline reference-style link usage: `[text][ref]`
  if (/\[[^\]]*\]\s*\[[^\]]*\]/.test(body)) {
    return { verdict: 'source-only', reason: 'unknown-construct', category: 'reference-link' };
  }
  // Footnotes: `[^n]` or `[^label]`
  if (/\[\^[^\]]+\]/.test(body)) {
    return { verdict: 'source-only', reason: 'unknown-construct', category: 'footnote' };
  }
  // Inline HTML (a `<tag>` not part of an opaque span).
  if (/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?>/.test(body)) {
    return { verdict: 'source-only', reason: 'unknown-construct', category: 'inline-html' };
  }
  // Math delimiters: `$$ ... $$` block on its own line, or `$...$` inline.
  if (/^\$\$[\s\S]*?\$\$$/m.test(body) || /(?<!\\)\$(?!\s)\S+?\$(?![\w])/.test(body)) {
    return { verdict: 'source-only', reason: 'unknown-construct', category: 'math' };
  }
  // Unclosed fenced code is already rejected in section 1 by `scanCodeRegions`
  // (which also handles `~~~` fences), so no separate parity check is needed.

  // ── 3. Verdict ──────────────────────────────────────────────────────
  return opaque.length > 0
    ? { verdict: 'eligible-with-opaque', reason: 'opaque-covered' }
    : { verdict: 'eligible', reason: 'supported' };
}
