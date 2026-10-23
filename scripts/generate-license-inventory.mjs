#!/usr/bin/env node
/**
 * Regenerate the third-party license inventory.
 *
 * Writes:
 *   third-party/inventory.npm.json    production npm dependencies
 *   third-party/inventory.cargo.json  reachable Rust crates
 *   THIRD-PARTY-NOTICES.md            human-readable notices
 *
 * Usage:
 *   node scripts/generate-license-inventory.mjs            # both ecosystems
 *   node scripts/generate-license-inventory.mjs --npm      # npm only
 *   node scripts/generate-license-inventory.mjs --cargo    # Rust only
 *
 * Never touches the network: the npm side reads the lockfile plus
 * `node_modules/`, and `cargo metadata` runs with `--offline`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readCargoInventory,
  readNpmInventory,
  renderNotices,
  serializeSnapshot,
} from './lib/license-inventory.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'third-party');

function parseModes(argv) {
  const npm = argv.includes('--npm');
  const cargo = argv.includes('--cargo');
  const unknown = argv.filter(
    (arg) => arg.startsWith('--') && !['--npm', '--cargo', '--help'].includes(arg),
  );
  if (unknown.length) {
    console.error(`unknown option(s): ${unknown.join(' ')}`);
    process.exit(2);
  }
  if (argv.includes('--help')) {
    console.log('Usage: node scripts/generate-license-inventory.mjs [--npm] [--cargo]');
    process.exit(0);
  }
  // No selector means "everything", which is what a maintainer wants after a
  // dependency bump.
  if (!npm && !cargo) return { npm: true, cargo: true };
  return { npm, cargo };
}

function writeSnapshot(ecosystem, entries) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `inventory.${ecosystem}.json`);
  writeFileSync(path, serializeSnapshot(ecosystem, entries));
  console.log(`wrote ${path} (${entries.length} packages)`);
}

function main() {
  const modes = parseModes(process.argv.slice(2));

  // Reuse the committed snapshot for whichever ecosystem was not regenerated,
  // so `--npm` does not clobber the Rust list with an empty one.
  const npmEntries = modes.npm ? readNpmInventory(ROOT) : loadExisting('npm');
  const cargoEntries = modes.cargo ? readCargoInventory(ROOT) : loadExisting('cargo');

  if (modes.npm) writeSnapshot('npm', npmEntries);
  if (modes.cargo) writeSnapshot('cargo', cargoEntries);

  const notices = renderNotices({
    npmEntries,
    cargoEntries,
    generatedAt: new Date().toISOString().slice(0, 10),
    extraTextIds: ['OFL-1.1'],
  });
  const noticesPath = join(ROOT, 'THIRD-PARTY-NOTICES.md');
  writeFileSync(noticesPath, notices);
  console.log(`wrote ${noticesPath}`);
}

function loadExisting(ecosystem) {
  const path = join(OUT_DIR, `inventory.${ecosystem}.json`);
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed.packages ?? [];
  } catch {
    console.error(
      `missing ${path}; run without --npm/--cargo once to generate both inventories first`,
    );
    process.exit(1);
  }
}

main();
