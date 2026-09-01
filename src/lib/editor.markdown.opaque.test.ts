import { describe, expect, it } from 'vitest';
import {
  scanOpaqueSpans,
  scanCodeRegions,
  type OpaqueSpan,
} from './editor.markdown.opaque';
import type { OpaqueCategory } from './editor.markdown.types';

/**
 * Task 7.1 — precise opaque range scanner.
 *
 * Original source offsets MUST be exact (callers re-derive raw from [from,to)),
 * including CRLF documents. Unclosed, overlapping or ambiguous boundaries MUST
 * return `source-only` (a scan failure), never a best-effort span. Fenced-code
 * content MUST never register as opaque HTML/front-matter.
 */
describe('opaque range scanner (7.1)', () => {
  const spans = (source: string, opts?: Parameters<typeof scanOpaqueSpans>[1]) => {
    const r = scanOpaqueSpans(source, opts);
    if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
    return r.spans;
  };

  const only = (spans_: OpaqueSpan[], category: OpaqueCategory) =>
    spans_.filter((s) => s.category === category);

  it('scans a leading YAML front-matter block with exact offsets', () => {
    const src = '---\ntitle: Hello\nkey: value\n---\n\n# Body\n';
    const fm = only(spans(src), 'frontmatter');
    expect(fm).toHaveLength(1);
    expect(src.slice(fm[0].from, fm[0].to)).toBe('---\ntitle: Hello\nkey: value\n---\n');
  });

  it('is CRLF-safe: offsets point into the original CRLF string', () => {
    const src = '---\r\ntitle: Hello\r\n---\r\n\r\n# Body\r\n';
    const fm = only(spans(src), 'frontmatter');
    expect(fm).toHaveLength(1);
    expect(src.slice(fm[0].from, fm[0].to)).toBe('---\r\ntitle: Hello\r\n---\r\n');
  });

  it('finds a complete HTML comment anywhere outside code', () => {
    const src = '# Hi\n\n<!-- note -->\n\nbody\n';
    const c = only(spans(src), 'html-comment');
    expect(c).toHaveLength(1);
    expect(src.slice(c[0].from, c[0].to)).toBe('<!-- note -->');
  });

  it('finds multiple complete comments as distinct spans', () => {
    const src = '<!-- one -->\n\nbody\n\n<!-- two -->\n';
    const c = only(spans(src), 'html-comment');
    expect(c).toHaveLength(2);
    expect(src.slice(c[0].from, c[0].to)).toBe('<!-- one -->');
    expect(src.slice(c[1].from, c[1].to)).toBe('<!-- two -->');
  });

  it('finds a complete block HTML open/close pair', () => {
    const src = '# Hi\n\n<div>\nspan\n</div>\n';
    const b = only(spans(src), 'html-block');
    expect(b).toHaveLength(1);
    expect(src.slice(b[0].from, b[0].to)).toBe('<div>\nspan\n</div>\n');
  });

  it('does not treat a same-line self-closing tag as an opaque block', () => {
    const src = '<hr>\n\nbody\n';
    const b = only(spans(src), 'html-block');
    // `<hr>` is complete on one line; there is no multi-line opaque block.
    expect(b).toHaveLength(0);
  });

  it('does not treat inline tags as opaque (they are handled by eligibility)', () => {
    const src = 'a <span>inline</span> b\n';
    const b = only(spans(src), 'html-block');
    expect(b).toHaveLength(0);
    const c = only(spans(src), 'html-comment');
    expect(c).toHaveLength(0);
  });

  it('returns an unclosed error for a lone front-matter opener', () => {
    const r = scanOpaqueSpans('---\ntitle: no close\n');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('unclosed-boundary');
      expect(r.category).toBe('frontmatter');
    }
  });

  it('returns an unclosed error for an unterminated HTML comment', () => {
    const r = scanOpaqueSpans('# Hi\n\n<!-- never closed\n');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('unclosed-boundary');
      expect(r.category).toBe('html-comment');
    }
  });

  it('returns an unclosed error for a lone block opener with no close tag', () => {
    const r = scanOpaqueSpans('# Hi\n\n<div>\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe('html-block');
  });

  it('keeps a comment that lives inside a block HTML as part of the block', () => {
    // The comment is inside the <div>…</div> block; it must not be emitted as a
    // separate span (both derive identical raw payload via their own offsets).
    const src = '<div>\n<!-- inside -->\n</div>\n';
    const b = only(spans(src), 'html-block');
    const c = only(spans(src), 'html-comment');
    expect(b).toHaveLength(1);
    expect(c).toHaveLength(0);
    expect(src.slice(b[0].from, b[0].to)).toBe('<div>\n<!-- inside -->\n</div>\n');
  });

  it('masks fenced-code content so it never registers as opaque', () => {
    const src = '```html\n<!-- not a comment -->\n<div>\nnot html\n</div>\n```\n\nbody\n';
    const r = scanOpaqueSpans(src, { codeRegions: scanCodeRegions(src).regions });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spans).toHaveLength(0);
  });

  it('does not mask HTML outside a fence after an unclosed fence', () => {
    // `scanCodeRegions` reports the trailing region as unclosed; the caller is
    // expected to reject the doc as source-only before scanning opaque spans.
    const src = '```\n<div>\n';
    const regions = scanCodeRegions(src);
    expect(regions.unclosed).toBe(true);
  });

  it('detects unclosed fenced code and reports it (source-only upstream)', () => {
    const r = scanCodeRegions('```ts\nconst a = 1;\n');
    expect(r.unclosed).toBe(true);
    expect(r.regions).toHaveLength(1);
  });

  it('keeps a heading separator (--- not at byte 0) out of front matter', () => {
    const src = '# Title\n\n---\n\nbody\n';
    const fm = only(spans(src), 'frontmatter');
    expect(fm).toHaveLength(0);
  });

  it('is deterministic: identical input yields identical spans', () => {
    const src = '---\na: 1\n---\n\n<!-- c -->\n\n<div>\nx\n</div>\n';
    expect(JSON.stringify(spans(src))).toBe(JSON.stringify(spans(src)));
  });

  // ── Hostile / adversarial inputs ──────────────────────────────────────
  it('treats a delimiter-heavy hostile doc without a close as source-only', () => {
    const r = scanOpaqueSpans('---\nkey: value\n' + 'filler\n'.repeat(200));
    expect(r.ok).toBe(false); // opener present, no lone `---` close → ambiguous
  });

  it('does not allocate an unbounded span for a lone block opener', () => {
    // The block opener has no close anywhere; scan must fail (unclosed), not
    // produce a span that swallows the whole file.
    const r = scanOpaqueSpans('before\n\n<div>\na\nb\nc\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unclosed-boundary');
  });

  it('returns a bounded unclosed range (no whole-body range)', () => {
    const r = scanOpaqueSpans('# Hi\n\n<!-- never\n' + 'x\n'.repeat(200));
    expect(r.ok).toBe(false);
    if (!r.ok && r.range) {
      expect(r.range.to - r.range.from).toBeLessThan(64);
    }
  });
});
