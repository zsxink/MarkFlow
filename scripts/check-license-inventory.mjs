#!/usr/bin/env node
/**
 * Offline gate for the third-party license inventory.
 *
 * Fails when:
 *   1. a lockfile dependency is missing from the snapshot (or vice versa);
 *   2. a license identifier is outside `ALLOWED_LICENSES`;
 *   3. a license that requires a bundled text has no file in `third-party/texts/`;
 *   4. the committed snapshot differs from what the generator would produce.
 *
 * Modes:
 *   --npm    only the npm inventory (no Rust toolchain needed -> `web-checks`)
 *   --cargo  only the Rust inventory (needs cargo + registry cache -> `rust-checks`)
 *   (none)   both
 *
 * No network access: the npm side reads the lockfile and `node_modules/`, and
 * `cargo metadata` runs with `--offline`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALLOWED_LICENSES,
  readCargoInventory,
  readNpmInventory,
  requiredTextIds,
  serializeSnapshot,
} from './lib/license-inventory.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_DIR = join(ROOT, 'third-party', 'texts');

const problems = [];

function fail(message) {
  problems.push(message);
}

function parseModes(argv) {
  const unknown = argv.filter(
    (arg) => arg.startsWith('--') && !['--npm', '--cargo', '--help'].includes(arg),
  );
  if (unknown.length) {
    console.error(`unknown option(s): ${unknown.join(' ')}`);
    process.exit(2);
  }
  if (argv.includes('--help')) {
    console.log('Usage: node scripts/check-license-inventory.mjs [--npm] [--cargo]');
    process.exit(0);
  }
  const npm = argv.includes('--npm');
  const cargo = argv.includes('--cargo');
  if (!npm && !cargo) return { npm: true, cargo: true };
  return { npm, cargo };
}

function checkSnapshotFreshness(ecosystem, entries) {
  const path = join(ROOT, 'third-party', `inventory.${ecosystem}.json`);
  if (!existsSync(path)) {
    fail(
      `${ecosystem}: missing third-party/inventory.${ecosystem}.json — run "npm run licenses:generate"`,
    );
    return;
  }
  const committed = readFileSync(path, 'utf8');
  const expected = serializeSnapshot(ecosystem, entries);
  if (committed !== expected) {
    // Narrow the report down to the packages that actually changed so the
    // message names something actionable instead of "file differs".
    const before = new Map(
      (JSON.parse(committed).packages ?? []).map((p) => [`${p.name}@${p.version}`, p]),
    );
    const after = new Map(entries.map((p) => [`${p.name}@${p.version}`, p]));
    const added = [...after.keys()].filter((key) => !before.has(key));
    const removed = [...before.keys()].filter((key) => !after.has(key));
    const changed = [...after.keys()].filter((key) => {
      const old = before.get(key);
      if (!old) return false;
      const now = after.get(key);
      return (
        old.license !== now.license ||
        old.chosen !== now.chosen ||
        old.copyright !== now.copyright ||
        old.licenseSource !== now.licenseSource
      );
    });
    const details = [
      added.length ? `added: ${added.join(', ')}` : '',
      removed.length ? `removed: ${removed.join(', ')}` : '',
      changed.length ? `license/copyright changed: ${changed.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('; ');
    fail(
      `${ecosystem}: third-party/inventory.${ecosystem}.json is stale — run "npm run licenses:generate"${details ? ` (${details})` : ''}`,
    );
  }
}

function checkAllowed(ecosystem, entries) {
  for (const entry of entries) {
    const label = `${entry.name}@${entry.version}`;
    if (entry.chosen === 'UNKNOWN' || entry.license === 'UNKNOWN') {
      fail(
        `${ecosystem}: ${label} has no resolvable license (source: ${entry.licenseSource}) — inspect the package and record it before release`,
      );
      continue;
    }
    for (const id of entry.texts) {
      if (!ALLOWED_LICENSES.has(id)) {
        fail(
          `${ecosystem}: ${label} uses license "${id}" (from "${entry.license}"), which is not in ALLOWED_LICENSES (scripts/lib/license-inventory.mjs)`,
        );
      }
    }
  }
}

function checkTexts(ecosystem, entries) {
  for (const id of requiredTextIds(entries)) {
    if (!ALLOWED_LICENSES.has(id)) continue; // already reported by checkAllowed
    const path = join(TEXT_DIR, `${id}.txt`);
    if (!existsSync(path)) {
      fail(
        `${ecosystem}: license "${id}" requires a bundled text but third-party/texts/${id}.txt is missing`,
      );
    }
  }
}

function checkFontLicense() {
  // Bundled fonts are not lockfile dependencies, so the inventory cannot see
  // them; assert their license text is present and the two upstream OFL files
  // are still where the provenance record says they are.
  if (!existsSync(join(TEXT_DIR, 'OFL-1.1.txt'))) {
    fail('fonts: bundled fonts are OFL-1.1 but third-party/texts/OFL-1.1.txt is missing');
  }
  for (const name of ['SourceSerif4-OFL.txt', 'SourceHanSerifSC-OFL.txt']) {
    const path = join(ROOT, 'src', 'assets', 'fonts', name);
    if (!existsSync(path)) {
      fail(`fonts: expected upstream license text at src/assets/fonts/${name}`);
    }
  }

  // The CJK subset is a Modified Version under the OFL, so its @font-face
  // family must not carry the upstream reserved name. A CSS regression here is
  // invisible to the type checker, hence a text assertion.
  const fontCss = join(ROOT, 'src', 'styles', 'variables.css');
  if (existsSync(fontCss)) {
    const css = readFileSync(fontCss, 'utf8');
    const cjkFaces = css
      .split('@font-face')
      .filter((block) => block.includes('SourceHanSerifSC-'));
    for (const block of cjkFaces) {
      const family = /font-family:\s*'([^']+)'/.exec(block)?.[1] ?? '';
      if (/\bSource\b/.test(family)) {
        fail(
          `fonts: src/styles/variables.css declares the CJK subset as "${family}", which reuses the OFL reserved font name "Source" (see third-party/fonts/PROVENANCE.md)`,
        );
      }
    }
    if (cjkFaces.length === 0) {
      fail('fonts: src/styles/variables.css no longer declares the bundled CJK @font-face rules');
    }
  }
}

function main() {
  const modes = parseModes(process.argv.slice(2));
  const collected = [];

  if (modes.npm) {
    const entries = readNpmInventory(ROOT);
    checkAllowed('npm', entries);
    checkTexts('npm', entries);
    checkSnapshotFreshness('npm', entries);
    collected.push(['npm', entries.length]);
  }

  if (modes.cargo) {
    let entries;
    try {
      entries = readCargoInventory(ROOT);
    } catch (error) {
      fail(`cargo: ${error.message}`);
      entries = null;
    }
    if (entries) {
      checkAllowed('cargo', entries);
      checkTexts('cargo', entries);
      checkSnapshotFreshness('cargo', entries);
      collected.push(['cargo', entries.length]);
    }
  }

  if (modes.npm) checkFontLicense();

  if (problems.length) {
    console.error('License inventory check FAILED:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('');
    console.error('Fix the issues above, then re-run "npm run licenses:generate".');
    process.exit(1);
  }

  const summary = collected.map(([name, count]) => `${name}: ${count} packages`).join(', ');
  console.log(`License inventory OK (${summary})`);
}

main();
