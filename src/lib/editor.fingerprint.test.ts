import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import {
  semanticFingerprint,
  canonicalize,
  isSemanticallyEquivalent,
  CANONICALIZATIONS,
} from './editor.markdown.fingerprint';

const doc = (content: JSONContent[]): JSONContent => ({ type: 'doc', content });

describe('semantic fingerprint (6.3)', () => {
  it('ignores runtime-only image src, preserving alt/title', () => {
    const a = doc([
      { type: 'paragraph', content: [{ type: 'image', attrs: { src: 'asset://abc', alt: '图', title: 't' } }] },
    ]);
    const b = doc([
      { type: 'paragraph', content: [{ type: 'image', attrs: { src: 'asset://xyz', alt: '图', title: 't' } }] },
    ]);
    expect(semanticFingerprint(a)).toBe(semanticFingerprint(b));
  });

  it('ignores table layout-only attributes (colgroup/colwidth)', () => {
    const withColgroup = doc([
      { type: 'table', attrs: { colgroup: [1, 1], colwidth: [10, 20] }, content: [] },
    ]);
    const without = doc([{ type: 'table', content: [] }]);
    expect(semanticFingerprint(withColgroup)).toBe(semanticFingerprint(without));
  });

  it('ignores data-* runtime attributes', () => {
    const a = doc([{ type: 'paragraph', attrs: { 'data-pos': 4 }, content: [{ type: 'text', text: 'hi' }] }]);
    const b = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }]);
    expect(semanticFingerprint(a)).toBe(semanticFingerprint(b));
  });

  it('is stable across key ordering (sorted keys)', () => {
    const a: JSONContent = { type: 'paragraph', attrs: { title: 'x' }, content: [{ type: 'text', text: 'hi' }] };
    const b: JSONContent = { content: [{ type: 'text', text: 'hi' }], attrs: { title: 'x' }, type: 'paragraph' };
    expect(semanticFingerprint(a)).toBe(semanticFingerprint(b));
  });

  it('differs when authored content changes', () => {
    const a = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }]);
    const b = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'world' }] }]);
    expect(semanticFingerprint(a)).not.toBe(semanticFingerprint(b));
  });

  it('differs when block order changes', () => {
    const a = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
    ]);
    const b = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
    ]);
    expect(semanticFingerprint(a)).not.toBe(semanticFingerprint(b));
  });

  it('differs when an authored attribute changes (link href)', () => {
    const a = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: '/a' } }] }] },
    ]);
    const b = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: '/b' } }] }] },
    ]);
    expect(semanticFingerprint(a)).not.toBe(semanticFingerprint(b));
  });

  it('differs when a table cell value changes', () => {
    const cell = (t: string): JSONContent => ({
      type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
    });
    const a = doc([{ type: 'table', content: [{ type: 'tableRow', content: [cell('A'), cell('1')] }] }]);
    const b = doc([{ type: 'table', content: [{ type: 'tableRow', content: [cell('A'), cell('2')] }] }]);
    expect(semanticFingerprint(a)).not.toBe(semanticFingerprint(b));
  });
});

describe('canonicalization policy (6.3)', () => {
  it('registers the documented canonicalization names', () => {
    expect(CANONICALIZATIONS).toEqual([
      'list-continuation-indent',
      'table-column-padding',
      'table-pipe-escaping',
      'code-trailing-newline',
      'file-tail-newline',
      'link-href-escaping',
      'soft-break-normalization',
    ]);
  });

  it('treats an EOF trailing blank line as an allowed difference', () => {
    expect(canonicalize('a\n')).toBe(canonicalize('a\n\n'));
    expect(isSemanticallyEquivalent('a\n', 'a\n')).toBe(true);
    expect(isSemanticallyEquivalent('a\n', 'a\n\n')).toBe(true);
  });

  it('does not treat real content changes as allowed', () => {
    expect(isSemanticallyEquivalent('a\n', 'b\n')).toBe(false);
    expect(isSemanticallyEquivalent('line one', 'line one two')).toBe(false);
  });
});
