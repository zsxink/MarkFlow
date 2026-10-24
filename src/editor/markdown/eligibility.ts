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
// Reference-style link DEFINITIONS, footnotes and inline HTML are
// `source-only` because their meaning can cross span boundaries; adjacent
// brackets without any definition (e.g. `[S1][S2]` traceability markers) are
// literal text per CommonMark and eligible. Math delimiters (`$..$` / `$$..$$`)
// are now supported: they pass through the markdown pipeline as plain text and
// are rendered by the KaTeX plugin (`editor.katex.ts`), so they are `eligible`.
// Generic fenced code blocks are supported (not opaque).

import { DEFAULT_SETTINGS } from '../../types/settings';
import type { Settings } from '../../types/settings';
import type { EligibilityResult } from './types';
import {
  scanCodeRegions,
  scanOpaqueSpans,
  type CodeRegion,
  type OpaqueSpan,
} from './opaque/index';

export type { OpaqueSpan } from './opaque/index';

/** User-configurable admission bounds (bytes/lines), injected by callers. */
export interface AdmissionLimits {
  maxBytes: number;
  maxLines: number;
}

// Admission stays deterministic (never wall-clock) but the bound must cover
// ordinary real-world documents: the stage-one 54KiB measurement rejected a
// plain 74KB PRD outright. 256KiB / 10k lines matches the runtime guards
// instead — per-document safety comes from the admission round-trip
// verification, and oversized-but-admitted docs are capped by the complexity
// limit extension. The numbers live in DEFAULT_SETTINGS so every link reads
// one source; this module stays pure (no store/infra imports).
export const DEFAULT_ADMISSION_LIMITS: AdmissionLimits = {
  maxBytes: DEFAULT_SETTINGS.wysiwygAdmissionBytes,
  maxLines: DEFAULT_SETTINGS.wysiwygAdmissionLines,
};

/** Kept for existing test imports; value is unchanged (derived from settings). */
export const WYSIWYG_MAX_ADMISSION_BYTES = DEFAULT_ADMISSION_LIMITS.maxBytes;
export const WYSIWYG_MAX_ADMISSION_LINES = DEFAULT_ADMISSION_LIMITS.maxLines;

/** Settings subset consumed by `admissionLimitsFromSettings`. */
export type AdmissionSettings = Pick<Settings, 'wysiwygAdmissionBytes' | 'wysiwygAdmissionLines'>;

/** Narrow mapping so callers pass settings, not hand-built limits. */
export function admissionLimitsFromSettings(settings: AdmissionSettings): AdmissionLimits {
  return {
    maxBytes: settings.wysiwygAdmissionBytes ?? DEFAULT_ADMISSION_LIMITS.maxBytes,
    maxLines: settings.wysiwygAdmissionLines ?? DEFAULT_ADMISSION_LIMITS.maxLines,
  };
}

type ProtectedRange = Pick<CodeRegion, 'from' | 'to'>;

/** Return the source segments not covered by any protected range. */
function unprotectedSegments(len: number, ranges: ProtectedRange[]): ProtectedRange[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to);
  const segments: ProtectedRange[] = [];
  let cursor = 0;
  for (const range of sorted) {
    if (range.to <= cursor) continue;
    if (range.from > cursor) segments.push({ from: cursor, to: range.from });
    cursor = Math.max(cursor, range.to);
  }
  if (cursor < len) segments.push({ from: cursor, to: len });
  return segments;
}

/**
 * Find complete CommonMark-style backtick code spans outside block-level
 * protected ranges. A closing run must contain exactly as many backticks as
 * its opener; unmatched runs remain visible prose.
 */
function scanInlineCodeRegions(source: string, excluded: ProtectedRange[]): ProtectedRange[] {
  const spans: ProtectedRange[] = [];
  for (const segment of unprotectedSegments(source.length, excluded)) {
    let i = segment.from;
    while (i < segment.to) {
      if (source[i] !== '`') {
        i += 1;
        continue;
      }

      let openerEnd = i + 1;
      while (openerEnd < segment.to && source[openerEnd] === '`') openerEnd += 1;
      const openerLength = openerEnd - i;
      let cursor = openerEnd;
      let closeEnd = -1;

      while (cursor < segment.to) {
        const next = source.indexOf('`', cursor);
        if (next === -1 || next >= segment.to) break;
        let runEnd = next + 1;
        while (runEnd < segment.to && source[runEnd] === '`') runEnd += 1;
        if (runEnd - next === openerLength) {
          closeEnd = runEnd;
          break;
        }
        cursor = runEnd;
      }

      if (closeEnd !== -1) {
        spans.push({ from: i, to: closeEnd });
        i = closeEnd;
      } else {
        i = openerEnd;
      }
    }
  }
  return spans;
}

/** Blank protected bytes while retaining newlines and therefore line offsets. */
function maskRanges(source: string, ranges: ProtectedRange[]): string {
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to);
  let out = '';
  let cursor = 0;
  for (const range of sorted) {
    if (range.to <= cursor) continue;
    const from = Math.max(cursor, range.from);
    if (from > cursor) out += source.slice(cursor, from);
    const to = Math.max(from, range.to);
    out += source.slice(from, to).replace(/[^\n]/g, ' ');
    cursor = to;
  }
  out += source.slice(cursor);
  return out;
}

/** Split a GFM table row without treating escaped/code-span pipes as cells. */
function splitTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;

  const hasLeadingPipe = trimmed.startsWith('|');
  const hasTrailingPipe = trimmed.endsWith('|') && !trimmed.endsWith('\\|');
  const from = hasLeadingPipe ? 1 : 0;
  const to = hasTrailingPipe ? trimmed.length - 1 : trimmed.length;
  const cells: string[] = [];
  let cellStart = from;
  let codeTicks = 0;
  let i = from;

  while (i < to) {
    if (trimmed[i] === '\\') {
      i = Math.min(to, i + 2);
      continue;
    }
    if (trimmed[i] === '`') {
      let runEnd = i + 1;
      while (runEnd < to && trimmed[runEnd] === '`') runEnd += 1;
      const runLength = runEnd - i;
      if (codeTicks === 0) codeTicks = runLength;
      else if (codeTicks === runLength) codeTicks = 0;
      i = runEnd;
      continue;
    }
    if (trimmed[i] === '|' && codeTicks === 0) {
      cells.push(trimmed.slice(cellStart, i).trim());
      cellStart = i + 1;
    }
    i += 1;
  }
  cells.push(trimmed.slice(cellStart, to).trim());
  return cells;
}

/** Whether a prose-only source contains a GFM table that can drop cells. */
function hasInconsistentGfmTable(source: string): boolean {
  const lines = source.split('\n');
  for (let i = 1; i < lines.length; i += 1) {
    const delimiter = splitTableRow(lines[i]);
    if (!delimiter || delimiter.length === 0
      || !delimiter.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;

    const header = splitTableRow(lines[i - 1]);
    if (!header || header.length !== delimiter.length) return true;

    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].trim().length === 0) break;
      const row = splitTableRow(lines[j]);
      if (!row) break;
      if (row.length !== delimiter.length) return true;
    }
  }
  return false;
}

/**
 * A link-reference definition shape at any block position: optional container
 * prefixes (blockquote markers, bullet/ordered list markers, indentation), a
 * `[label]` whose brackets may be escaped, a colon, then a destination on the
 * same or the next line. Non-global on purpose: `test()` stays stateless.
 *
 * Each prefix alternative absorbs ALL whitespace that may follow its marker
 * (`>[ \t]*`) instead of sharing it with a trailing `[ \t]*` — two quantifiers
 * with overlapping consumption per marker give 2^n backtracking on deep
 * blockquote chains (a 30-level paste froze the UI for a minute). One slack
 * quantifier per marker keeps matching linear.
 */
const REFERENCE_DEFINITION = /^[ \t]*(?:(?:>[ \t]*|[-*+][ \t]+|\d{1,9}[.)][ \t]+))*\[(?:\\.|[^\]\\])+\]:[ \t]*(?:\n[ \t]*)?\S+/m;

/**
 * Deterministic eligibility classification. Returns `source-only` for any
 * unknown/unclosed/ambiguous construct or any construct that would cross an
 * opaque boundary; otherwise `eligible` or `eligible-with-opaque`.
 */
export function classifyEligibility(
  source: string,
  limits: AdmissionLimits = DEFAULT_ADMISSION_LIMITS,
): EligibilityResult {
  const src = source.replace(/\r\n/g, '\n');
  const bytes = new TextEncoder().encode(src).byteLength;
  const lines = src.split('\n').length;
  if (bytes >= limits.maxBytes || lines > limits.maxLines) {
    return {
      verdict: 'source-only',
      reason: 'too-large',
      category: 'admission-threshold',
      size: { bytes, lines },
    };
  }
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
  // These run only on prose. Opaque payloads, fenced code and complete inline
  // code spans may legitimately contain HTML/math/reference-looking literals.
  const blockProtected: ProtectedRange[] = [...opaque, ...codeRegions.regions];
  const inlineCode = scanInlineCodeRegions(src, blockProtected);
  const body = maskRanges(src, [...blockProtected, ...inlineCode]);

  // Marked may silently discard extra cells on its first parse. Detect the
  // source-level ambiguity before semantic round-trip verification so an edit
  // cannot save a candidate that has already lost authored table content.
  if (hasInconsistentGfmTable(body)) {
    return { verdict: 'source-only', reason: 'malformed-table', category: 'malformed-table' };
  }

  // Reference-style link definitions: `[label]: url` — including forms nested
  // in containers (`> [ref]: /url`, `- [ref]: /url`, `1. [ref]: /url`, nested
  // lists) and labels with escaped brackets (`[foo\]]: /url`). A definition
  // makes link meaning document-wide (full/collapsed/shortcut forms resolve
  // against it), and Marked drops the definition line itself on parse — a loss
  // the round-trip fingerprints cannot detect because the first parse already
  // dropped it. The match is deliberately conservative: ordered-list forms that
  // Marked 17 happens to keep as literal text are rejected too, because that
  // quirk is version-fragile and a missed definition silently deletes a line on
  // save, while an over-reject only keeps the doc in Source. Adjacent brackets
  // like `[S1][S2]` WITHOUT any definition are literal text per CommonMark:
  // admit them and let the admission round-trip verification prove losslessness
  // instead of rejecting here (issue #395).
  if (REFERENCE_DEFINITION.test(body)) {
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
  // Math delimiters (`$..$` / `$$..$$`) are now supported via the KaTeX plugin
  // (editor.katex.ts). Formulas pass through Marked as plain text and are
  // rendered as decorations in WYSIWYG mode. No rejection needed.
  // Unclosed fenced code is already rejected in section 1 by `scanCodeRegions`
  // (which also handles `~~~` fences), so no separate parity check is needed.

  // ── 3. Verdict ──────────────────────────────────────────────────────
  return opaque.length > 0
    ? { verdict: 'eligible-with-opaque', reason: 'opaque-covered' }
    : { verdict: 'eligible', reason: 'supported' };
}
