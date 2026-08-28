// Deterministic Normal/Large synthetic markdown fixtures for the P4A spike
// performance probe. Mirrors the mulberry32 generator思路 of
// tests/byte-contract/generate-fixtures.mjs (seed 42, same word list) so the
// TS and Rust harnesses measure the SAME bytes — the Rust harness reads these
// files instead of regenerating, avoiding a second drifting implementation.
//
// Files are written to /tmp (never committed, never user documents):
//   $SPIKE_PERF_DIR/perf-1m.md   (~1 MB, Normal grade)
//   $SPIKE_PERF_DIR/perf-10m.md  (~10 MB, Large grade)
//
// Run directly: node spike/parser-spike/explore/gen-perf-fixtures.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

/** Same PRNG as tests/byte-contract/generate-fixtures.mjs. */
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['markdown', 'fixture', 'byte', 'contract', 'line', '中文', '😀', '测试'];

/** Same shape as generateLarge(seed, eol, targetBytes) in the canonical generator. */
export function generateLarge(seed, targetBytes) {
  const rand = mulberry32(seed);
  const lines = [];
  let size = 0;
  while (size < targetBytes) {
    let line = '';
    const n = 4 + Math.floor(rand() * 12);
    for (let i = 0; i < n; i++) {
      line += WORDS[Math.floor(rand() * WORDS.length)] + ' ';
    }
    size += Buffer.byteLength(line + '\n', 'utf8');
    lines.push(line);
  }
  return Buffer.from(lines.join('\n'), 'utf8');
}

/**
 * Block-varied deterministic document (heading/paragraph/list/fence pattern),
 * repeated to ~targetBytes bytes. The word-salad fixtures above are ONE giant
 * paragraph (no blank lines) — a pathological case recorded as such. This
 * variant represents a realistic markdown document shape.
 */
export function generateBlockVaried(targetBytes) {
  const chunks = [];
  let size = 0;
  let k = 0;
  while (size < targetBytes) {
    k++;
    const chunk = [
      `## Heading ${k}`,
      '',
      `Paragraph ${k} with markdown fixture words 中文 😀 and plain text continues for a few lines.`,
      'Second line of the paragraph to make it multi-line soft-break content.',
      '',
      `- item alpha ${k}`,
      `- item beta ${k}`,
      '  - nested item',
      '',
      '```js',
      `const k${k} = ${k}; // fenced code block`,
      '```',
      '',
      '',
    ].join('\n');
    chunks.push(chunk);
    size += Buffer.byteLength(chunk + '\n', 'utf8');
  }
  return Buffer.from(chunks.join('\n'), 'utf8');
}

export function perfDir() {
  return process.env.SPIKE_PERF_DIR ?? path.join(os.tmpdir(), 'markflow-p4a-spike');
}

export async function ensurePerfFixtures() {
  const dir = perfDir();
  await mkdir(dir, { recursive: true });
  const { readFile, stat } = await import('node:fs/promises');
  const out = [];
  for (const [name, target, gen] of [
    ['perf-1m.md', 1_000_000, () => generateLarge(42, 1_000_000)],
    ['perf-10m.md', 10_000_000, () => generateLarge(42, 10_000_000)],
    ['perf-varied-1m.md', 1_000_000, () => generateBlockVaried(1_000_000)],
    ['perf-varied-10m.md', 10_000_000, () => generateBlockVaried(10_000_000)],
  ]) {
    const file = path.join(dir, name);
    const st = await stat(file).catch(() => null);
    const existing = st ? await readFile(file) : null;
    // Regenerate only when absent or clearly wrong size (content is deterministic).
    let buf;
    if (!existing || Math.abs(existing.length - target) > target) {
      buf = gen();
      await writeFile(file, buf);
    } else {
      buf = existing;
    }
    out.push({
      file,
      byteLength: buf.length,
      sha256: createHash('sha256').update(buf).digest('hex'),
      utf16Length: buf.toString('utf8').length,
    });
  }
  return out;
}

// Direct invocation: generate and print the manifest.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  ensurePerfFixtures().then((m) => console.log(JSON.stringify(m, null, 2)));
}
