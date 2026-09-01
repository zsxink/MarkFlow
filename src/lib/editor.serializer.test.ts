import { describe, expect, it, beforeEach } from 'vitest';
import {
  normalizeImageMarkdown,
  replaceAssetUrlsWithOriginal,
} from './editor.serializer';
import { assetToOriginalMap } from './editor.state';

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

  it('preserves user-entered consecutive blank lines (does not collapse)', () => {
    const input = 'a\n\n\n\n\nb';
    const result = normalizeImageMarkdown(input);
    // Global 3+ newline compression is removed; user blank lines are preserved.
    expect(result).toBe('a\n\n\n\n\nb');
  });

  it('preserves content inside code fences (no collapsing of newlines)', () => {
    const input = '```\n\n\n\ncode\n```';
    const result = normalizeImageMarkdown(input);
    expect(result).toBe('```\n\n\n\ncode\n```');
  });

  it('handles multiple standalone images in a row', () => {
    const input = '![a](a.png)\n![b](b.png)';
    const result = normalizeImageMarkdown(input);
    // First image is at start → no blank before; images separated by a blank.
    // No trailing blank entry because there is no content after the last image.
    expect(result).toBe('![a](a.png)\n\n![b](b.png)');
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

  // -- Empty line preservation (Issue #154) --------------------------------

  it('preserves user-entered consecutive blank lines without images', () => {
    const input = '第 1 行\n\n\n第 2 行（前面有两个空行）\n\n第 3 行';
    const result = normalizeImageMarkdown(input);
    // No images → no changes (CRLF normalization aside)
    expect(result).toBe(input);
  });

  it('preserves blank lines around regular text before and after an image', () => {
    const input = 'a\n\n\n\n\n![img](i.png)\n\n\n\n\nb';
    const result = normalizeImageMarkdown(input);
    // Image gets a blank line before (only one needed) and after.
    // User-entered triple-blanks before the image are preserved.
    expect(result).toBe('a\n\n\n\n\n![img](i.png)\n\n\n\n\nb');
  });

  it('preserves blank lines around images in code fences', () => {
    const input = '```\n![img](i.png)\n\n\n\ncode\n```';
    const result = normalizeImageMarkdown(input);
    // Code fence content is never touched
    expect(result).toBe('```\n![img](i.png)\n\n\n\ncode\n```');
  });

  it('preserves multiple images with user-entered spacing', () => {
    const input = 'a\n\n![1](a.png)\n\n\n![2](b.png)\n\nb';
    const result = normalizeImageMarkdown(input);
    // User-entered blank lines between images are preserved (not collapsed).
    // Each image already has a blank line after it, so no extra blanks added.
    expect(result).toBe('a\n\n![1](a.png)\n\n\n![2](b.png)\n\nb');
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
