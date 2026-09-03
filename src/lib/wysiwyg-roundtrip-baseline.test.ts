import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import {
  FIXTURE_CATEGORIES,
  WYSIWYG_ROUNDTRIP_FIXTURES,
} from './wysiwyg-roundtrip.fixtures';

const parser = new MarkdownIt({ html: false, breaks: false, linkify: false, typographer: false });

function tokenSignature(markdown: string): string[] {
  return parser.parse(markdown, {}).map((token: any) => `${token.type}:${token.tag}:${token.nesting}:${token.map?.join('-') ?? ''}`);
}

describe('fixed WYSIWYG round-trip corpus', () => {
  it('contains normal and boundary fixtures for every required category', () => {
    for (const category of FIXTURE_CATEGORIES) {
      const fixtures = WYSIWYG_ROUNDTRIP_FIXTURES.filter(fixture => fixture.category === category);
      expect(fixtures, `${category} fixture count`).toHaveLength(2);
      expect(fixtures.some(fixture => fixture.boundary === 'normal')).toBe(true);
      expect(fixtures.some(fixture => fixture.boundary === 'edge')).toBe(true);
    }
  });

  it('has stable unique ids, non-empty source, and explicit v2 notes', () => {
    const ids = new Set<string>();
    for (const fixture of WYSIWYG_ROUNDTRIP_FIXTURES) {
      expect(ids.has(fixture.id)).toBe(false);
      ids.add(fixture.id);
      expect(fixture.markdown.length, fixture.id).toBeGreaterThan(0);
      expect(Array.isArray(fixture.knownV2Differences), fixture.id).toBe(true);
    }
  });

  it('produces a repeatable v2 parser structure signature', () => {
    const first = WYSIWYG_ROUNDTRIP_FIXTURES.map(fixture => [fixture.id, tokenSignature(fixture.markdown)]);
    const second = WYSIWYG_ROUNDTRIP_FIXTURES.map(fixture => [fixture.id, tokenSignature(fixture.markdown)]);
    expect(second).toEqual(first);
    expect(first.every(([, signature]) => signature.length > 0)).toBe(true);
  });

  it('does not claim v3 output in the v2 baseline', () => {
    expect(WYSIWYG_ROUNDTRIP_FIXTURES.every(fixture => !('v3' in fixture))).toBe(true);
  });
});

describe('v2 baseline observations', () => {
  it.each(WYSIWYG_ROUNDTRIP_FIXTURES)('$id records parse and rendered output', fixture => {
    const tokens = parser.parse(fixture.markdown, {});
    const rendered = parser.render(fixture.markdown);
    expect(tokens.length).toBeGreaterThan(0);
    expect(typeof rendered).toBe('string');
    expect(rendered.length).toBeGreaterThan(0);
  });
});
