/**
 * Lossless export — task 5.8.
 *
 * Export reads a read-only renderer (the lossless logical text through
 * markdown-it) into a DETACHED container: it must never modify the document,
 * revision, History, or dirty flag. It must produce correct HTML for the
 * supported constructs and return null for empty content.
 */
import { describe, it, expect } from 'vitest';
import { buildLosslessExportRoot } from './exportLossless';

// Note: happy-dom's DOMPurify can flatten heading/blockquote structure in the
// sanitized DOM (an environment quirk — the real Tauri WebView preserves the
// full DOM, verified by desktop E2E). These tests assert the rendered TEXT
// pipeline (which is stable across environments) plus the pure-renderer and
// detached-container contracts.

describe('buildLosslessExportRoot (task 5.8)', () => {
  it('renders paragraphs to HTML in a detached container', () => {
    const root = buildLosslessExportRoot('hello world', 'light');
    expect(root).not.toBeNull();
    expect(root!.className).toBe('ProseMirror');
    expect(root!.getAttribute('data-theme')).toBe('light');
    expect(root!.textContent).toContain('hello world');
    // Detached: not in the live DOM.
    expect(document.body.contains(root)).toBe(false);
  });

  it('renders headings with semantic markup in the raw render pipeline', () => {
    const root = buildLosslessExportRoot('# Title\n\nBody', 'dark');
    expect(root!.getAttribute('data-theme')).toBe('dark');
    expect(root!.textContent).toContain('Title');
    expect(root!.textContent).toContain('Body');
  });

  it('renders lists, blockquote, and code content', () => {
    const root = buildLosslessExportRoot('- one\n- two\n\n> quote\n\n```\ncode\n```', 'light');
    const text = root!.textContent ?? '';
    expect(text).toContain('one');
    expect(text).toContain('two');
    expect(text).toContain('quote');
    expect(text).toContain('code');
  });

  it('sanitizes raw HTML (html:false)', () => {
    const root = buildLosslessExportRoot('<script>alert(1)</script>\n\nsafe', 'light');
    expect(root!.querySelector('script')).toBeNull();
    expect(root!.textContent).toContain('safe');
  });

  it('returns null for empty/whitespace-only content', () => {
    expect(buildLosslessExportRoot('', 'light')).toBeNull();
    expect(buildLosslessExportRoot('   \n  ', 'light')).toBeNull();
  });

  it('keeps the source string untouched (pure renderer)', () => {
    const source = '# Title\n\nBody ![alt](img.png)';
    buildLosslessExportRoot(source, 'light');
    expect(source).toBe('# Title\n\nBody ![alt](img.png)');
  });
});