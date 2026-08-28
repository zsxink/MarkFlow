// P4A task 6.1 — machine-readable range report for the TypeScript candidate
// (CodeMirror Lezer + GFM, the product's local projection parser).
//
// For every canonical byte fixture (logical LF text) this test:
//   1. parses with the product parser path and extracts projection constructs;
//   2. validates every construct against the frozen expectations.json table
//      (round-trip: text.slice(sourceRange) must equal the canonical source);
//   3. records malformed-input fallback behavior (no throw / structure);
//   4. writes the full report JSON to $SPIKE_OUT (or spike/parser-spike/out/),
//      BEFORE asserting, so a failing run still leaves its evidence file.
//
// Gate: the test FAILS if any construct is INVALID (out-of-bounds/wrong slice),
// or content/marker slices mismatch — spike exit code is meaningful evidence.
// Coverage gaps (MISS, e.g. frontmatter) are recorded data, not failures.
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadFixtures, sha256 } from './lib/fixtures.mjs';
import { parseWithLezer, coordinateProbe } from './lib/lezer';
import { validateFixture, type ExpectEntry, type FixtureValidation } from './lib/validate';
import expectationsJson from './expectations.json';

// @lezer/markdown's exports map does not expose ./package.json — resolve the
// module entry and walk up to its package directory.
const require = createRequire(import.meta.url);
function pkgOf(name: string): { version: string; license: string } {
  let dir = path.dirname(require.resolve(name));
  while (dir !== path.parse(dir).root) {
    try {
      return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      dir = path.dirname(dir);
    }
  }
  throw new Error(`package.json not found for ${name}`);
}
const lezerPkg = pkgOf('@lezer/markdown');
const langMarkdownPkg = pkgOf('@codemirror/lang-markdown');

interface ExpectationsFile {
  contentCompare: { exact: string[]; trim: string[] };
  fixtures: Record<string, { requireAll: boolean; expect: ExpectEntry[] }>;
}
const expectations = expectationsJson as unknown as ExpectationsFile;

const outDir = process.env.SPIKE_OUT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');

interface CandidateFixtureReport {
  fixtureId: string;
  origin: string;
  parseThrew: boolean;
  parseError: string | null;
  fallbackBehavior: string;
  validation: FixtureValidation;
}

describe('P4A 6.1 — Lezer range report', () => {
  const probe = coordinateProbe();
  const perFixture: CandidateFixtureReport[] = [];

  it('builds the range report for every canonical fixture', async () => {
    const fixtures = await loadFixtures();
    for (const fx of fixtures) {
      const parsed = parseWithLezer(fx.logicalText);
      const spec = expectations.fixtures[fx.id] ?? { requireAll: false, expect: [] };
      const validation = validateFixture(
        fx.logicalText,
        parsed.threw ? [] : parsed.constructs,
        spec.expect,
        spec.requireAll,
      );
      const kinds = [...new Set(validation.constructs.map((c) => c.kind))].sort();
      perFixture.push({
        fixtureId: fx.id,
        origin: fx.origin,
        parseThrew: parsed.threw,
        parseError: parsed.threw ? parsed.error : null,
        fallbackBehavior: parsed.threw
          ? 'PARSE THREW — no structure'
          : `no throw; returned ${validation.constructs.length} constructs (kinds: ${kinds.join(',') || 'none'})`,
        validation,
      });
    }

    const report = {
      spike: 'parser-candidate-range-comparison',
      change: 'refactor-lossless-live-preview',
      task: 'P4A 6.1 (CodeMirror Lezer candidate)',
      generatedAt: new Date().toISOString(),
      fixtureBasis: {
        manifest: 'tests/fixtures/byte-contract/manifest.json',
        logicalTextRule:
          'source bytes decoded UTF-8, BOM stripped, CRLF/CR normalized to LF (Core LineEndingMap owns EOL restoration; out of scope here)',
        reportedCoordinateSystem: 'utf16-code-units (half-open [start,end) on the logical LF text)',
        expectations: {
          file: 'spike/parser-spike/expectations.json',
          sha256: sha256(JSON.stringify(expectationsJson)),
          note: 'frozen reference; derived from the verified Lezer dump and hand-checked against the canonical fixture definitions',
        },
        fixtures: fixtures.map((fx) => ({
          id: fx.id,
          origin: fx.origin,
          bom: fx.bom,
          eol: fx.eol,
          trailing: fx.trailing,
          byteLength: fx.byteLength,
          manifestSha256: fx.manifestSha256,
          logicalLength: fx.logicalLength,
          logicalSha256: fx.logicalSha256,
        })),
      },
      candidates: [
        {
          id: 'lezer',
          language: 'TypeScript',
          packages: [
            { name: '@codemirror/lang-markdown', version: langMarkdownPkg.version, license: langMarkdownPkg.license },
            { name: '@lezer/markdown', version: lezerPkg.version, license: lezerPkg.license },
          ],
          parserConfig: 'markdown({ extensions: [GFM] }).language.parser — the exact product path (losslessSourceEditor.ts)',
          nativeCoordinateSystem: 'utf16-code-units (JS string indices)',
          reportedCoordinateSystem: 'utf16-code-units (no conversion)',
          coordinateProbe: probe,
          parseErrorPolicy: 'try/catch around parser.parse; a throw is recorded per fixture (no panic propagation)',
          markerSource:
            'Lezer delimiter child nodes (HeaderMark/EmphasisMark/CodeMark/QuoteMark/ListMark/LinkMark/StrikethroughMark/TaskMarker/TableDelimiter) — native delimiter spans',
          fixtures: perFixture,
        },
      ],
    };

    await mkdir(outDir, { recursive: true });
    const file = path.join(outDir, 'report-ts.json');
    await writeFile(file, JSON.stringify(report, null, 1) + '\n');
    console.log(`[spike] wrote ${file}`);

    // Round-trip gate: every range must slice back to the expected source.
    for (const fx of perFixture) {
      expect(fx.validation.summary.invalid, `${fx.fixtureId}: invalid ranges`).toBe(0);
      expect(fx.validation.summary.contentMismatches, `${fx.fixtureId}: content mismatches`).toBe(0);
      expect(fx.validation.summary.markerMismatches, `${fx.fixtureId}: marker mismatches`).toBe(0);
    }
  });

  it('confirms the declared coordinate system empirically', () => {
    expect(probe.verdict.startsWith('utf16-code-units')).toBe(true);
  });
});
