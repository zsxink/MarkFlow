#!/usr/bin/env node
/**
 * Generate canonical byte-contract fixtures deterministically.
 *
 * Every fixture is synthetic: fixed content, fixed byte encodings, no
 * timestamps, no randomness. Output:
 *   tests/fixtures/byte-contract/fixtures/<id>.md
 *   tests/fixtures/byte-contract/manifest.json
 *   tests/fixtures/byte-contract/l1-intents.json
 *   tests/fixtures/byte-contract/README.md
 *
 * Usage:
 *   node tests/byte-contract/generate-fixtures.mjs          # all fixtures
 *   node tests/byte-contract/generate-fixtures.mjs --verify  # re-verify existing
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = path.join(root, 'fixtures', 'byte-contract');
const filesDir = path.join(fixtureDir, 'fixtures');

const LF = '\n';
const CRLF = '\r\n';
const CR = '\r';
const BOM = '﻿';

// ── Deterministic helper: seeded PRNG for the large-file generator ──
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** sha256 of a Buffer/string as lowercase hex. */
function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Render a fixture from logical lines.
 * @param {{bom?: 'utf8'|'none', eol: 'lf'|'crlf'|'cr'|'mixed'|'none',
 *          lines: string[], trailing: number}} spec
 */
function render(spec) {
  const sep = spec.eol === 'crlf' ? CRLF : spec.eol === 'cr' ? CR : LF;
  let body;
  if (spec.eol === 'mixed') {
    // Build explicit mixed separators: lines[0]\n lines[1]\r\n lines[2]\r ...
    body = '';
    for (let i = 0; i < spec.lines.length; i++) {
      body += spec.lines[i];
      if (i < spec.lines.length - 1) {
        body += [LF, CRLF, CR][i % 3];
      }
    }
  } else if (spec.eol === 'none') {
    body = spec.lines.join(''); // no separators (single-line payloads)
  } else {
    body = spec.lines.join(sep);
  }
  // Trailing line-break boundaries — each counts as one boundary.
  for (let i = 0; i < spec.trailing; i++) body += sep;
  const buf = Buffer.from((spec.bom === 'utf8' ? BOM : '') + body, 'utf8');
  return buf;
}

/** Detect EOL profile of a Buffer of UTF-8 text. */
function detectEol(buf, bom = false) {
  const s = buf.toString('utf8');
  const body = bom ? s.slice(1) : s;
  const crlf = (body.match(/\r\n/g) || []).length;
  const lf = (body.match(/\n/g) || []).length - crlf;
  const cr = (body.match(/\r/g) || []).length - crlf;
  if (crlf === 0 && lf === 0 && cr === 0) return 'none';
  const kinds = [['crlf', crlf], ['lf', lf], ['cr', cr]].filter(([, n]) => n > 0);
  return kinds.length === 1 ? kinds[0][0] : 'mixed';
}

/** Count trailing line-break boundaries at end of the logical body. */
function trailingBoundaries(buf, bom = false) {
  const s = buf.toString('utf8');
  const body = bom ? s.slice(1) : s;
  let i = body.length;
  let count = 0;
  while (i > 0) {
    const ch = body[i - 1];
    if (ch === '\n') {
      count++;
      i -= body[i - 2] === '\r' ? 2 : 1;
    } else if (ch === '\r') {
      count++;
      i -= 1;
    } else {
      break;
    }
  }
  return count;
}

// ── Fixture definitions ────────────────────────────────────────────────
const fixtures = [
  // Encoding / EOL / trailing-boundary matrix
  { id: 'utf8-lf-tail0', spec: { bom: 'none', eol: 'lf', trailing: 0, lines: ['# Title', '', 'Body paragraph with ASCII and CJK 中文。', 'Another line.'] } },
  { id: 'utf8-lf-tail1', spec: { bom: 'none', eol: 'lf', trailing: 1, lines: ['# Title', '', 'Body paragraph with ASCII and CJK 中文。', 'Another line.'] } },
  { id: 'utf8-lf-tail2', spec: { bom: 'none', eol: 'lf', trailing: 2, lines: ['# Title', '', 'Body paragraph with ASCII and CJK 中文。', 'Another line.'] } },
  { id: 'utf8-lf-tail3', spec: { bom: 'none', eol: 'lf', trailing: 3, lines: ['# Title', '', 'Body paragraph with ASCII and CJK 中文。', 'Another line.'] } },
  { id: 'utf8-crlf-tail1', spec: { bom: 'none', eol: 'crlf', trailing: 1, lines: ['# Title', '', 'Body paragraph with ASCII and CJK 中文。', 'Another line.'] } },
  { id: 'utf8-crlf-tail2', spec: { bom: 'none', eol: 'crlf', trailing: 2, lines: ['# Title', '', 'Body paragraph with ASCII and CJK 中文。', 'Another line.'] } },
  { id: 'utf8-crlf-tail3', spec: { bom: 'none', eol: 'crlf', trailing: 3, lines: ['# Title', '', 'Body paragraph with ASCII and CJK 中文。', 'Another line.'] } },
  { id: 'utf8-cr-tail1', spec: { bom: 'none', eol: 'cr', trailing: 1, lines: ['# Title', '', 'Body paragraph with ASCII and CJK 中文。', 'Another line.'] } },
  { id: 'utf8-mixed-tail2', spec: { bom: 'none', eol: 'mixed', trailing: 2, lines: ['# Title', '', 'Body paragraph with ASCII and CJK 中文。', 'Another line.', 'Mixed separator line.'] } },
  { id: 'utf8-bom-lf-tail2', spec: { bom: 'utf8', eol: 'lf', trailing: 2, lines: ['# Title', '', 'Body paragraph with ASCII and CJK 中文。', 'Another line.'] } },
  { id: 'empty', spec: { bom: 'none', eol: 'none', trailing: 0, lines: [''] } },
  { id: 'bom-only', spec: { bom: 'utf8', eol: 'none', trailing: 0, lines: [''] } },
  { id: 'newlines-only', spec: { bom: 'none', eol: 'lf', trailing: 3, lines: [''] } },
  { id: 'spaces-only', spec: { bom: 'none', eol: 'none', trailing: 0, lines: ['   \t  '] } },

  // Unicode
  { id: 'unicode-cjk', spec: { bom: 'none', eol: 'lf', trailing: 2, lines: ['# 中文标题', '日本語の段落。', '한국어 문단입니다.', '混合 CJK: 中文 English 日本語'] } },
  { id: 'unicode-emoji', spec: { bom: 'none', eol: 'lf', trailing: 2, lines: ['Emoji: 😀 🎉', 'ZWJ family: 👨‍👩‍👧‍👦', 'Skin tone: 👍🏽', 'Flags: 🇨🇳'] } },
  { id: 'unicode-combining', spec: { bom: 'none', eol: 'lf', trailing: 2, lines: ['Combining: é (é) and ä (ä)', 'Devanagari: नमस्ते', 'Hangul jamo: 한'] } },

  // Syntax constructs
  { id: 'syntax-lists', spec: { bom: 'none', eol: 'lf', trailing: 2, lines: ['- item one', '* item two', '+ item three', '1. ordered', '2. ordered two', '   - nested a', '   - nested b', '', '> blockquote', '>> nested quote'] } },
  { id: 'syntax-fence', spec: { bom: 'none', eol: 'lf', trailing: 2, lines: ['```js', 'const x = 1;', '', '', 'function f() {}', '```', '', '~~~markdown', '# inside tilde fence', '~~~'] } },
  { id: 'syntax-frontmatter', spec: { bom: 'none', eol: 'lf', trailing: 2, lines: ['---', '# comment line', 'title: "A title"', 'tags: [a, b, c]', 'order: 3', '---', '', '# Body after frontmatter'] } },
  { id: 'syntax-table-reference-footnote', spec: { bom: 'none', eol: 'lf', trailing: 2, lines: ['| a | b |', '| --- | --- |', '| 1 | 2 |', '', 'Reference link: [text][ref]', '', '[ref]: https://example.com', '', 'Footnote[^1]', '', '[^1]: footnote text'] } },
  { id: 'syntax-html', spec: { bom: 'none', eol: 'lf', trailing: 2, lines: ['<!-- html comment -->', '', '<div class="x">raw html</div>', '', '<span>inline</span> after'] } },
  { id: 'syntax-image-blanklines', spec: { bom: 'none', eol: 'lf', trailing: 2, lines: ['', '![alt](image.png)', '', '', 'text after image', ''] } },
  { id: 'malformed', spec: { bom: 'none', eol: 'lf', trailing: 2, lines: ['```unclosed fence', '', '[broken link', '| broken | table', '| --- |', '#', '**unclosed strong', '~~~ tilde unclosed'] } },
];

// Large-file generator (on demand — NOT committed). Run with --large <dir>.
function generateLarge(seed, eol, targetBytes) {
  const rand = mulberry32(seed);
  const lines = [];
  const words = ['markdown', 'fixture', 'byte', 'contract', 'line', '中文', '😀', '测试'];
  let size = 0;
  while (size < targetBytes) {
    let line = '';
    const n = 4 + Math.floor(rand() * 12);
    for (let i = 0; i < n; i++) {
      line += words[Math.floor(rand() * words.length)] + ' ';
    }
    size += Buffer.byteLength(line + eol);
    lines.push(line);
  }
  return Buffer.from(lines.join(eol), 'utf8');
}

// ── Edit intents for L1 (computed against source bytes at generation) ──
/** Byte offset into the fixture Buffer of a UTF-16 string index in text. */
function byteOffsetOf(text, strIndex) {
  return Buffer.byteLength(text.slice(0, strIndex));
}

function buildIntents(id, buf) {
  const text = buf.toString('utf8');
  const markerAscii = text.includes('Body paragraph') ? 'Body paragraph'
    : text.includes('paragraph') ? 'paragraph'
    : text.match(/[A-Za-z]{4,}/)?.[0] ?? null;
  const markerCjk = text.match(/[一-鿿]/)?.[0] ?? null;
  const intents = [];

  if (markerAscii) {
    const strIdx = text.indexOf(markerAscii);
    const from = byteOffsetOf(text, strIdx);
    intents.push({
      id: `${id}-insert-ascii-body`,
      description: 'insert ASCII char at start of a body word',
      from, to: from, inserted: 'Z',
    });
    intents.push({
      id: `${id}-replace-ascii-body`,
      description: `replace first ASCII body char with 'Z'`,
      from, to: from + Buffer.byteLength(markerAscii[0]), inserted: 'Z',
    });
  }
  if (markerCjk) {
    const strIdx = text.indexOf(markerCjk);
    const from = byteOffsetOf(text, strIdx);
    intents.push({
      id: `${id}-insert-cjk-body`,
      description: 'insert CJK char before first CJK char',
      from, to: from, inserted: '改',
    });
  }
  // Tail edit: explicitly append one trailing line-break boundary.
  intents.push({
    id: `${id}-add-trailing-boundary`,
    description: 'append one explicit trailing line-break boundary',
    from: buf.length, to: buf.length, inserted: '\n',
  });
  // Tail edit: delete the last trailing boundary (only when one exists).
  const m = text.match(/((?:\r\n|\r|\n)+)$/);
  if (m) {
    const group = m[1];
    const lastBoundary = group.endsWith('\r\n') ? '\r\n' : group[group.length - 1];
    const runStart = byteOffsetOf(text, m.index);
    const runEnd = buf.length;
    intents.push({
      id: `${id}-delete-last-trailing-boundary`,
      description: `delete the last trailing line-break boundary (${JSON.stringify(lastBoundary)})`,
      from: runStart, to: runEnd - Buffer.byteLength(lastBoundary), inserted: '',
    });
  }
  return intents;
}

async function main() {
  const verifyOnly = process.argv.includes('--verify');
  await mkdir(filesDir, { recursive: true });

  const manifest = { generatedBy: 'tests/byte-contract/generate-fixtures.mjs', generatedAt: 'deterministic', fixtures: [] };
  const l1Intents = { generatedBy: 'tests/byte-contract/generate-fixtures.mjs', intents: [] };

  for (const fx of fixtures) {
    const buf = render(fx.spec);
    const bom = fx.spec.bom === 'utf8' ? 'utf8' : 'none';
    const eol = detectEol(buf, bom === 'utf8');
    const trailing = trailingBoundaries(buf, bom === 'utf8');
    const rel = path.posix.join('fixtures', `${fx.id}.md`);
    await writeFile(path.join(filesDir, `${fx.id}.md`), buf);
    manifest.fixtures.push({
      id: fx.id,
      file: rel,
      byteLength: buf.length,
      sha256: sha256(buf),
      bom,
      eol,
      trailing,
      encoding: 'utf8',
    });
    const intents = buildIntents(fx.id, buf);
    if (intents.length) l1Intents.intents.push(...intents);
  }

  // Large fixtures: only generated into an explicit target dir, never committed.
  const largeIdx = process.argv.indexOf('--large');
  if (largeIdx !== -1) {
    const target = process.argv[largeIdx + 1];
    if (!target) throw new Error('--large requires a target directory');
    await mkdir(target, { recursive: true });
    for (const [name, bytes] of [['large-1m.md', 1_000_000], ['large-10m.md', 10_000_000], ['large-50m.md', 50_000_000]]) {
      const buf = generateLarge(42, '\n', bytes);
      await writeFile(path.join(target, name), buf);
      manifest.fixtures.push({
        id: name.replace('.md', ''), file: name,
        byteLength: buf.length, sha256: sha256(buf), bom: 'none', eol: 'lf', trailing: 0, encoding: 'utf8', large: true,
      });
    }
  }

  await writeFile(path.join(fixtureDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(fixtureDir, 'l1-intents.json'), JSON.stringify(l1Intents, null, 2) + '\n');
  await writeFile(path.join(fixtureDir, 'README.md'),
`# Canonical byte-contract fixtures

Deterministic synthetic fixtures for L0/L1 byte-fidelity verification.
Generated by \`tests/byte-contract/generate-fixtures.mjs\` — never edit by hand.

- \`fixtures/*.md\` — raw fixture bytes.
- \`manifest.json\` — id, byte length, SHA-256, BOM, EOL profile, trailing boundary count.
- \`l1-intents.json\` — declared edit intents (source byte ranges) with expected surviving regions.

Trailing "boundary count" counts line-break boundaries at end of file
(e.g. \`\\r\\n\\r\\n\` = 2), NOT visual blank lines in a rendered preview.

All content is synthetic. \`/Users/xian/markflow-test\` is never read or written.
Large fixtures (1/10/50 MiB) are generated on demand with
\`node tests/byte-contract/generate-fixtures.mjs --large <dir>\` and are not committed.
`);

  // Deterministic self-verification: hashes must be stable across runs.
  if (verifyOnly) {
    const prev = JSON.parse(await readFile(path.join(fixtureDir, 'manifest.json'), 'utf8'));
    const changed = manifest.fixtures.filter((f, i) => prev.fixtures[i] && f.sha256 !== prev.fixtures[i].sha256);
    console.log(JSON.stringify({ verified: true, stable: changed.length === 0, changed: changed.map(c => c.id) }, null, 2));
    return;
  }

  console.log(JSON.stringify({ generated: manifest.fixtures.length, large: manifest.fixtures.filter(f => f.large).length }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
