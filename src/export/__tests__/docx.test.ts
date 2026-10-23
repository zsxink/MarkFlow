import { describe, it, expect, vi } from 'vitest';

// Mock only the Tauri-specific imports, not the docx library
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
// The engine/export layers report through `uiPorts` now, so tests register a
// fake port implementation instead of mocking the UI module directly.
const portFakes = vi.hoisted(() => ({ notify: vi.fn, showDiagramContextMenu: vi.fn(), showTableContextMenu: vi.fn(), showImageContextMenu: vi.fn(), refreshFrontmatter: vi.fn(), mountFrontmatter: vi.fn() }));
vi.mock('../../infra/ui-ports', () => ({
  uiPorts: portFakes,
  registerUiPorts: vi.fn(),
  resetUiPorts: vi.fn(),
}));
vi.mock('../../infra/logger', () => ({
  logException: vi.fn(),
  logDebug: vi.fn(),
  logInfo: vi.fn(),
}));

// Mock convertSvgToPngDataUrl to avoid canvas dependency in tests
vi.mock('../snapshot', () => ({
  convertSvgToPngDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,MOCK'),
}));

import { createDocxFromHtml } from '../docx';
import { buildExportTheme } from '../theme';

/**
 * Verify that the DOCX output is a valid ZIP/OOXML file:
 * - Starts with PK magic bytes (ZIP header)
 * - Contains [Content_Types].xml
 * - Contains word/document.xml
 */
function verifyDocxStructure(uint8: Uint8Array): void {
  // Check PK header (ZIP magic bytes: 0x50 0x4B)
  expect(uint8[0]).toBe(0x50); // 'P'
  expect(uint8[1]).toBe(0x4B); // 'K'

  // Convert to string to search for XML entries
  // ZIP files store filenames as UTF-8, so we can search for them
  const content = new TextDecoder('utf-8').decode(uint8);

  // Must contain [Content_Types].xml (OOXML standard entry)
  expect(content).toContain('[Content_Types].xml');

  // Must contain word/document.xml (the main document content)
  expect(content).toContain('word/document.xml');
}

describe('DOCX export with real Packer', () => {
  it('generates valid DOCX with toArrayBuffer from simple HTML', async () => {
    const html = '<h1>Hello World</h1><p>This is a test paragraph.</p>';
    const result = await createDocxFromHtml(html, 'Test Document');

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
    verifyDocxStructure(result);
  });

  it('generates valid DOCX with ExportTheme styles', async () => {
    const theme = buildExportTheme('dark');
    const html = '<h1>Dark Theme</h1><p>Testing dark theme export.</p>';
    const result = await createDocxFromHtml(html, 'Dark Theme Doc', theme);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
    verifyDocxStructure(result);
  });

  it('generates valid DOCX with headings, code blocks, and tables', async () => {
    const html = `
      <h1>Title</h1>
      <h2>Subtitle</h2>
      <p>Paragraph with <strong>bold</strong> and <em>italic</em>.</p>
      <pre><code>const x = 1;</code></pre>
      <table>
        <tr><th>Header 1</th><th>Header 2</th></tr>
        <tr><td>Cell 1</td><td>Cell 2</td></tr>
      </table>
      <blockquote>A quote</blockquote>
      <ul><li>Item 1</li><li>Item 2</li></ul>
    `;
    const result = await createDocxFromHtml(html, 'Full Document');

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(500); // Should have substantial content
    verifyDocxStructure(result);
  });

  it('generates valid DOCX with blockquote and list', async () => {
    const html = `
      <blockquote>Important note</blockquote>
      <ol><li>First</li><li>Second</li></ol>
    `;
    const result = await createDocxFromHtml(html, 'Lists and Quotes');

    expect(result).toBeInstanceOf(Uint8Array);
    verifyDocxStructure(result);
  });

  it('generates valid DOCX with light theme (default)', async () => {
    const html = '<p>Default light theme content.</p>';
    const result = await createDocxFromHtml(html, 'Light Theme');

    expect(result).toBeInstanceOf(Uint8Array);
    verifyDocxStructure(result);
  });
});
