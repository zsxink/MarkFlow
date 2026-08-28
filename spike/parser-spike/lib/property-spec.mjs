// Shared deterministic SPEC for the P4A task 6.2 property tests (TypeScript
// side — CodeMirror Lezer candidate). This module is the reference spec; the
// Rust harness (spike/parser-spike-rust/src/property.rs) mirrors it constant
// for constant. Drift between the two is machine-detected: both reports print
// SPEC_SHA256 computed over the identical canonical serialization below
// (escape() = backslash, newline, tab; records joined with \n), so the two
// fingerprints must be byte-identical.
//
// All randomness flows through mulberry32 (same PRNG as
// tests/byte-contract/generate-fixtures.mjs) with a FIXED seed list and a
// pure (seed, salt, caseIndex) per-case derivation — no wall-clock, no Math
//.random, fully reproducible.
import { createHash } from 'node:crypto';

/** Same PRNG as the canonical fixture generator and the Rust property spec. */
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEEDS = [42, 1337, 20260829, 7, 99, 12345, 5150, 8080, 314159, 271828];

/** ((Math.imul(seed, 1000003) + salt + caseIndex) | 0) >>> 0 — bitwise
 *  identical to the Rust wrapping_add derivation. */
export function caseSeed(seed, salt, caseIndex) {
  return ((Math.imul(seed, 1000003) + salt + caseIndex) | 0) >>> 0;
}

const pick = (rand, n) => Math.floor(rand() * n);

export const SALT_CONTEXT = 7919;
export const SALT_BOUNDARY = 104729;

/**
 * Known construct instances (kind, exact source, expected marker multiset,
 * embedding form). Sources are taken from the frozen 6.1 expectations.json
 * table (origin records which entry) or hand-built (task checkbox).
 *
 * `markers` mirrors the 6.1 expectations semantics: null = informational (no
 * comparison — e.g. blockquote/list/table where markers interleave with
 * content or the kind has no wrapping delimiters); a list = the candidate's
 * marker slices must equal this multiset when provided.
 *
 * `safe` = SAFE insertion offsets (INCLUSIVE char-offset pairs, source
 * coordinates) for the P4 boundary class: inserting a non-delimiter,
 * non-whitespace char strictly inside these ranges cannot change the
 * construct's parse structure, so the construct MUST survive with its range
 * slicing to the perturbed source text. Hand-verified once and frozen
 * (heading offsets ≥ marker length; fence excludes the opening fence line
 * start and the closing fence; autolink excludes the URI scheme, where a
 * non-ASCII char legitimately kills the link; table excludes the delimiter
 * row). Empty = no safe zone (survived/destroyed classification only).
 */
export const KNOWN_CONSTRUCTS = [
  { kind: 'heading', source: '# Title', markers: ['#'], embed: '# Title', origin: 'expectations:utf8-lf-tail0(heading)', safe: [[3, 7]] },
  { kind: 'heading', source: '# 中文标题', markers: ['#'], embed: '# 中文标题', origin: 'expectations:unicode-cjk', safe: [[2, 5]] },
  { kind: 'paragraph', source: 'Body paragraph with ASCII and CJK 中文。\nAnother line.', markers: null, embed: 'Body paragraph with ASCII and CJK 中文。\nAnother line.', origin: 'expectations:utf8-lf-tail0', safe: [[0, Number.MAX_SAFE_INTEGER]] },
  { kind: 'paragraph', source: '日本語の段落。\n한국어 문단입니다.\n混合 CJK: 中文 English 日本語', markers: null, embed: '日本語の段落。\n한국어 문단입니다.\n混合 CJK: 中文 English 日本語', origin: 'expectations:unicode-cjk', safe: [[0, Number.MAX_SAFE_INTEGER]] },
  { kind: 'paragraph', source: 'Emoji: 😀 🎉\nZWJ family: 👨‍👩‍👧‍👦\nSkin tone: 👍🏽\nFlags: 🇯🇵', markers: null, embed: 'Emoji: 😀 🎉\nZWJ family: 👨‍👩‍👧‍👦\nSkin tone: 👍🏽\nFlags: 🇯🇵', origin: 'expectations:unicode-emoji', safe: [[0, Number.MAX_SAFE_INTEGER]] },
  { kind: 'fence', source: '```js\nconst x = 1;\n\n\nfunction f() {}\n```', markers: ['```', '```'], embed: '```js\nconst x = 1;\n\n\nfunction f() {}\n```', origin: 'expectations:syntax-fence', safe: [[4, 36]] },
  { kind: 'list', source: '- item one', markers: null, embed: '- item one', origin: 'expectations:syntax-lists', safe: [[2, 10]] },
  { kind: 'listItem', source: '- item one', markers: ['-'], embed: '- item one', origin: 'expectations:syntax-lists', safe: [[2, 10]] },
  { kind: 'listItem', source: '1. ordered', markers: ['1.'], embed: '1. ordered', origin: 'expectations:syntax-lists', safe: [[3, 10]] },
  { kind: 'blockquote', source: '> blockquote', markers: null, embed: '> blockquote', origin: 'expectations:syntax-lists(blockquote line; markers informational)', safe: [[2, 12]] },
  { kind: 'table', source: '| a | b |\n| --- | --- |\n| 1 | 2 |', markers: null, embed: '| a | b |\n| --- | --- |\n| 1 | 2 |', origin: 'expectations:syntax-table-reference-footnote', safe: [[2, 3], [6, 7], [26, 27], [30, 31]] },
  { kind: 'linkRefDef', source: '[ref]: https://example.com', markers: null, embed: '[ref]: https://example.com', origin: 'expectations:syntax-table-reference-footnote', safe: [[1, 26]] },
  { kind: 'htmlComment', source: '<!-- html comment -->', markers: null, embed: '<!-- html comment -->', origin: 'expectations:syntax-html', safe: [[4, 18]] },
  { kind: 'image', source: '![alt](image.png)', markers: ['![', ']', '(', ')'], embed: 'text ![alt](image.png) tail', origin: 'expectations:syntax-image-blanklines', safe: [[2, 4], [7, 16]] },
  { kind: 'strong', source: '**bold with *nested em* inside**', markers: ['**', '**'], embed: 'a **bold with *nested em* inside** b', origin: 'expectations:spike-extra-task-inline', safe: [[2, 30]] },
  { kind: 'emphasis', source: '*nested em*', markers: ['*', '*'], embed: 'a *nested em* b', origin: 'expectations:spike-extra-task-inline', safe: [[1, 10]] },
  { kind: 'inlineCode', source: '`inline code`', markers: ['`', '`'], embed: 'a `inline code` b', origin: 'expectations:spike-extra-task-inline', safe: [[1, 12]] },
  { kind: 'strikethrough', source: '~~strike~~', markers: ['~~', '~~'], embed: 'a ~~strike~~ b', origin: 'expectations:spike-extra-task-inline', safe: [[2, 8]] },
  { kind: 'link', source: '<https://example.com>', markers: ['<', '>'], embed: 'a <https://example.com> b', origin: 'expectations:spike-extra-task-inline', safe: [[9, 20]] },
  { kind: 'link', source: '[link with *em*](https://example.com)', markers: ['[', ']', '(', ')'], embed: 'a [link with *em*](https://example.com) b', origin: 'expectations:spike-extra-task-inline', safe: [[1, 15], [17, 36]] },
  { kind: 'escape', source: '\\*', markers: null, embed: 'an escaped \\* star', origin: 'expectations:spike-extra-task-inline', safe: [] },
  // Hand construction (task checkbox): content/markers from the
  // spike-extra-task-inline expectations entries.
  { kind: 'taskCheckbox', source: '[ ] task one', markers: ['[ ]'], embed: '- [ ] task one', origin: 'hand:spike-extra-task-inline', safe: [[4, 11]] },
];

/**
 * Self-contained perturbation lines, always separated from each other and
 * from the embedded construct by a blank line, so a context line can never
 * change the construct's own parse. (Unclosed HTML comments would legitimately
 * swallow following blocks per CommonMark — the pool uses a CLOSED comment;
 * unclosed forms are exercised by the malformed class.)
 */
export const PERTURB_LINES = [
  '中文标点、。！？「」测试',
  '日本語のテキストです。',
  '한국어 문장입니다.',
  'Emoji: 😀 🎉 👨‍👩‍👧‍👦 👍🏽 🇯🇵 ❤️',
  'Combining: é ä नमस्ते',
  '​﻿zero width​',
  '　fullwidth space　',
  '**',
  '`',
  '_',
  'escaped \\* \\` \\\\ \\[ marks',
  '<!-- spike comment -->',
  '[spikeref]: https://example.com/x',
];

/**
 * Prefix-only pool: a TAB-indented line AFTER a list construct would
 * legitimately continue the list item (indented code inside the item — found
 * and fixed during 6.2 development), so it may only appear in the PREFIX (an
 * indented code block before the construct cannot merge into it).
 */
export const PERTURB_PREFIX_EXTRA = ['\ttab led line'];

/**
 * Non-delimiter boundary-insertion chars (P4). Delimiter chars are excluded:
 * inserting them legitimately re-partitions delimiter runs, making
 * "survived with a different extent" indistinguishable from a misplaced range
 * without a full reference model. The stale-position target (byte-vs-UTF-16
 * drift) is fully exercised by the astral/CJK/zero-width/fullwidth chars.
 */
export const BOUNDARY_CHARS = ['中', '😀', '\u0301', '​', '　'];

/**
 * Safe-zone insertion chars: WITHOUT the Unicode whitespace chars
 * (U+200B/U+3000) — inserted directly after an opening delimiter run they
 * legitimately break left-flanking (verified on all three Rust candidates),
 * so they are only used in the unsafe/destroyed-allowed cases. 中 (letter),
 * 😀 (symbol) and U+0301 (combining mark) can never change delimiter
 * decisions.
 */
export const BOUNDARY_SAFE_CHARS = ['中', '😀', '\u0301'];

export const NESTED_DOCS = [
  // 0: quote > list > fence
  '> - item with fence\n>   ```js\n>   const x = 1;\n>   ```\n> - second item\n',
  // 1: strong > emphasis (triple delimiter; CommonMark nests strong INSIDE em)
  'a ***triple*** b\n',
  // 2: link > strong > emphasis
  'x [label **bold *inner* end** tail](url) y\n',
  // 3: three-deep quote chain
  '>>> deep quote\n',
  // 4: inline code inside strong
  '**a `code` b**\n',
  // 5: list > quote > list (loose)
  '- item\n  > quote in item\n  > - nested list\n- tail\n',
  // 6: fence inside quote
  '> ```md\n> # not a heading\n> ```\n',
];

/** Documented parent>child containment pairs per NESTED_DOCS entry. */
export const NESTED_PAIRS = [
  [['blockquote', 'list'], ['list', 'listItem'], ['listItem', 'fence']],
  [['emphasis', 'strong']],
  [['link', 'strong'], ['strong', 'emphasis']],
  [['blockquote', 'blockquote']],
  [['strong', 'inlineCode']],
  [['list', 'blockquote'], ['blockquote', 'list']],
  [['blockquote', 'fence']],
];

export const MALFORMED_DOCS = [
  '```js\ncode without end\n',
  '**never closed\nstill open?\n',
  '[text](http://x\n',
  '<!-- never ends\nmore text\n',
  '| a | b |\n| only one |\n| 1 | 2 |\n',
  '---\ntitle: truncated\n',
  '***\n',
  ']reversed[ and )link(\n',
  'a `code b\n',
  '![alt\n',
  '> \n',
  '- item\n  > ```\n  unclosed fence in quote\n',
  'a | b |\n| --- |\nmissing header row\n',
];

/** Defensive EOL inputs (bare unpaired \r / CRLF). The logical text of the
 *  real pipeline is LF (Core LineEndingMap owns EOL restoration — design/04);
 *  these cases only assert no panic and in-bounds ranges. */
export const EOL_DOCS = [
  'a\rb\r\n#c\rTitle\r\nbody\rlast',
  '# t\r\rTitle\n===\r\n\rbody',
  'line1\r\nline2\rline3\n\r\n-tail\r',
];

/** P6 heavy docs: built in-process (deterministic), same sizes as the Rust
 *  harness. budgetMs = the bounded-time assertion per case. The mixed-container
 *  10k case runs LAST — it is the one case that can exceed its budget, and its
 *  leaked parse would otherwise compete for CPU and skew the rest. */
export function heavyCases() {
  return [
    { name: 'quote-nest-10k', doc: '>'.repeat(10000) + ' leaf', budgetMs: 5000 },
    { name: 'list-indent-nest-1k', doc: Array.from({ length: 1000 }, (_, i) => ' '.repeat(2 * i) + '- x').join('\n'), budgetMs: 5000 },
    { name: 'single-word-5mb', doc: 'a'.repeat(5_000_000), budgetMs: 5000 },
    { name: 'no-newline-para-5mb', doc: '中文 word '.repeat(420_000), budgetMs: 5000 },
    { name: 'stars-1e5', doc: '*'.repeat(100_000), budgetMs: 5000 },
    { name: 'backticks-1e5', doc: '`'.repeat(100_000), budgetMs: 5000 },
    { name: 'hashes-1e5', doc: '#'.repeat(100_000), budgetMs: 5000 },
    { name: 'mixed-container-nest-10k', doc: '> - '.repeat(10000) + 'leaf', budgetMs: 5000 },
  ];
}

/** Frontmatter doc (PF): canonical frontmatter source from the frozen 6.1
 *  expectations table + known body heading. */
export const FRONTMATTER_SOURCE = '---\n# comment line\ntitle: "A title"\ntags: [a, b, c]\norder: 3\n---';
export const FRONTMATTER_DOC_TAIL = '\n# Body after frontmatter\n\n正文段落 with 中文。\n';
/** FROZEN exemption list — 6.1 REPORT §3.1: candidates without a frontmatter
 *  node (Lezer, pulldown-cmark) misparse the frontmatter body as setext
 *  heading (kind heading), the opening `---` as HR, and `[a, b, c]` as Link.
 *  NOTHING else is exempt; a new kind, or any exempt-kind construct OUTSIDE
 *  the frontmatter span, is a new finding. */
export const FRONTMATTER_EXEMPT_KINDS = ['heading', 'hr', 'link'];

// ── canonical serialization + fingerprint (must match property.rs) ─────────

function escape(s) {
  return s.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('\t', '\\t');
}

function safeRanges(safe) {
  // "lo..hi" pairs joined by ","; Number.MAX_SAFE_INTEGER renders as MAX so
  // the JS and Rust serializations are byte-identical.
  return '[' + safe.map(([lo, hi]) => `${lo}..${hi === Number.MAX_SAFE_INTEGER ? 'MAX' : hi}`).join(',') + ']';
}

function markersField(markers) {
  return markers === null ? 'null' : markers.map(escape).join(',');
}

function canonicalSpec() {
  const records = [];
  records.push(`seeds|${SEEDS.join(',')}`);
  for (const c of KNOWN_CONSTRUCTS) {
    records.push(`c|${c.kind}|${escape(c.source)}|${markersField(c.markers)}|${escape(c.embed)}|${escape(c.origin)}|${safeRanges(c.safe)}`);
  }
  for (const p of PERTURB_LINES) records.push(`p|${escape(p)}`);
  for (const p of PERTURB_PREFIX_EXTRA) records.push(`q|${escape(p)}`);
  for (const b of BOUNDARY_CHARS) records.push(`b|${escape(b)}`);
  for (const b of BOUNDARY_SAFE_CHARS) records.push(`s|${escape(b)}`);
  for (const d of NESTED_DOCS) records.push(`n|${escape(d)}`);
  for (const d of MALFORMED_DOCS) records.push(`m|${escape(d)}`);
  for (const d of EOL_DOCS) records.push(`e|${escape(d)}`);
  return records.join('\n') + '\n';
}

/** sha256 of the canonical SPEC serialization — must equal the Rust value. */
export function specFingerprint() {
  return 'sha256:' + createHash('sha256').update(canonicalSpec(), 'utf8').digest('hex');
}

// ── case generators (draw order identical to property.rs) ──────────────────

/** Random context: prefix lines from PERTURB_LINES+PERTURB_PREFIX_EXTRA,
 *  suffix lines from PERTURB_LINES only (see the tab note above). */
export function randomContext(rand) {
  const prefixPoolLen = PERTURB_LINES.length + PERTURB_PREFIX_EXTRA.length;
  const nPre = 1 + pick(rand, 3);
  const nSuf = 1 + pick(rand, 3);
  const pre = [];
  const suf = [];
  for (let i = 0; i < nPre; i++) {
    const idx = pick(rand, prefixPoolLen);
    pre.push(idx < PERTURB_LINES.length ? PERTURB_LINES[idx] : PERTURB_PREFIX_EXTRA[idx - PERTURB_LINES.length]);
  }
  for (let i = 0; i < nSuf; i++) suf.push(PERTURB_LINES[pick(rand, PERTURB_LINES.length)]);
  return [pre.join('\n\n'), suf.join('\n\n')];
}

/** UTF-16 length of a string. */
export function u16len(s) {
  let n = 0;
  for (const ch of s) n += ch.length === 1 ? 1 : 2;
  return n;
}

/** doc = pre + "\n\n" + embed + "\n\n" + suffix, plus the UTF-16 offset where
 *  embed starts inside doc. */
export function embedConstruct(embed, pre, suffix) {
  const doc = `${pre}\n\n${embed}\n\n${suffix}`;
  return [doc, u16len(pre) + 2];
}

/** doc with the construct occurrence inside embed replaced by occurrenceText;
 *  returns the doc and the UTF-16 region of the occurrence. */
export function docWithOccurrence(embed, source, occurrenceText, pre, suffix) {
  const bytePos = embed.indexOf(source);
  if (bytePos < 0) throw new Error('occurrence must be in embed');
  const occStartEmbed = u16len(embed.slice(0, bytePos));
  const doc = `${pre}\n\n${embed}\n\n${suffix}`.replace(source, occurrenceText);
  const start = u16len(pre) + 2 + occStartEmbed;
  return [doc, [start, start + u16len(occurrenceText)]];
}

/** Insert `ch` before char offset `o` of `chars` (o == chars.length appends). */
export function insertChar(chars, o, ch) {
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    if (i === o) out += ch;
    out += chars[i];
  }
  if (o >= chars.length) out += ch;
  return out;
}
