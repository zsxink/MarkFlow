#!/usr/bin/env node
// Unit tests for scripts/check-evidence-honesty.sh.
//
// Each test builds an isolated temp "repo" (matrix.json, requirements.json,
// evidence/INDEX.json + one evidence.json, markflow-core/fixtures/manifest.json) that
// deliberately violates ONE honesty rule, then runs the honesty check against
// it and asserts a non-zero exit with the expected failure message.
//
// Uses node's child_process so the tests are self-contained and reproducible
// on any platform (the real script requires bash, jq, shasum — all present on
// macOS/Linux CI).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const HONESTY = join(ROOT, 'scripts/check-evidence-honesty.sh');
const FIXTURE_MANIFEST = join(ROOT, 'markflow-core/fixtures/manifest.json');

const failures = [];
let passed = 0;

function runHonesty(env, args = []) {
  try {
    const out = execFileSync('bash', [HONESTY, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: 'pipe',
    });
    return { code: 0, stdout: String(out) };
  } catch (error) {
    return { code: error.status ?? 1, stdout: String(error.stdout ?? '') };
  }
}

function baseEnv(dir) {
  // Point the honesty check at temp inputs; manifest is overridden per test.
  return {
    MATRIX: join(dir, 'matrix.json'),
    MATRIX_SCHEMA: join(ROOT, 'openspec/capabilities/matrix.schema.json'),
    REQS: join(dir, 'requirements.json'),
    EVIDENCE_DIR: join(dir, 'evidence'),
    INDEX: join(dir, 'evidence/INDEX.json'),
    EVIDENCE_SCHEMA: join(ROOT, 'docs/markflow-core-phase2/evidence/evidence.schema.json'),
    MANIFEST: join(dir, 'manifest.json'),
  };
}

function emptyRequirements() {
  return { schemaVersion: 1, tasks: [] };
}

function emptyManifest() {
  return { schemaVersion: 1, categories: [], fixtures: [] };
}

function matrixWithCapability(states, evidence) {
  return {
    schemaVersion: 1,
    capabilities: [
      {
        id: 'visual-release-gate',
        owner: '@xian',
        childChange: 'r0a-baseline-governance',
        flag: null,
        default: false,
        states,
        evidence,
      },
    ],
  };
}

const NOT_STARTED_STATES = {
  notStarted: true, implemented: false, automatedVerified: false, desktopVerified: false,
  visualVerified: false, imeVerified: false, platformVerified: false, productAccepted: false,
};

function currentEvidenceEntry() {
  return {
    schemaVersion: 1,
    stage: 'r0a',
    caseId: 'unit',
    platform: 'ci',
    result: 'PASS',
    operator: '@xian',
    revision: HEAD,
    buildProfile: 'test',
    flags: {},
    environment: { os: 'ci', webView: 'x', ime: 'n', locale: 'en', theme: 'light', scale: '1', viewport: '1280x800' },
    startTime: '2026-07-31T00:00:00Z',
    endTime: '2026-07-31T00:00:01Z',
    artifactPaths: [],
  };
}

// ── test 1: empty evidence for a passed state ───────────────────────────
{
  const dir = mkdtempSync(join(tmpdir(), 'honesty-empty-evidence-'));
  try {
    const env = baseEnv(dir);
    writeFileSync(join(dir, 'matrix.json'), JSON.stringify(matrixWithCapability(
      { ...NOT_STARTED_STATES, implemented: true, notStarted: false },
      { unit: [], integration: [], desktop: [], visual: [], ime: [], platform: [], observation: [] }
    )));
    writeFileSync(join(dir, 'requirements.json'), JSON.stringify(emptyRequirements()));
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(emptyManifest()));
    mkdirSync(join(dir, 'evidence'), { recursive: true });
    writeFileSync(join(dir, 'evidence/INDEX.json'), JSON.stringify({ schemaVersion: 1, entries: [] }));

    const { code, stdout } = runHonesty(env);
    if (code === 0 || !stdout.includes('fabricated PASS')) {
      failures.push(`test 1 (empty evidence for passed state): expected non-zero exit and 'fabricated PASS', got code=${code}`);
    } else {
      passed++;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── test 2: stale revision ──────────────────────────────────────────────
{
  const dir = mkdtempSync(join(tmpdir(), 'honesty-stale-revision-'));
  try {
    const env = baseEnv(dir);
    writeFileSync(join(dir, 'matrix.json'), JSON.stringify(matrixWithCapability(
      NOT_STARTED_STATES,
      { unit: [], integration: [], desktop: [], visual: [], ime: [], platform: [], observation: [] }
    )));
    writeFileSync(join(dir, 'requirements.json'), JSON.stringify(emptyRequirements()));
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(emptyManifest()));

    const entry = currentEvidenceEntry();
    entry.revision = '0'.repeat(40); // stale
    const entryDir = 'r0a/unit/ci/0000000000000000000000000000000000000000/2026-07-31T00-00-00Z';
    mkdirSync(join(dir, 'evidence', entryDir), { recursive: true });
    writeFileSync(join(dir, 'evidence', entryDir, 'evidence.json'), JSON.stringify(entry));
    writeFileSync(join(dir, 'evidence/INDEX.json'), JSON.stringify({
      schemaVersion: 1,
      entries: [{ dir: entryDir, caseId: 'unit', platform: 'ci', revision: '0'.repeat(40) }],
    }));

    const { code, stdout } = runHonesty(env);
    if (code === 0 || !stdout.includes('stale evidence')) {
      failures.push(`test 2 (stale revision): expected non-zero exit and 'stale evidence', got code=${code}`);
    } else {
      passed++;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── test 3: INDEX references a missing evidence file ────────────────────
{
  const dir = mkdtempSync(join(tmpdir(), 'honesty-missing-file-'));
  try {
    const env = baseEnv(dir);
    writeFileSync(join(dir, 'matrix.json'), JSON.stringify(matrixWithCapability(
      NOT_STARTED_STATES,
      { unit: [], integration: [], desktop: [], visual: [], ime: [], platform: [], observation: [] }
    )));
    writeFileSync(join(dir, 'requirements.json'), JSON.stringify(emptyRequirements()));
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(emptyManifest()));
    mkdirSync(join(dir, 'evidence'), { recursive: true });
    writeFileSync(join(dir, 'evidence/INDEX.json'), JSON.stringify({
      schemaVersion: 1,
      entries: [{ dir: 'r0a/unit/ci/does-not-exist/2026-07-31T00-00-00Z', caseId: 'unit', platform: 'ci', revision: HEAD }],
    }));

    const { code, stdout } = runHonesty(env);
    if (code === 0 || !stdout.includes('missing evidence file')) {
      failures.push(`test 3 (missing referenced file): expected non-zero exit and 'missing evidence file', got code=${code}`);
    } else {
      passed++;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── test 4: fabricated PASS with no evidence URI ─────────────────────────
{
  const dir = mkdtempSync(join(tmpdir(), 'honesty-fabricated-'));
  try {
    const env = baseEnv(dir);
    writeFileSync(join(dir, 'matrix.json'), JSON.stringify(matrixWithCapability(
      { ...NOT_STARTED_STATES, automatedVerified: true, implemented: true, notStarted: false },
      { unit: [], integration: [], desktop: [], visual: [], ime: [], platform: [], observation: [] }
    )));
    writeFileSync(join(dir, 'requirements.json'), JSON.stringify(emptyRequirements()));
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(emptyManifest()));
    mkdirSync(join(dir, 'evidence'), { recursive: true });
    writeFileSync(join(dir, 'evidence/INDEX.json'), JSON.stringify({ schemaVersion: 1, entries: [] }));

    const { code, stdout } = runHonesty(env);
    if (code === 0 || !stdout.includes("has no URI")) {
      failures.push(`test 4 (fabricated PASS): expected non-zero exit and 'has no URI', got code=${code}`);
    } else {
      passed++;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── test 5: valid repo with complete evidence passes ────────────────────
{
  const dir = mkdtempSync(join(tmpdir(), 'honesty-valid-'));
  try {
    const env = baseEnv(dir);
    writeFileSync(join(dir, 'matrix.json'), JSON.stringify(matrixWithCapability(
      NOT_STARTED_STATES,
      { unit: [], integration: [], desktop: [], visual: [], ime: [], platform: [], observation: [] }
    )));
    writeFileSync(join(dir, 'requirements.json'), JSON.stringify(emptyRequirements()));
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(emptyManifest()));

    const entry = currentEvidenceEntry();
    const entryDir = `r0a/unit/ci/${HEAD}/2026-07-31T00-00-00Z`;
    mkdirSync(join(dir, 'evidence', entryDir), { recursive: true });
    writeFileSync(join(dir, 'evidence', entryDir, 'evidence.json'), JSON.stringify(entry));
    writeFileSync(join(dir, 'evidence/INDEX.json'), JSON.stringify({
      schemaVersion: 1,
      entries: [{ dir: entryDir, caseId: 'unit', platform: 'ci', revision: HEAD }],
    }));

    const { code, stdout } = runHonesty(env);
    if (code !== 0 || !stdout.includes('OK: evidence honesty checks passed')) {
      failures.push(`test 5 (valid repo with complete evidence): expected exit 0 and OK summary, got code=${code}`);
    } else {
      passed++;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`evidence-honesty tests: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  FAIL ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
