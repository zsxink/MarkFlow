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

import type { OpaqueCategory, OpaqueEntry } from './editor.markdown.types';

export type { OpaqueCategory, OpaqueEntry } from './editor.markdown.types';

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

// ── Opaque registry + sentinel generation (task 7.2 / design Decision 5) ──
//
// Each WYSIWYG session owns a registry keyed by a cryptographically random,
// session-local nonce. A sentinel is the only string that may stand in for an
// opaque raw span inside the editor document; it carries ONLY the slot id
// (never the raw payload). Because the nonce is random and the full sentinel
// namespace is verified absent from user source, a user's own text can never
// be mistaken for (nor forge) a placeholder.
//
//   sentinel  ::=  "⟦MF-OPAQUE:" nonce "." index "⟧"
//   slot      :=  nonce "." index         (unique within the session)
//
// `digest` is a bounded sha-256 prefix used for one-to-one restore validation.

/** Characters that delimit an opaque sentinel (never expected in prose). */
export const OPAQUE_SENTINEL_PREFIX = '⟦MF-OPAQUE:'; // ⟦MF-OPAQUE:
export const OPAQUE_SENTINEL_SUFFIX = '⟧'; // ⟧

const DEFAULT_NONCE_BYTES = 8; // 64 bits of entropy per session
const DIGEST_PREFIX_LEN = 16;  // 64 bits, enough to catch corruption/copy

/**
 * Compute a bounded, synchronous digest of `raw` (hex). We avoid Web Crypto's
 * async `subtle.digest` so registration stays in the synchronous bridge path
 * and works identically in the Tauri renderer and the test environment. Two
 * independent 32-bit FNV-1a passes give 64 bits of discrimination against
 * copy/misplacement — far more than needed to catch a swapped or corrupted
 * opaque slot.
 */
export function opaqueDigest(raw: string): string {
  const len = raw.length;
  // Pass 1 (standard FNV-1a over UTF-16 code units) and pass 2 (a second salt
  // applied to the reversed byte stream) so equal-length swaps change both.
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < len; i += 1) {
    const c = raw.charCodeAt(i);
    h1 ^= c & 0xff;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    const c2 = raw.charCodeAt(len - 1 - i);
    h2 ^= (c2 & 0xff) ^ (i * 31);
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`.slice(0, DIGEST_PREFIX_LEN);
}

/** Build the sentinel string for a slot. */
export function sentinelFor(slot: string): string {
  return `${OPAQUE_SENTINEL_PREFIX}${slot}${OPAQUE_SENTINEL_SUFFIX}`;
}

/** Whether `text` contains any opaque sentinel (used for no-sentinel checks). */
export function containsSentinel(text: string): boolean {
  return text.includes(OPAQUE_SENTINEL_PREFIX);
}

/** Extract the slot from a sentinel, or `null` for a malformed/foreign one. */
export function parseSentinel(text: string): string | null {
  const start = text.indexOf(OPAQUE_SENTINEL_PREFIX);
  if (start === -1) return null;
  const from = start + OPAQUE_SENTINEL_PREFIX.length;
  const end = text.indexOf(OPAQUE_SENTINEL_SUFFIX, from);
  if (end === -1) return null;
  const slot = text.slice(from, end);
  // A slot must be `nonce.index` — two dot-separated bare tokens. Anything else
  // (a forged/foreign sentinel) does not resolve.
  if (!/^[0-9a-zA-Z]+\.[0-9]+$/.test(slot)) return null;
  return slot;
}

/** A random source returning a 32-bit unsigned integer (injectable for tests). */
export type RandomSource = () => number;

function defaultRandomBytes(len: number): string {
  const arr = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr);
  } else {
    // Non-crypto fallback; callers inject a source in tests.
    for (let i = 0; i < len; i += 1) arr[i] = Math.floor(Math.random() * 256);
  }
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Draw `byteLen * 2` hex characters from `random` (full 32 bits per call). */
function randomToken(byteLen: number, random: RandomSource): string {
  let out = '';
  const needed = byteLen * 2;
  while (out.length < needed) {
    out += (random() >>> 0).toString(16).padStart(8, '0');
  }
  return out.slice(0, needed);
}

export interface OpaqueRegistryOptions {
  /** 32-bit random source used for nonce + slots (defaults to crypto-backed). */
  randomSource?: RandomSource;
  /** Pre-supplied session nonce (tests / lifecycle replay). */
  nonce?: string;
  /** Token used to regenerate a nonce before inserting (omitted by default). */
  avoidNamespaceIn?: string;
  /** Analog of source to check for an existing sentinel namespace. */
  source?: string;
}

export type RegisterOpaqueResult =
  | { ok: true; entry: OpaqueEntry; sentinel: string }
  | { ok: false; code: 'namespace-collision'; message: string };

/**
 * A per-session opaque registry. Holds raw payloads ONLY in memory keyed by a
 * cryptographically random, session-local nonce; serialization emits sentinels
 * (slot-only), never raw text, and restore resolves them back one-to-one.
 */
export class OpaqueRegistry {
  readonly nonce: string;
  private entries = new Map<string, OpaqueEntry>();
  private sequence = 0;
  private random: RandomSource;

  constructor(private userSource: string, opts: OpaqueRegistryOptions = {}) {
    this.random = opts.randomSource ?? (() => {
      const raw = defaultRandomBytes(4);
      return Number.parseInt(raw, 16) >>> 0;
    });
    const nonceSource = opts.nonce ?? randomToken(DEFAULT_NONCE_BYTES, this.random);
    // The sentinel namespace must never already appear in user source: a user
    // who literally typed a sentinel must not be able to forge a placeholder
    // (design Decision 5: "rejected if the exact sentinel namespace already
    // appears in user source").
    const candidate = (n: string) => `${OPAQUE_SENTINEL_PREFIX}${n}.`;
    let nonce = nonceSource;
    let guard = 0;
    while ((this.userSource.includes(candidate(nonce))) && guard++ < 16) {
      nonce = randomToken(DEFAULT_NONCE_BYTES, this.random);
    }
    this.nonce = nonce;
  }

  /** Number of registered entries. */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Register an opaque raw span and return a unique per-session slot + the
   * sentinel that stands in for it. The caller chooses the slot sequence; a
   * duplicate raw at a different position still gets its own slot (no
   * deduplication), which is what keeps identical fragments un-mixed (spec).
   */
  register(
    category: OpaqueCategory,
    raw: string,
    originalRange: { from: number; to: number },
  ): RegisterOpaqueResult {
    // Guard against a foreign sentinel already present in the raw payload: an
    // opaque entry must never itself embed a sentinel (it would be ambiguous).
    if (containsSentinel(raw)) {
      return { ok: false, code: 'namespace-collision', message: 'Opaque payload embeds a sentinel' };
    }
    const index = this.sequence;
    this.sequence += 1;
    const slot = `${this.nonce}.${index}`;
    const entry: OpaqueEntry = {
      slot,
      category,
      raw,
      originalRange: { from: originalRange.from, to: originalRange.to },
      digest: opaqueDigest(raw),
    };
    this.entries.set(slot, entry);
    return { ok: true, entry, sentinel: sentinelFor(slot) };
  }

  /** Look up an entry by slot, or `undefined` for an unknown/foreign slot. */
  get(slot: string): OpaqueEntry | undefined {
    return this.entries.get(slot);
  }

  /** All registered entries, in insertion order. */
  all(): OpaqueEntry[] {
    return [...this.entries.values()];
  }

  /** The sentinel for a known entry (or `null` if it is not registered). */
  sentinel(slot: string): string | null {
    return this.entries.has(slot) ? sentinelFor(slot) : null;
  }

  /**
   * Drop all entries and roll the session nonce (session teardown / pipeline
   * degrade, task 7.6). Rolling the nonce guarantees a sentinel emitted before
   * a `clear()` can never collide with a slot registered after it, even if the
   * same registry object is reused (an old atom node cannot be re-resolved).
   */
  clear(): void {
    this.entries.clear();
    this.sequence = 0;
    this.rollNonce();
  }

  private rollNonce(): void {
    let nonce = randomToken(DEFAULT_NONCE_BYTES, this.random);
    let guard = 0;
    while (this.userSource.includes(`${OPAQUE_SENTINEL_PREFIX}${nonce}.`) && guard++ < 16) {
      nonce = randomToken(DEFAULT_NONCE_BYTES, this.random);
    }
    (this as { nonce: string }).nonce = nonce;
  }
}