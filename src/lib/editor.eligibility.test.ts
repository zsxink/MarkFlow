import { describe, expect, it } from 'vitest';
import { classifyEligibility, WYSIWYG_MAX_ADMISSION_BYTES, WYSIWYG_MAX_ADMISSION_LINES } from './editor.markdown.eligibility';
import type { Eligibility, EligibilityReason } from './editor.markdown.types';

/**
 * Table-driven corpus for the deterministic eligibility classifier (task 6.2).
 * Every fixture must return a stable verdict + reason code.
 */
type Case = {
  name: string;
  source: string;
  verdict: Eligibility;
  reason: EligibilityReason;
};

const CASES: Case[] = [
  // ── eligible: fully supported constructs ─────────────────────────────
  { name: 'heading', source: '# Title\n\nbody\n', verdict: 'eligible', reason: 'supported' },
  { name: 'inline-marks', source: '**bold** and *em* and `code`\n', verdict: 'eligible', reason: 'supported' },
  { name: 'list', source: '- a\n- b\n  - c\n', verdict: 'eligible', reason: 'supported' },
  { name: 'task-list', source: '- [ ] todo\n- [x] done\n', verdict: 'eligible', reason: 'supported' },
  { name: 'gfm-table', source: '| A | B |\n| --- | --- |\n| 1 | 2 |\n', verdict: 'eligible', reason: 'supported' },
  { name: 'code-fence', source: '```ts\nconst a = 1;\n```\n', verdict: 'eligible', reason: 'supported' },
  {
    name: 'code-fence-protected-literals',
    source: '```ts\ntype T = Result<Value<T>, Error>;\nconst samples = ["$x$", "[^1]", "[x][ref]"];\n```\n',
    verdict: 'eligible',
    reason: 'supported',
  },
  {
    name: 'inline-code-protected-literals',
    source: 'Use `Result<T, E>`, `<url>`, `$x$`, `[^1]`, and `[x][ref]`.\n',
    verdict: 'eligible',
    reason: 'supported',
  },
  { name: 'empty', source: '', verdict: 'eligible', reason: 'supported' },
  { name: 'link-rel', source: '[home](../index.md)\n', verdict: 'eligible', reason: 'supported' },
  { name: 'image', source: '![alt](./img.png)\n', verdict: 'eligible', reason: 'supported' },
  { name: 'hard-break', source: 'line1  \nline2\n', verdict: 'eligible', reason: 'supported' },

  // ── eligible-with-opaque: covered by the opaque allowlist ─────────────
  {
    name: 'yaml-frontmatter',
    source: '---\ntitle: Hello\nkey: value\n---\n\n# Body\n',
    verdict: 'eligible-with-opaque',
    reason: 'opaque-covered',
  },
  {
    name: 'html-comment',
    source: '# Hi\n\n<!-- note to self -->\n\nbody\n',
    verdict: 'eligible-with-opaque',
    reason: 'opaque-covered',
  },
  {
    name: 'block-html',
    source: '# Hi\n\n<div>\nspan\n</div>\n',
    verdict: 'eligible-with-opaque',
    reason: 'opaque-covered',
  },

  // ── source-only: unsupported / ambiguous / crossing constructs ────────
  {
    name: 'reference-link-def',
    source: '# Hi\n\n[ref]: /some/url\n',
    verdict: 'source-only',
    reason: 'unknown-construct',
  },
  {
    name: 'reference-link-use',
    source: '[text][ref]\n',
    verdict: 'source-only',
    reason: 'unknown-construct',
  },
  {
    name: 'footnote',
    source: 'text[^1]\n\n[^1]: note\n',
    verdict: 'source-only',
    reason: 'unknown-construct',
  },
  {
    name: 'inline-html',
    source: '# Hi\n\n<span>inline</span>\n',
    verdict: 'source-only',
    reason: 'unknown-construct',
  },
  {
    name: 'math-inline',
    source: 'the value $x$ here\n',
    verdict: 'eligible',
    reason: 'supported',
  },
  {
    name: 'math-block',
    source: '$$\n\\int x dx\n$$\n',
    verdict: 'eligible',
    reason: 'supported',
  },
  {
    name: 'unclosed-fence',
    source: '```ts\nconst a = 1;\n',
    verdict: 'source-only',
    reason: 'ambiguous-boundary',
  },
  {
    name: 'unclosed-frontmatter',
    source: '---\ntitle: no close\n',
    verdict: 'source-only',
    reason: 'ambiguous-boundary',
  },
  {
    name: 'unclosed-html-comment',
    source: '# Hi\n\n<!-- never closed\n',
    verdict: 'source-only',
    reason: 'ambiguous-boundary',
  },
  {
    name: 'block-html-unclosed',
    source: '# Hi\n\n<div>\n',
    verdict: 'source-only',
    reason: 'ambiguous-boundary',
  },
  {
    name: 'gfm-table-header-delimiter-mismatch',
    source: '| A | B |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n',
    verdict: 'source-only',
    reason: 'malformed-table',
  },
  {
    name: 'gfm-table-body-mismatch',
    source: '| A | B |\n| --- | --- |\n| 1 | 2 | 3 |\n',
    verdict: 'source-only',
    reason: 'malformed-table',
  },
];

describe('eligibility classifier (6.2)', () => {
  it.each(CASES)('$name → $verdict ($reason)', ({ source, verdict, reason }) => {
    // Deterministic: two calls return the identical result.
    const a = classifyEligibility(source);
    const b = classifyEligibility(source);
    expect(a).toEqual(b);
    expect(a.verdict).toBe(verdict);
    expect(a.reason).toBe(reason);
  });

  it('treats opaque content inside comments/front-matter as not blocking', () => {
    // Reference-link-looking text inside front matter is protected by the
    // opaque span and must NOT demote the document to source-only.
    const source = '---\n[x]: /a\n---\n\n# Body\n';
    const r = classifyEligibility(source);
    expect(r.verdict).toBe('eligible-with-opaque');
    expect(r.reason).toBe('opaque-covered');
  });

  it('still rejects unsupported prose adjacent to protected code', () => {
    const source = '`<safe>` followed by <span>unsafe</span>\n';
    expect(classifyEligibility(source)).toEqual({
      verdict: 'source-only',
      reason: 'unknown-construct',
      category: 'inline-html',
    });
  });

  it('counts escaped and code-span pipes as table cell content', () => {
    const source = '| A | B |\n| --- | --- |\n| a\\|b | `x|y` |\n';
    expect(classifyEligibility(source)).toEqual({ verdict: 'eligible', reason: 'supported' });
  });

  it('returns a stable reason code for every verdict (exhaustive)', () => {
    for (const c of CASES) {
      const r = classifyEligibility(c.source);
      expect(typeof r.reason).toBe('string');
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it('uses deterministic measured size and line thresholds for source-only admission', () => {
    expect(classifyEligibility('a'.repeat(WYSIWYG_MAX_ADMISSION_BYTES - 1)).verdict).toBe('eligible');
    expect(classifyEligibility('a'.repeat(WYSIWYG_MAX_ADMISSION_BYTES)).reason).toBe('too-large');
    expect(classifyEligibility(Array.from({ length: WYSIWYG_MAX_ADMISSION_LINES + 1 }, () => 'a').join('\n')).reason).toBe('too-large');
  });
});
