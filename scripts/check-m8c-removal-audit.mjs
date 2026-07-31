#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PRODUCT_DIRS = ['src', 'src-tauri', 'markflow-core'];
const PRODUCT_FILES = ['package.json'];
const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.js',
  '.json',
  '.mjs',
  '.rs',
  '.ts',
  '.tsx',
]);

const RULES = [
  {
    id: 'tiptap-markdown-product-dependency',
    pattern: /\btiptap-markdown\b/,
    message: 'tiptap-markdown remains in a product dependency or import path',
  },
  {
    id: 'prosemirror-markdown-serializer-save',
    pattern: /\.storage\.markdown\.getMarkdown\s*\(/,
    message: 'ProseMirror markdown serializer is still called from a product path',
  },
  {
    id: 'get-markdown-save-fallback',
    pattern: /\bgetMarkdown\s*\(/,
    message: 'getMarkdown() remains in a product path and must not be used as save fallback',
  },
  {
    id: 'dom-export-snapshot-main-path',
    pattern: /\bbuildExportSnapshot\s*\(|Using legacy DOM export snapshot|legacy DOM export fallback/,
    message: 'DOM-based export snapshot remains in a product path',
  },
  {
    id: 'legacy-allowlist-active-path',
    pattern: /legacy\s+allowlist|legacyAllowlist|LEGACY_ALLOWLIST/,
    message: 'legacy allowlist remains in an active product path',
  },
];

const EXCLUDED_PATH_PATTERNS = [
  /(^|\/)node_modules\//,
  /(^|\/)target\//,
  /(^|\/)dist\//,
  /(^|\/)src-tauri\/target\//,
  /(^|\/)markflow-core\/target\//,
  /(^|\/)__fixtures__\//,
  /(^|\/)fixtures\//,
  /(^|\/)tests?\//,
  /\.test\.[cm]?[tj]sx?$/,
  /\.spec\.[cm]?[tj]sx?$/,
  /(^|\/)docs\//,
  /(^|\/)openspec\//,
];

function isExcluded(relativePath) {
  return EXCLUDED_PATH_PATTERNS.some(pattern => pattern.test(relativePath));
}

function isTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath));
}

function collectFiles(root, relativePath = '') {
  const absolutePath = path.join(root, relativePath);
  const entries = readdirSync(absolutePath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const childRelativePath = path.join(relativePath, entry.name);
    if (isExcluded(childRelativePath)) continue;
    if (entry.isDirectory()) {
      files.push(...collectFiles(root, childRelativePath));
    } else if (entry.isFile() && isTextFile(childRelativePath)) {
      files.push(childRelativePath);
    }
  }
  return files;
}

function productFiles(root) {
  const files = [];
  for (const file of PRODUCT_FILES) {
    try {
      readFileSync(path.join(root, file));
      files.push(file);
    } catch {
      // Optional in self-test fixtures.
    }
  }
  for (const dir of PRODUCT_DIRS) {
    try {
      files.push(...collectFiles(root, dir));
    } catch {
      // Optional in self-test fixtures.
    }
  }
  return files;
}

function lineAndColumn(content, index) {
  const prefix = content.slice(0, index);
  const lines = prefix.split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function runAudit(root) {
  const findings = [];
  for (const relativePath of productFiles(root)) {
    const content = readFileSync(path.join(root, relativePath), 'utf8');
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(content);
      if (!match) continue;
      const location = lineAndColumn(content, match.index);
      findings.push({
        rule: rule.id,
        message: rule.message,
        path: relativePath,
        line: location.line,
        column: location.column,
        match: match[0],
      });
    }
  }
  return findings;
}

function formatFinding(finding) {
  return `${finding.path}:${finding.line}:${finding.column} ${finding.rule}: ${finding.message} (${JSON.stringify(finding.match)})`;
}

function writeFixtureFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function runSelfTest() {
  const root = mkdtempSync(path.join(tmpdir(), 'markflow-m8c-audit-'));
  try {
    writeFixtureFile(root, 'src/main.ts', 'editor.storage.markdown.getMarkdown();\n');
    writeFixtureFile(root, 'src/lib/exportSnapshot.ts', 'export function buildExportSnapshot() {}\n');
    writeFixtureFile(root, 'docs/migration.md', 'legacy DOM export fallback and getMarkdown() are historical notes.\n');
    writeFixtureFile(root, 'openspec/archive/change/spec.md', 'tiptap-markdown legacy allowlist history.\n');
    writeFixtureFile(root, 'src/lib/exportSnapshot.test.ts', 'buildExportSnapshot(); getMarkdown();\n');

    const findings = runAudit(root);
    const rules = findings.map(finding => finding.rule);
    if (!rules.includes('prosemirror-markdown-serializer-save')) {
      throw new Error('self-test expected ProseMirror serializer finding');
    }
    if (!rules.includes('dom-export-snapshot-main-path')) {
      throw new Error('self-test expected DOM export finding');
    }
    if (findings.some(finding => finding.path.startsWith('docs/') || finding.path.startsWith('openspec/') || finding.path.endsWith('.test.ts'))) {
      throw new Error('self-test expected docs, OpenSpec records, and test files to be excluded');
    }
    console.log('M8C removal audit self-test passed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const findings = runAudit(process.cwd());
  if (findings.length > 0) {
    console.error('M8C removal audit failed: legacy document-truth paths remain in product code.');
    for (const finding of findings) {
      console.error(`- ${formatFinding(finding)}`);
    }
    process.exit(1);
  }
  console.log('M8C removal audit passed');
}
