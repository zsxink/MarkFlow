#!/usr/bin/env node
/**
 * Layering / structure gate for MarkFlow.
 *
 * Enforces the rules in `openspec/specs/source-layering/spec.md` and
 * `openspec/specs/code-standards/spec.md`:
 *
 *   1. Layer whitelist  — dependencies only point "leftwards"
 *                         types <- utils <- infra <- {editor,render,export} <- ui <- main
 *   2. Barrel rule      — cross-layer imports into editor/render/export target index.ts
 *   3. No deep ascent   — no `../../../` (3+ levels up) in relative imports
 *   4. No cycles        — zero strongly connected components in the import graph
 *   5. Test separation  — no *.test.ts / *.fixtures.ts / *.helpers.ts in prod dirs
 *   6. File size        — production files <= 900 lines
 *   7. Rust tests       — no inline `#[cfg(test)] mod tests { ... }` in prod files
 *
 * Zero dependencies on purpose: the repo already uses this style for
 * `check-archive-synced.sh` / `check-capabilities.sh`, and adding
 * dependency-cruiser/ESLint would be a new build framework.
 *
 * Usage: node scripts/check-layering.mjs [--json]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const RUST_SRC = join(ROOT, 'src-tauri', 'src');

const MAX_LINES = 900;
const DEEP_ASCENT_LIMIT = 3;

/** Frontend layers, ordered from the bottom (most depended upon) to the top. */
const LAYERS = ['types', 'utils', 'infra', 'engine', 'ui', 'main'];
/** Directories that all belong to the shared "engine" band. */
const ENGINE_DIRS = ['editor', 'render', 'export'];
/**
 * Pre-migration directory names, mapped onto their target layer so the gate
 * reports real violations while the batches are still in flight. Removed once
 * the migration lands (see tasks 5.x).
 */
const LEGACY_LAYER_MAP = { lib: 'engine', components: 'ui' };
/** Modules that must expose a single barrel as their cross-layer entry. */
const BARREL_MODULES = ['editor', 'render', 'export'];
const TEST_SUFFIXES = ['.test.ts', '.test.tsx'];
const TEST_SUPPORT_SUFFIXES = ['.fixtures.ts', '.helpers.ts'];
const TEST_SUPPORT_DIR = join(SRC, '__fixtures__');
const TEST_DIR_NAME = '__tests__';

const violations = [];
const notes = [];

function rel(p) {
  return relative(ROOT, p).split(sep).join('/');
}

function fail(rule, file, message) {
  violations.push({ rule, file: rel(file), message });
}

function walk(dir, onFile) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

function isTestPath(file) {
  return file.split(sep).includes(TEST_DIR_NAME);
}

function isTsProdFile(file) {
  if (!file.endsWith('.ts')) return false;
  if (file.endsWith('.d.ts')) return false;
  if (TEST_SUFFIXES.some((s) => file.endsWith(s))) return false;
  return !isTestPath(file);
}

/** Resolve which layer a src-relative path belongs to. */
function layerOf(file) {
  const parts = relative(SRC, file).split(sep);
  const top = parts[0];
  if (top === 'main.ts') return 'main';
  if (ENGINE_DIRS.includes(top)) return 'engine';
  if (LAYERS.includes(top)) return top;
  if (LEGACY_LAYER_MAP[top]) return LEGACY_LAYER_MAP[top];
  return null;
}

/** Numeric rank so we can compare "leftwards" ordering. */
function rankOf(layer) {
  return LAYERS.indexOf(layer);
}

function collectTsFiles() {
  const prod = [];
  const tests = [];
  walk(SRC, (file) => {
    if (!file.endsWith('.ts')) return;
    if (TEST_SUFFIXES.some((s) => file.endsWith(s)) || isTestPath(file)) tests.push(file);
    else prod.push(file);
  });
  return { prod, tests };
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT_IMPORT_RE = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

function importSpecifiers(source) {
  const specs = new Set();
  for (const re of [IMPORT_RE, SIDE_EFFECT_IMPORT_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source)) !== null) specs.add(match[1]);
  }
  return [...specs];
}

/** Resolve a relative specifier to a concrete .ts file inside src/. */
function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [`${base}.ts`, join(base, 'index.ts'), `${base}.tsx`, base];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

function checkFrontendStructure() {
  const { prod, tests } = collectTsFiles();

  // Rule 5: test code must live in __tests__/ or __fixtures__/.
  for (const file of prod) {
    if (TEST_SUPPORT_SUFFIXES.some((s) => file.endsWith(s))) {
      if (!file.startsWith(TEST_SUPPORT_DIR + sep)) {
        fail('test-separation', file, `test-only ${TEST_SUPPORT_SUFFIXES.join('/')} file must live in src/__fixtures__/`);
      }
    }
  }
  walk(SRC, (file) => {
    if (TEST_SUFFIXES.some((s) => file.endsWith(s)) && !isTestPath(file)) {
      fail('test-separation', file, `test file must live in a ${TEST_DIR_NAME}/ directory`);
    }
  });

  // Rule 6: production file size.
  for (const file of prod) {
    const lines = readFileSync(file, 'utf8').split('\n').length;
    if (lines > MAX_LINES) {
      fail('file-size', file, `${lines} lines exceeds the ${MAX_LINES}-line limit`);
    }
  }

  // Rules 1-3: per-file import checks.
  const graph = new Map(prod.map((file) => [file, []]));

  for (const file of prod) {
    const layer = layerOf(file);
    const source = readFileSync(file, 'utf8');

    for (const spec of importSpecifiers(source)) {
      // Rule 3: no deep ascent.
      const ascents = (spec.match(/\.\.\//g) || []).length;
      if (ascents >= DEEP_ASCENT_LIMIT) {
        fail('deep-import', file, `import "${spec}" ascends ${ascents} levels`);
      }

      const target = resolveSpecifier(file, spec);
      if (!target) continue;

      const targetLayer = layerOf(target);
      if (!targetLayer || !layer) continue;

      if (graph.has(target)) graph.get(file).push(target);

      // Same layer (including cross-module within the engine band): only the
      // barrel rule applies, and only for cross-module engine imports.
      if (layer === targetLayer) {
        if (layer === 'engine') {
          const fromTop = relative(SRC, file).split(sep)[0];
          const toTop = relative(SRC, target).split(sep)[0];
          if (fromTop !== toTop && !toTop.includes('.')) {
            // Cross-module engine import must go through the target barrel.
            const targetName = relative(join(SRC, toTop), target).split(sep).join('/');
            if (targetName !== 'index.ts') {
              fail('barrel', file, `cross-module engine import "${spec}" bypasses ${toTop}/index.ts`);
            }
          }
        }
        continue;
      }

      // Rule 1: layer whitelist.
      const fromRank = rankOf(layer);
      const toRank = rankOf(targetLayer);
      if (toRank > fromRank) {
        fail(
          'layer-direction',
          file,
          `import "${spec}" points at higher layer "${targetLayer}" (allowed: types <- utils <- infra <- editor/render/export <- ui <- main)`,
        );
        continue;
      }

      // Rule 2: barrel rule for cross-layer imports into an engine module.
      if (ENGINE_DIRS.includes(relative(SRC, target).split(sep)[0])) {
        const targetModule = relative(SRC, target).split(sep)[0];
        const targetName = relative(join(SRC, targetModule), target).split(sep).join('/');
        if (targetName !== 'index.ts') {
          fail('barrel', file, `import "${spec}" bypasses ${targetModule}/index.ts`);
        }
      }
    }
  }

  // Rule 4: cycles via Tarjan SCC.
  let index = 0;
  const indices = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const sccs = [];

  const strongConnect = (node) => {
    indices.set(node, index);
    low.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) || []) {
      if (!indices.has(next)) {
        strongConnect(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), indices.get(next)));
      }
    }
    if (low.get(node) === indices.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) sccs.push(component);
    }
  };

  for (const file of prod) if (!indices.has(file)) strongConnect(file);

  for (const component of sccs) {
    fail('cycle', component[0], `import cycle: ${component.map(rel).join(' -> ')}`);
  }

  notes.push(`frontend: ${prod.length} production files, ${tests.length} test files scanned`);
}

const RUST_INLINE_TESTS_RE = /#\[cfg\(test\)\]\s*\n\s*mod\s+tests\s*\{/;

function checkRustStructure() {
  let prodCount = 0;
  walk(RUST_SRC, (file) => {
    if (!file.endsWith('.rs')) return;
    if (file.split(sep).includes('tests')) return;
    prodCount += 1;

    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n').length;

    if (lines > MAX_LINES) {
      fail('file-size', file, `${lines} lines exceeds the ${MAX_LINES}-line limit`);
    }
    if (RUST_INLINE_TESTS_RE.test(source)) {
      fail('test-separation', file, 'inline `#[cfg(test)] mod tests { ... }` must move to a sibling tests/ module file');
    }
  });
  notes.push(`rust: ${prodCount} production files scanned`);
}

checkFrontendStructure();
checkRustStructure();

const byRule = violations.reduce((acc, v) => {
  acc[v.rule] = (acc[v.rule] || 0) + 1;
  return acc;
}, {});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ violations, notes, byRule }, null, 2));
} else {
  for (const note of notes) console.log(`✓ ${note}`);
  if (violations.length === 0) {
    console.log('✓ layering gate: no violations');
  } else {
    console.log('');
    for (const [rule, count] of Object.entries(byRule)) {
      console.log(`❌ ${rule}: ${count} violation(s)`);
      for (const v of violations.filter((x) => x.rule === rule)) {
        console.log(`   ${v.file}: ${v.message}`);
      }
    }
  }
}

process.exit(violations.length === 0 ? 0 : 1);
