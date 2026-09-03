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

  it('normalizes parser-path-only default attributes', () => {
    const withDefaults = doc([
      {
        type: 'orderedList',
        attrs: { start: 1, type: null },
        content: [{
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'link',
              marks: [{
                type: 'link',
                attrs: {
                  href: '/a', title: null, class: null,
                  rel: 'noopener noreferrer nofollow', target: '_blank',
                },
              }],
            }],
          }],
        }],
      },
      {
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [{
            type: 'tableCell',
            attrs: { colspan: 1, rowspan: 1 },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
          }],
        }],
      },
      { type: 'image', attrs: { src: 'asset://a', alt: 'a', width: null, height: null } },
    ]);
    const omittedDefaults = doc([
      {
        type: 'orderedList',
        content: [{
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: '/a' } }],
            }],
          }],
        }],
      },
      {
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [{
            type: 'tableCell',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
          }],
        }],
      },
      { type: 'image', attrs: { src: 'asset://b', alt: 'a' } },
    ]);

    expect(semanticFingerprint(withDefaults)).toBe(semanticFingerprint(omittedDefaults));
  });

  it('normalizes mark-set order but preserves mark membership and range', () => {
    const boldItalic = doc([{
      type: 'paragraph',
      content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }, { type: 'italic' }] }],
    }]);
    const italicBold = doc([{
      type: 'paragraph',
      content: [{ type: 'text', text: 'x', marks: [{ type: 'italic' }, { type: 'bold' }] }],
    }]);
    const boldOnly = doc([{
      type: 'paragraph',
      content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }],
    }]);

    expect(semanticFingerprint(boldItalic)).toBe(semanticFingerprint(italicBold));
    expect(semanticFingerprint(boldItalic)).not.toBe(semanticFingerprint(boldOnly));
  });

  it('preserves non-default table spans and authored link attributes', () => {
    const base = doc([{
      type: 'tableCell',
      attrs: { colspan: 1, rowspan: 1 },
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: '/a', title: 'A' } }],
        }],
      }],
    }]);
    const merged = doc([{
      type: 'tableCell',
      attrs: { colspan: 2, rowspan: 1 },
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: '/b', title: 'B' } }],
        }],
      }],
    }]);

    expect(semanticFingerprint(base)).not.toBe(semanticFingerprint(merged));
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
