import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

const md = new MarkdownIt();

/**
 * Regression tests for known CVEs in markdown-it / linkify-it / dompurify.
 * These verify that malicious or adversarial Markdown input does NOT cause
 * excessive CPU usage (quadratic complexity) or XSS.
 */

describe('Security regression: linkify-it DoS (GHSA-22p9-wv53-3rq4)', () => {
  // linkify-it's O(n²) match() only runs when linkify: true.
  const mdLinkify = new MarkdownIt({ linkify: true });

  it('parses 10 000-char URL without blocking', () => {
    // linkify-it <= 5.0.0 had O(n²) complexity scanning long URLs.
    // After upgrading to 5.0.2 this should complete in < 500 ms.
    const longUrl = 'https://example.com/' + 'a'.repeat(10_000);
    const input = `Click here: ${longUrl}`;

    const start = performance.now();
    const html = mdLinkify.render(input);
    const elapsed = performance.now() - start;

    expect(html).toContain(longUrl);
    expect(elapsed).toBeLessThan(500);
  });

  it('parses many short links without excessive time', () => {
    const links = Array.from({ length: 1000 }, (_, i) => `[link${i}](https://example.com/${i})`).join('\n');
    const start = performance.now();
    mdLinkify.render(links);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });
});

describe('Security regression: markdown-it smartquotes DoS (GHSA-6v5v-wf23-fmfq)', () => {
  // Smartquotes rule only runs when typographer: true.
  const mdTypo = new MarkdownIt({ typographer: true });

  it('parses repeated smartquote triggers without blocking', () => {
    // Smartquotes rule in markdown-it <= 14.1.1 had O(n²) with certain
    // Unicode quote combinations.
    // \u201c \u201d = curly double quotes, \u2018 \u2019 = curly single quotes
    const evil = '\u201c\u201d\u201c\u2018\u2019'.repeat(5000);
    const input = `Text ${evil} more text`;

    const start = performance.now();
    const html = mdTypo.render(input);
    const elapsed = performance.now() - start;

    expect(html).toBeTruthy();
    expect(elapsed).toBeLessThan(500);
  });

  it('parses mixed quote styles without excessive time', () => {
    const lines = Array.from(
      { length: 2000 },
      (_, i) => `\u201cline ${i}\u201d and \u201cline ${i}\u201d`,
    ).join('\n');

    const start = performance.now();
    mdTypo.render(lines);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });
});

describe('Security regression: dompurify XSS (GHSA-x4vx-rjvf-j5p4 etc.)', () => {
  // happy-dom provides window globally; DOMPurify needs it for sanitization.
  // Note: happy-dom has limited DOM support, so some sanitization behaviors
  // differ from a real browser. These tests verify the core sanitization
  // functions work with the upgraded version.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const purify = DOMPurify(window as any);

  it('sanitizes SVG event handlers', () => {
    const malicious = '<svg onload="alert(1)"><circle r="50"/></svg>';
    const clean = purify.sanitize(malicious);

    expect(clean).not.toContain('onload');
    expect(clean).not.toContain('alert');
  });

  it('sanitizes javascript: URLs', () => {
    const malicious = '<a href="javascript:alert(1)">click</a>';
    const clean = purify.sanitize(malicious);

    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('click');
  });

  it('sanitize function is callable and returns string', () => {
    const result = purify.sanitize('<p>hello</p>');
    expect(typeof result).toBe('string');
    expect(result).toContain('hello');
  });
});
