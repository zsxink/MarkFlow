#!/usr/bin/env node
/**
 * L0 byte-for-byte fidelity harness.
 *
 * Verifies that a document opened and saved WITHOUT any body transaction
 * produces output bytes identical to the input: equal SHA-256, equal byte
 * length, zero byte diff. String-trimmed or normalized comparisons are NOT
 * accepted as proof.
 *
 * Usage:
 *   node l0-harness.mjs <input> <output>     # verify one L0 round-trip
 *   node l0-harness.mjs --self-check         # oracle + negative controls over all fixtures
 *   node l0-harness.mjs --fixtures <dir>     # self-check against a fixtures dir (default tests/fixtures/byte-contract)
 */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultFixtures = path.join(root, 'fixtures', 'byte-contract', 'fixtures');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function byteDiffCount(a, b) {
  const n = Math.min(a.length, b.length);
  let count = 0;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) count++;
  return count + Math.abs(a.length - b.length);
}

/** L0 verdict for a single (input, output) pair. */
export function verifyL0(input, output) {
  const inSha = sha256(input);
  const outSha = sha256(output);
  const pass = input.equals(output);
  return {
    pass,
    inputSha: inSha,
    outputSha: outSha,
    inputLen: input.length,
    outputLen: output.length,
    byteDiffCount: pass ? 0 : byteDiffCount(input, output),
  };
}

async function selfCheck(fixturesDir) {
  const files = (await readdir(fixturesDir)).filter((f) => f.endsWith('.md')).sort();
  const results = [];
  for (const file of files) {
    const input = await readFile(path.join(fixturesDir, file));
    const r = verifyL0(input, input);
    results.push({ fixture: file, ...r });
  }

  // Negative control: flip one byte of the input → must FAIL.
  const negative = [];
  for (const file of files) {
    const input = await readFile(path.join(fixturesDir, file));
    if (input.length === 0) continue; // nothing to corrupt
    const corrupted = Buffer.from(input);
    corrupted[Math.min(1, corrupted.length - 1)] ^= 0xff;
    const r = verifyL0(input, corrupted);
    negative.push({ fixture: file, pass: r.pass, caught: !r.pass, byteDiffCount: r.byteDiffCount });
  }

  const allPass = results.every((r) => r.pass);
  const allCaught = negative.every((n) => n.caught);
  return {
    positive: { pass: allPass, count: results.length, failed: results.filter((r) => !r.pass).map((r) => r.fixture) },
    negative: { pass: allCaught, count: negative.length, missed: negative.filter((n) => !n.caught).map((n) => n.fixture) },
    ok: allPass && allCaught,
    fixturesDir,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-check')) {
    const fixturesDir = args.includes('--fixtures')
      ? args[args.indexOf('--fixtures') + 1]
      : defaultFixtures;
    const result = await selfCheck(fixturesDir);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }
  if (args.length >= 2) {
    const [inputPath, outputPath] = args;
    const [input, output] = await Promise.all([readFile(inputPath), readFile(outputPath)]);
    const result = verifyL0(input, output);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.pass ? 0 : 1);
  }
  console.error('Usage: node l0-harness.mjs <input> <output> | --self-check [--fixtures <dir>]');
  process.exit(2);
}

// Only run the CLI when executed directly (not when imported as a module).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
