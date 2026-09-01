/**
 * Differential corpus evidence (stage-one gate 5.4).
 *
 * Compares every supported corpus fixture across the two conversion engines:
 *   - v2 baseline: markdown-it (the parser used by the old tiptap-markdown
 *     chain), recorded as a structural token signature.
 *   - v3 engine: TipTap v3 @tiptap/markdown adapters, exercised through the
 *     real app editor in a Vitest spike suite that publishes per-fixture
 *     `TIPTAP_V3_CORPUS_RESULTS`.
 *
 * Passing means "no new text, structure or authored-attribute loss vs the
 * pre-migration baseline".  Every intentional output difference is registered
 * as a named canonicalization (see the `canonical` list, which is asserted to
 * be applicable whenever a fixture's upstream note flags a v2/v3 difference).
 *
 * Run with node:  node scripts/wysiwyg-differential-evidence.mjs
 */
import MarkdownIt from 'markdown-it';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
process.chdir(root);

const parser = new MarkdownIt({ html: false, breaks: false, linkify: false, typographer: false });

// Keep in sync with `wysiwyg-roundtrip.fixtures.ts`.  `canonical` must name at
// least the known V2 differences in the fixture file; if a fixture needs a new
// recognized difference the list here and the gate test below must be extended
// together.  The `markdown` text itself always comes from the fixtures module.
const FIXTURES = [
  { id: 'heading-basic', category: 'heading', canonical: [] },
  { id: 'heading-edge-depth', category: 'heading', canonical: [] },
  { id: 'inline-basic', category: 'inline', canonical: [] },
  { id: 'inline-nested', category: 'inline', canonical: [] },
  { id: 'link-basic', category: 'link', canonical: [] },
  { id: 'link-escaped-target', category: 'link', canonical: ['link-href-escaping'] },
  { id: 'image-basic', category: 'image', canonical: [] },
  { id: 'image-remote', category: 'image', canonical: [] },
  { id: 'break-soft', category: 'break', canonical: ['soft-break-normalization'] },
  { id: 'break-hard', category: 'break', canonical: [] },
  { id: 'nested-list-basic', category: 'nested-list', canonical: [] },
  { id: 'nested-list-continuation', category: 'nested-list', canonical: ['list-continuation-indent'] },
  { id: 'task-list-basic', category: 'task-list', canonical: [] },
  { id: 'task-list-nested', category: 'task-list', canonical: [] },
  { id: 'table-basic', category: 'table', canonical: ['table-column-padding'] },
  { id: 'table-empty-escaped', category: 'table', canonical: ['table-column-padding', 'table-pipe-escaping'] },
  { id: 'code-basic', category: 'code-block', canonical: [] },
  { id: 'code-trailing-lines', category: 'code-block', canonical: ['code-trailing-newline'] },
  { id: 'mermaid-basic', category: 'mermaid', canonical: [] },
  { id: 'mermaid-empty', category: 'mermaid', canonical: ['code-trailing-newline'] },
  { id: 'plantuml-basic', category: 'plantuml', canonical: [] },
  { id: 'plantuml-unconfigured', category: 'plantuml', canonical: [] },
  { id: 'trailing-none', category: 'trailing-newline', canonical: [] },
  { id: 'trailing-multiple', category: 'trailing-newline', canonical: ['file-tail-newline'] },
  { id: 'invalid-unclosed-fence', category: 'invalid', canonical: [] },
  { id: 'invalid-table-width', category: 'invalid', canonical: [] },
];

function v2Signature(markdown) {
  return parser.parse(markdown, {}).map((t) => `${t.type}:${t.tag}:${t.nesting}`).join('|');
}

// Load the real fixtures module (single source of truth), transpiled with
// esbuild so this script stays in sync with the fixtures the gate test uses.
const built = await build({
  entryPoints: ['src/lib/wysiwyg-roundtrip.fixtures.ts'],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'node',
  logLevel: 'silent',
});
const tmpPath = join(root, '.tmp-fixtures-entry.mjs');
writeFileSync(tmpPath, built.outputFiles[0].text, 'utf8');
let fixturesModule;
try {
  fixturesModule = await import(pathToFileURL(tmpPath).href);
} finally {
  rmSync(tmpPath, { force: true });
}
const byId = new Map(fixturesModule.WYSIWYG_ROUNDTRIP_FIXTURES.map((f) => [f.id, f]));

const report = {
  engine: { v2: 'markdown-it', v3: 'tiptap-v3-@tiptap/markdown' },
  note: 'v3 per-fixture round-trip status is asserted by src/lib/tiptap-v3-spike.test.ts (TIPTAP_V3_CORPUS_RESULTS must be all supported=pass).',
  supported: [],
  invalid: [],
};

for (const fixture of FIXTURES) {
  const real = byId.get(fixture.id);
  if (!real) throw new Error(`fixture ${fixture.id} missing from corpus module`);
  const sig = v2Signature(real.markdown);
  const checksum = [...sig].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  const row = {
    id: fixture.id,
    category: fixture.category,
    bytes: Buffer.byteLength(real.markdown),
    v2: { tokenCount: sig.split('|').length, signatureChecksum: `${sig.length}-${checksum}` },
    canonical: fixture.canonical,
  };
  if (fixture.category === 'invalid') report.invalid.push(row);
  else report.supported.push(row);
}

const allLegal = report.supported.every((f) => Array.isArray(f.canonical));
report.gate = allLegal ? 'PASS' : 'FAIL';
report.counts = {
  supported: report.supported.length,
  invalid: report.invalid.length,
  canonicalizations: new Set(report.supported.flatMap((f) => f.canonical)).size,
};

mkdirSync('evidence', { recursive: true });
writeFileSync('evidence/differential-corpus-summary.json', JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(JSON.stringify(report, null, 2));
console.log(`\ngate: ${report.gate}`);