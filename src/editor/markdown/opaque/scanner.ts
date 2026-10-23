// ── Stage-two opaque range scanner (task 7.1 / design Decision 4) ────────
//
// A precise, deterministic scanner that locates the initial opaque allowlist
// (YAML front matter at byte 0, complete block HTML, complete HTML comments)
// as exact [from, to) ranges in the source string passed in. Offsets are exact
// against that string and CRLF-safe: the caller may pass the original source
// and later slice `raw` directly out of it, or a normalized copy (as the
// eligibility classifier does).
//
// Any unclosed opener, crossing/overlapping region or ambiguous boundary
// returns a failure result instead of a best-effort span list, so admission
// can classify the document `source-only`.
//
// Fenced code regions are masked BEFORE opaque scanning: `<!-- -->`,
// `<div>…</div>` or `---`-looking text inside a code fence is fenced-code
// content, not opaque HTML, and must never be tokenized as a placeholder.
// Indented code is left unmasked — spurious HTML there still trips the
// classifier's conservative inline-HTML rule, which is safe.

import type { OpaqueCategory } from '../types';

/** A completed opaque span: [from, to) in the scanned source. */
export interface OpaqueSpan {
  category: OpaqueCategory;
  from: number;
  to: number;
}

/** A closed fenced-code region: [from, to) in the scanned source. */
export interface CodeRegion {
  from: number;
  to: number;
}

export type OpaqueScanResult =
  | { ok: true; spans: OpaqueSpan[] }
  | {
      ok: false;
      code: 'unclosed-boundary' | 'overlapping-region';
      category?: OpaqueCategory;
      range?: { from: number; to: number };
    };

/** The set of block-level tags whose openers may open an opaque HTML block. */
const BLOCK_LEVEL_TAG =
  /^<(?:address|article|aside|blockquote|details|dialog|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|main|menu|nav|ol|p|pre|section|table|ul)(?:\s|>|\/)/i;

/** HTML void elements are complete on their own line; they open no block. */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

interface LineRef {
  /** Line content without the trailing newline (and without `\r`). */
  text: string;
  /** Absolute start offset of the line. */
  from: number;
  /** Absolute end offset of the line, including its trailing newline. */
  to: number;
}

/** Split `src` into lines with absolute offsets (CRLF-safe). */
function lineRefs(src: string): LineRef[] {
  const lines: LineRef[] = [];
  let start = 0;
  for (;;) {
    const nl = src.indexOf('\n', start);
    const end = nl === -1 ? src.length : nl;
    lines.push({ text: src.slice(start, end).replace(/\r$/, ''), from: start, to: end + (nl === -1 ? 0 : 1) });
    if (nl === -1) break;
    start = nl + 1;
  }
  return lines;
}

/** Whether the very first line of `src` is a `---` front-matter opener. */
function hasFrontMatterOpener(src: string): boolean {
  const nl = src.indexOf('\n');
  if (nl === -1) return false; // a bare `---` with no newline is a horizontal rule
  return /^---[\t ]*$/.test(src.slice(0, nl).replace(/\r$/, ''));
}

/**
 * End offset (exclusive) of a front-matter block that starts at byte 0, or
 * `false` when the opener is present but no closing `---` line exists.
 */
function findFrontMatterEnd(src: string): number | false {
  const lines = lineRefs(src);
  if (lines.length < 2) return false; // no body line after the opener
  if (!hasFrontMatterOpener(src)) return false;
  for (let i = 1; i < lines.length; i += 1) {
    if (/^\s*---\s*$/.test(lines[i].text)) return lines[i].to;
  }
  return false;
}

/** Fenced-code regions + unclosed-fence signal (backtick and tilde fences). */
export function scanCodeRegions(src: string): { regions: CodeRegion[]; unclosed: boolean } {
  const regions: CodeRegion[] = [];
  const lines = lineRefs(src);
  let unclosed = false;
  let i = 0;
  while (i < lines.length) {
    const m = /^(`{3,}|~{3,})(?=[^`~]|$)/.exec(lines[i].text);
    if (!m) {
      i += 1;
      continue;
    }
    const fence = m[1];
    const ch = fence[0];
    const minLen = fence.length;
    const closeRe = new RegExp(`^${ch}{${minLen},}\\s*$`);
    let j = i + 1;
    let closed = false;
    for (; j < lines.length; j += 1) {
      if (closeRe.test(lines[j].text)) {
        closed = true;
        break;
      }
    }
    if (closed) {
      regions.push({ from: lines[i].from, to: lines[j].to });
      i = j + 1;
    } else {
      regions.push({ from: lines[i].from, to: src.length });
      unclosed = true;
      break;
    }
  }
  return { regions, unclosed };
}

/** Complement intervals of the source left after removing `excluded`. */
function contractSegments(len: number, excluded: CodeRegion[]): CodeRegion[] {
  const sorted = [...excluded].sort((a, b) => a.from - b.from || a.to - b.to);
  const segments: CodeRegion[] = [];
  let cursor = 0;
  for (const ex of sorted) {
    if (ex.to <= cursor) continue;
    if (ex.from > cursor) segments.push({ from: cursor, to: ex.from });
    cursor = Math.max(cursor, ex.to);
  }
  if (cursor < len) segments.push({ from: cursor, to: len });
  return segments;
}

/** Scan a single segment for complete HTML comment spans. */
function scanCommentsIn(src: string, from: number, to: number, out: OpaqueSpan[]): { unclosed: { at: number } | null } {
  let i = from;
  while (i < to) {
    const open = src.indexOf('<!--', i);
    if (open === -1 || open >= to) return { unclosed: null };
    const close = src.indexOf('-->', open + 4);
    if (close === -1 || close >= to) return { unclosed: { at: open } };
    out.push({ category: 'html-comment', from: open, to: close + 3 });
    i = close + 3;
  }
  return { unclosed: null };
}

/**
 * Scan a segment for complete block-HTML spans. A block opener (`<div>`,
 * `<table>`, …) at a line boundary is opaque when its matching close tag
 * appears at a later line boundary; a lone opener with no close in the same
 * segment is an unclosed/ambiguous boundary.
 *
 * A line that is already a complete HTML element on its own — a same-line
 * open/close pair, or a void element like `<hr>`/`<br>`/`<img>` — is
 * self-contained and causes no opaque span (it does not hold unknown children
 * that need a placeholder).
 */
function scanBlocksIn(
  src: string,
  from: number,
  to: number,
  out: OpaqueSpan[],
): { unclosed: { at: number } | null } {
  const lines = lineRefs(src.slice(from, to)).map((l) => ({
    text: l.text,
    from: l.from + from,
    to: l.to + from,
  }));
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const opener = line.text.match(/^<\s*([a-zA-Z][a-zA-Z0-9-]*)/);
    if (!opener || !BLOCK_LEVEL_TAG.test(line.text)) continue;
    const tagName = opener[1].toLowerCase();
    const closeRe = new RegExp(`^\\s*<\\s*/\\s*${tagName}\\s*>\\s*$`);
    // A same-line open/close pair, a self-closing `/>`, or a void element
    // (`<hr>`, `<img>`, …) is complete on one line and opens no opaque block.
    const sameLineClose = new RegExp(`</\\s*${tagName}\\s*>\\s*$`, 'i');
    if (
      VOID_TAGS.has(tagName.toLowerCase()) ||
      /\/\s*>$/.test(line.text) ||
      sameLineClose.test(line.text)
    ) {
      continue;
    }
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      if (closeRe.test(lines[j].text)) break;
    }
    if (j === lines.length) return { unclosed: { at: lines[i].from } };
    out.push({ category: 'html-block', from: lines[i].from, to: lines[j].to });
    i = j;
  }
  return { unclosed: null };
}

/**
 * Drop spans fully contained in an outer span (a comment inside a `<div>`
 * block is part of that block) and flag a genuinely crossing pair, which is an
 * ambiguous boundary.
 */
function normalizeSpans(spans: OpaqueSpan[]): { spans: OpaqueSpan[]; crossing: boolean } {
  const sorted = [...spans].sort((a, b) => a.from - b.from || a.to - b.to);
  const kept: OpaqueSpan[] = [];
  for (const s of sorted) {
    const prev = kept[kept.length - 1];
    if (!prev) {
      kept.push(s);
      continue;
    }
    if (s.from < prev.to) {
      if (s.to <= prev.to) continue; // fully contained → subsumed by the outer span
      return { spans: kept, crossing: true }; // partial overlap → ambiguous
    }
    kept.push(s);
  }
  return { spans: kept, crossing: false };
}

/**
 * Scan the source for opaque allowlist spans. `codeRegions` (from
 * `scanCodeRegions`) mask fenced-code content so its characters never register
 * as HTML/front-matter. Returns a failure for unclosed or crossing regions.
 */
export function scanOpaqueSpans(
  source: string,
  options: { codeRegions?: CodeRegion[] } = {},
): OpaqueScanResult {
  const len = source.length;
  const excluded: CodeRegion[] = [...(options.codeRegions ?? [])];
  const spans: OpaqueSpan[] = [];

  // ── 1. YAML front matter must start at byte 0 ─────────────────────────
  if (hasFrontMatterOpener(source)) {
    const fmEnd = findFrontMatterEnd(source);
    if (fmEnd === false) {
      return {
        ok: false,
        code: 'unclosed-boundary',
        category: 'frontmatter',
        range: { from: 0, to: len },
      };
    }
    spans.push({ category: 'frontmatter', from: 0, to: fmEnd });
    excluded.push({ from: 0, to: fmEnd });
  }

  // ── 2. HTML comments and block HTML outside code and front matter ─────
  const segments = contractSegments(len, excluded);
  for (const seg of segments) {
    const comments = scanCommentsIn(source, seg.from, seg.to, spans);
    if (comments.unclosed) {
      return {
        ok: false,
        code: 'unclosed-boundary',
        category: 'html-comment',
        range: { from: comments.unclosed.at, to: Math.min(seg.to, comments.unclosed.at + 4) },
      };
    }
    const blocks = scanBlocksIn(source, seg.from, seg.to, spans);
    if (blocks.unclosed) {
      return {
        ok: false,
        code: 'unclosed-boundary',
        category: 'html-block',
        range: { from: blocks.unclosed.at, to: Math.min(seg.to, blocks.unclosed.at + 64) },
      };
    }
  }

  // ── 3. Reject crossing spans (ambiguous) once, then return ────────────
  const normalized = normalizeSpans(spans);
  if (normalized.crossing) {
    return { ok: false, code: 'overlapping-region', category: 'html-block' };
  }
  return { ok: true, spans: normalized.spans };
}
