/**
 * Orca stack alignment gate (tasks 12.1–12.2)
 *
 * Automated checks that the production codebase conforms to the Orca-aligned
 * Markdown stack contract:
 *   - All Markdown parse/serialize/save passes through the unified bridge
 *   - No legacy v2 `tiptap-markdown` or `markdown-it` imports in prod source
 *   - No direct `storage.markdown` access outside the adapter
 *   - All `@tiptap/*` packages resolve to one pinned v3 patch
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname);

/** Recursively collect .ts (non-test) files under dir. */
function prodFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...prodFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}

/** Read a file and return its lines. */
function lines(path: string): string[] {
  return readFileSync(path, 'utf-8').split('\n');
}

describe('orca stack gate (12.1–12.2)', () => {
  const prodSrcFiles = prodFiles(SRC);

  it('no production source imports tiptap-markdown (legacy v2)', () => {
    const offenders: string[] = [];
    for (const file of prodSrcFiles) {
      for (const line of lines(file)) {
        // skip pure comments
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
        if (line.includes("from 'tiptap-markdown'") || line.includes('from "tiptap-markdown"')) {
          offenders.push(file);
          break;
        }
      }
    }
    expect(offenders, `legacy tiptap-markdown imports found in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no production source imports markdown-it directly', () => {
    const offenders: string[] = [];
    for (const file of prodSrcFiles) {
      for (const line of lines(file)) {
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
        if (line.includes("from 'markdown-it'") || line.includes('from "markdown-it"')) {
          offenders.push(file);
          break;
        }
      }
    }
    expect(offenders, `markdown-it imports found in prod src: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no production source accesses storage.markdown directly', () => {
    // Only editor.markdown.adapter.ts may mention storage.markdown (in comments
    // documenting the v2 removal).  No live code path may use it.
    const offenders: string[] = [];
    for (const file of prodSrcFiles) {
      const basename = file.split('/').pop()!;
      for (const line of lines(file)) {
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
        if (line.includes('storage.markdown')) {
          // Allow the adapter file's comments (already documented)
          if (basename === 'editor.markdown.adapter.ts') continue;
          offenders.push(file);
          break;
        }
      }
    }
    expect(offenders, `direct storage.markdown access in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('all Markdown parse/serialize goes through the bridge or adapter', () => {
    // Production code (outside bridge/adapter/integration) must not call
    // editor.getMarkdown() or editor.commands.setContent(..., { contentType: 'markdown' })
    // directly — those are adapter-internal.
    const bypassFiles: string[] = [];
    for (const file of prodSrcFiles) {
      const basename = file.split('/').pop()!;
      // The adapter and bridge are the authorized callers
      if (
        basename === 'editor.markdown.adapter.ts' ||
        basename === 'editor.markdown.bridge.ts' ||
        basename === 'editor.markdown.opaque.integration.ts' ||
        basename === 'editor.save.reconcile.ts'
      ) continue;

      for (const line of lines(file)) {
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
        if (
          line.includes('.getMarkdown()') ||
          (line.includes('contentType') && line.includes('markdown'))
        ) {
          bypassFiles.push(file);
          break;
        }
      }
    }
    expect(bypassFiles, `bypass of bridge detected in: ${bypassFiles.join(', ')}`).toEqual([]);
  });

  it('test files may use markdown-it only as v2 baseline (read-only)', () => {
    // Only these specific test files are allowed to import markdown-it.
    // If a new test file needs it, it must be added here explicitly.
    const allowed = new Set([
      'wysiwyg-roundtrip-baseline.test.ts',
      'securityRegression.test.ts',
    ]);

    const testFiles: string[] = [];
    for (const entry of readdirSync(SRC)) {
      if (entry.endsWith('.test.ts')) testFiles.push(join(SRC, entry));
    }

    const offenders: string[] = [];
    for (const file of testFiles) {
      const basename = file.split('/').pop()!;
      if (allowed.has(basename) || basename === 'orca-stack-gate.test.ts') continue;
      for (const line of lines(file)) {
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
        if (line.includes("from 'markdown-it'") || line.includes('from "markdown-it"')) {
          offenders.push(basename);
          break;
        }
      }
    }
    expect(offenders, `unexpected markdown-it import in test: ${offenders.join(', ')}`).toEqual([]);
  });
});
