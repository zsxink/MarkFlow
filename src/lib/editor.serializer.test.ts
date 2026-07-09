import { describe, expect, it, beforeEach } from 'vitest';
import {
  normalizeImageMarkdown,
  replaceAssetUrlsWithOriginal,
  extractDocAsFallback,
} from './editor.serializer';
import { assetToOriginalMap } from './editor.state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal ProseMirror-like Node mock suitable for extractDocAsFallback.
 */
function makeDoc(children: Array<{
  type: string;
  textContent?: string;
  attrs?: Record<string, unknown>;
  children?: Array<{ textContent: string; attrs?: Record<string, unknown> }>;
}>) {
  return {
    forEach(fn: (node: Record<string, unknown>) => void) {
      for (const child of children) {
        const node: Record<string, unknown> = {
          type: { name: child.type },
          textContent: child.textContent ?? '',
          attrs: child.attrs ?? {},
        };
        // List-like nodes use forEach to iterate their items
        if (child.children) {
          node.forEach = (itemFn: (item: Record<string, unknown>, pos: number) => void) => {
            for (const item of child.children) {
              itemFn(
                {
                  textContent: item.textContent,
                  attrs: item.attrs ?? {},
                },
                0,
              );
            }
          };
        }
        fn(node, 0);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

beforeEach(() => {
  assetToOriginalMap.clear();
});

describe('replaceAssetUrlsWithOriginal', () => {
  it('replaces asset URLs when the map has entries', () => {
    assetToOriginalMap.set('asset://abc123', 'images/photo.png');
    assetToOriginalMap.set('asset://def456', 'images/logo.svg');

    const result = replaceAssetUrlsWithOriginal(
      '![photo](asset://abc123) ![logo](asset://def456)',
    );

    expect(result).toBe('![photo](images/photo.png) ![logo](images/logo.svg)');
  });

  it('returns the markdown unchanged when the map is empty', () => {
    const input = '![photo](images/photo.png)';
    expect(replaceAssetUrlsWithOriginal(input)).toBe(input);
  });

  it('handles multiple occurrences of the same asset URL', () => {
    assetToOriginalMap.set('asset://abc123', 'images/photo.png');

    const result = replaceAssetUrlsWithOriginal(
      '![a](asset://abc123) text ![b](asset://abc123)',
    );

    expect(result).toBe('![a](images/photo.png) text ![b](images/photo.png)');
  });

  it('handles asset URLs that are substrings of other URLs', () => {
    assetToOriginalMap.set('asset://abc', 'images/a.png');

    const result = replaceAssetUrlsWithOriginal(
      '![a](asset://abc) ![ab](asset://abc123)',
    );

    // `new RegExp(escaped, 'g')` performs literal substring matching after
    // escaping regex special characters. `asset://abc` still matches inside
    // `asset://abc123` because no word boundaries are enforced.
    expect(result).toBe('![a](images/a.png) ![ab](images/a.png123)');
  });

  it('escapes regex special characters in asset URLs', () => {
    assetToOriginalMap.set('asset://img/photo(1).png?size=300', 'images/photo.png');

    const result = replaceAssetUrlsWithOriginal(
      '![photo](asset://img/photo(1).png?size=300)',
    );

    expect(result).toBe('![photo](images/photo.png)');
  });
});

describe('normalizeImageMarkdown', () => {
  // -- fixImageNewlines behaviour -----------------------------------------

  it('wraps a standalone image with blank lines', () => {
    const input = 'text\n![alt](img.png)\nmore';
    const result = normalizeImageMarkdown(input);
    expect(result).toBe('text\n\n![alt](img.png)\n\nmore');
  });

  it('does not add a blank line before an image at the very start', () => {
    const input = '![alt](img.png)\n\ncontent';
    const result = normalizeImageMarkdown(input);
    expect(result).toBe('![alt](img.png)\n\ncontent');
  });

  it('collapses three or more consecutive blank lines to two', () => {
    const input = 'a\n\n\n\n\nb';
    const result = normalizeImageMarkdown(input);
    expect(result).toBe('a\n\nb');
  });

  it('preserves content inside code fences (no collapsing of newlines)', () => {
    const input = '```\n\n\n\ncode\n```';
    const result = normalizeImageMarkdown(input);
    expect(result).toBe('```\n\n\n\ncode\n```');
  });

  it('handles multiple standalone images in a row', () => {
    const input = '![a](a.png)\n![b](b.png)';
    const result = normalizeImageMarkdown(input);
    // First image is at start → no blank before; each image gets blank after.
    // join produces a trailing newline from the final blank entry.
    expect(result).toBe('![a](a.png)\n\n![b](b.png)\n');
  });

  it('trims trailing whitespace from image lines', () => {
    const input = 'text\n\n![alt](img.png)  \n\nmore';
    const result = normalizeImageMarkdown(input);
    expect(result).toContain('![alt](img.png)');
    // The trimmed image line should not have trailing spaces.
    const lines = result.split('\n');
    const imgLine = lines.find((l) => l.startsWith('!['));
    expect(imgLine).toBe('![alt](img.png)');
  });

  // -- fixCorruptedImageNewlines behaviour --------------------------------

  it('separates a heading glued directly after an image', () => {
    const input = 'text\n![alt](img.png)# Heading\nmore';
    const result = normalizeImageMarkdown(input);
    expect(result).toContain('![alt](img.png)\n\n# Heading');
  });

  it('separates a heading with backslash-escaped space after an image', () => {
    const input = 'text\n![alt](img.png) \\ # Heading\nmore';
    const result = normalizeImageMarkdown(input);
    expect(result).toContain('![alt](img.png)\n\n# Heading');
  });

  it('works with deeper heading levels', () => {
    const input = '![alt](img.png)### Subheading';
    const result = normalizeImageMarkdown(input);
    expect(result).toContain('![alt](img.png)\n\n### Subheading');
  });

  // -- \\r\\n normalisation ------------------------------------------------

  it('normalises Windows-style CRLF line endings', () => {
    const input = 'text\r\n![alt](img.png)\r\nmore';
    const result = normalizeImageMarkdown(input);
    expect(result).toBe('text\n\n![alt](img.png)\n\nmore');
  });

  it('handles mixed line endings gracefully', () => {
    const input = 'a\r\n![alt](img.png)\nmore';
    const result = normalizeImageMarkdown(input);
    expect(result).toBe('a\n\n![alt](img.png)\n\nmore');
  });
});

describe('extractDocAsFallback', () => {
  it('renders a paragraph node', () => {
    const doc = makeDoc([{ type: 'paragraph', textContent: 'Hello world' }]);
    expect(extractDocAsFallback(doc as any)).toBe('Hello world');
  });

  it('renders a heading node with the correct level', () => {
    const doc = makeDoc([
      { type: 'heading', textContent: 'Title', attrs: { level: 2 } },
    ]);
    expect(extractDocAsFallback(doc as any)).toBe('## Title');
  });

  it('defaults to level 1 when heading level is missing', () => {
    const doc = makeDoc([{ type: 'heading', textContent: 'Big Title' }]);
    expect(extractDocAsFallback(doc as any)).toBe('# Big Title');
  });

  it('renders a bulletList node', () => {
    const doc = makeDoc([
      {
        type: 'bulletList',
        children: [
          { textContent: 'Apple' },
          { textContent: 'Banana' },
        ],
      },
    ]);
    expect(extractDocAsFallback(doc as any)).toBe('- Apple\n\n- Banana');
  });

  it('renders an orderedList node', () => {
    const doc = makeDoc([
      {
        type: 'orderedList',
        children: [
          { textContent: 'First' },
          { textContent: 'Second' },
        ],
      },
    ]);
    expect(extractDocAsFallback(doc as any)).toBe('1. First\n\n1. Second');
  });

  it('renders a taskList node with checked/unchecked items', () => {
    const doc = makeDoc([
      {
        type: 'taskList',
        children: [
          { textContent: 'Done', attrs: { checked: true } },
          { textContent: 'Todo', attrs: { checked: false } },
        ],
      },
    ]);
    expect(extractDocAsFallback(doc as any)).toBe('- [x] Done\n\n- [ ] Todo');
  });

  it('renders a blockquote node', () => {
    const doc = makeDoc([{ type: 'blockquote', textContent: 'Cited text' }]);
    expect(extractDocAsFallback(doc as any)).toBe('> Cited text');
  });

  it('renders a codeBlock node', () => {
    const doc = makeDoc([{ type: 'codeBlock', textContent: 'const x = 1;' }]);
    // extractDocAsFallback joins all lines with \n\n
    expect(extractDocAsFallback(doc as any)).toBe('```\n\nconst x = 1;\n\n```');
  });

  it('renders an unknown node type using textContent', () => {
    const doc = makeDoc([{ type: 'mention', textContent: '@user' }]);
    expect(extractDocAsFallback(doc as any)).toBe('@user');
  });

  it('produces empty string for a node with empty textContent (unknown)', () => {
    const doc = makeDoc([{ type: 'horizontalRule' }]);
    expect(extractDocAsFallback(doc as any)).toBe('');
  });

  it('joins multiple top-level nodes with double newlines', () => {
    const doc = makeDoc([
      { type: 'paragraph', textContent: 'First' },
      { type: 'paragraph', textContent: 'Second' },
    ]);
    expect(extractDocAsFallback(doc as any)).toBe('First\n\nSecond');
  });
});
