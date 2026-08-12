#!/usr/bin/env node
/**
 * L1 surviving-interval fidelity harness.
 *
 * For a declared edit intent replace(old[start..end], inserted), verifies that
 * all bytes outside the replaced range survive byte-for-byte: prefix, suffix
 * and tracked surviving intervals must equal the corresponding output bytes;
 * only the replacement range and newly inserted bytes may differ. Reports a
 * machine-readable JSON diff and asserts BOM / trailing boundaries / untouched
 * EOL entries separately. Trim-normalized string equality is never accepted.
 *
 * Usage:
 *   node l1-harness.mjs <input> <output> <intent.json>
 *       # intent.json: { "from": n, "to": n, "inserted": "..." }
 *   node l1-harness.mjs --self-check [--fixtures <dir>]
 *       # oracle (input->apply-patch) for every fixture x intent, plus
 *       # negative controls that corrupt an untouched byte and MUST fail.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultFixtures = path.join(root, 'fixtures', 'byte-contract');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** Apply a patch intent to input bytes — the L1 oracle. */
export function applyPatch(input, intent) {
  const { from, to, inserted } = intent;
  const ins = Buffer.from(inserted ?? '', 'utf8');
  const prefix = input.subarray(0, from);
  const suffix = input.subarray(to);
  const out = Buffer.allocUnsafe(prefix.length + ins.length + suffix.length);
  prefix.copy(out, 0);
  ins.copy(out, prefix.length);
  suffix.copy(out, prefix.length + ins.length);
  return { out, prefix, suffix, ins };
}

/** Trailing line-break bytes at the end of a buffer ('' if none). */
function trailingRun(buf) {
  const m = buf.toString('utf8').match(/((?:\r\n|\r|\n)+)$/);
  return m ? Buffer.from(m[1], 'utf8') : Buffer.alloc(0);
}

function bomOf(buf) {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
    ? buf.subarray(0, 3)
    : Buffer.alloc(0);
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return n < Math.max(a.length, b.length) ? n : -1;
}

/** L1 verdict for (input, output, intent). */
export function verifyL1(input, output, intent) {
  const oracle = applyPatch(input, intent);
  const { from, to } = intent;

  // Surviving intervals: [0, from) and [to, len).
  const prefixOk =
    output.length >= from && output.subarray(0, from).equals(input.subarray(0, from));
  const suffixStart = from + oracle.ins.length;
  const suffixOk =
    output.length >= suffixStart &&
    output.subarray(suffixStart).equals(input.subarray(to));

  const pass = output.equals(oracle.out);

  // Boundary assertions for untouched regions.
  const bomIn = bomOf(input);
  const bomOut = bomOf(output);
  const bomPreserved = bomIn.length === 0 || (bomOut.length === 3 && bomIn.equals(bomOut));

  const trailIn = trailingRun(input);
  const trailStart = input.length - trailIn.length;
  const intentTouchesTail = to >= trailStart; // replacement reaches into the trailing run
  const trailOut = trailingRun(output);
  const trailingPreserved = intentTouchesTail ? null : trailIn.equals(trailOut);

  return {
    pass,
    inputSha: sha256(input),
    outputSha: sha256(output),
    oracleSha: sha256(oracle.out),
    from,
    to,
    insertedBytes: oracle.ins.length,
    prefixOk,
    suffixOk,
    bomPreserved,
    trailingPreserved,
    diff: pass ? [] : diffReport(input, output, oracle.out),
  };
}

function diffReport(input, output, oracle) {
  const first = firstDiff(output, oracle);
  const a = output.toString('hex');
  const b = oracle.toString('hex');
  return {
    firstDiffAt: first,
    outputLen: output.length,
    oracleLen: oracle.length,
    outputTailHex: a.slice(Math.max(0, a.length - 64)),
    oracleTailHex: b.slice(Math.max(0, b.length - 64)),
    outputHasTrailingRun: trailingRun(output).length,
    oracleHasTrailingRun: trailingRun(oracle).length,
  };
}

async function loadIntents(fixturesRoot) {
  const { intents } = JSON.parse(
    await readFile(path.join(fixturesRoot, 'l1-intents.json'), 'utf8'),
  );
  const byId = {};
  for (const it of intents) byId[it.id] = it;
  return byId;
}

async function selfCheck(fixturesRoot) {
  const files = (await readdir(path.join(fixturesRoot, 'fixtures'))).filter((f) => f.endsWith('.md')).sort();
  const intentsById = await loadIntents(fixturesRoot);
  const positives = [];
  const negatives = [];

  for (const file of files) {
    const input = await readFile(path.join(fixturesRoot, 'fixtures', file));
    const id = file.replace('.md', '');
    const myIntents = Object.values(intentsById).filter((it) => it.id.startsWith(`${id}-`));
    if (myIntents.length === 0) continue;

    for (const intent of myIntents) {
      // Positive: output = oracle → must pass.
      const oracleOut = applyPatch(input, intent).out;
      const ok = verifyL1(input, oracleOut, intent);
      positives.push({ intent: intent.id, pass: ok.pass, ...ok });

      // Negative: corrupt one byte inside a surviving region of the oracle → must fail.
      const corrupted = Buffer.from(oracleOut);
      const target = intent.from > 0 ? Math.floor(intent.from / 2) : oracleOut.length > intent.from + 1 ? oracleOut.length - 1 : -1;
      if (target >= 0 && target < corrupted.length) {
        corrupted[target] ^= 0xff;
        const neg = verifyL1(input, corrupted, intent);
        negatives.push({ intent: intent.id, pass: neg.pass, caught: !neg.pass });
      }
    }
  }

  const allPass = positives.every((r) => r.pass);
  const allCaught = negatives.every((n) => n.caught);
  return {
    positive: { pass: allPass, count: positives.length, failed: positives.filter((r) => !r.pass).map((r) => r.intent) },
    negative: { pass: allCaught, count: negatives.length, missed: negatives.filter((n) => !n.caught).map((n) => n.intent) },
    ok: allPass && allCaught,
    fixturesRoot,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-check')) {
    const fixturesRoot = args.includes('--fixtures')
      ? args[args.indexOf('--fixtures') + 1]
      : defaultFixtures;
    const result = await selfCheck(fixturesRoot);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }
  if (args.length >= 3) {
    const [inputPath, outputPath, intentPath] = args;
    const [input, output, rawIntent] = await Promise.all([
      readFile(inputPath),
      readFile(outputPath),
      readFile(intentPath, 'utf8'),
    ]);
    const intent = JSON.parse(rawIntent);
    const result = verifyL1(input, output, intent);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.pass ? 0 : 1);
  }
  console.error('Usage: node l1-harness.mjs <input> <output> <intent.json> | --self-check [--fixtures <dir>]');
  process.exit(2);
}

// Only run the CLI when executed directly (not when imported as a module).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
