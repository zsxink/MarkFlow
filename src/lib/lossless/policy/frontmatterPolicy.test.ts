// P4B task 7.7 — FrontMatter safe projection policy tests.
//
// Machine-verifiable coverage:
//   - the safe-subset classifier `classifySafeFrontmatter` FAILS CLOSED: naive
//     `key: value` blocks are safe; anchors (`&`), aliases (`*`), custom tags
//     (`!!`), lists/flow/nested maps, and other non-simple YAML → `{safe:false}`
//     (→ exact source);
//   - the owner registration is explicit and flag-gated (plain default OFF,
//     `p4b.frontmatter-policy` label ON);
//   - the descriptor is protocol-validated and source-only;
//   - (parser gap) the `---` delimiter block is NOT a `FrontMatter` node today,
//     so the only safe projection is exact source by construction — the doc is
//     never touched and save keeps the original bytes (covered structurally:
//     an editor holding a `---`-style doc reports source ownership for
//     `frontmatter`, and the bytes pass through unchanged).

import { describe, it, expect, beforeEach } from 'vitest';
import { createLosslessSourceEditor } from '../losslessSourceEditor';
import {
  classifySafeFrontmatter,
  frontmatterPolicyDescriptor,
} from './frontmatterPolicy';
import { setP4bFlagEnabled, resetAllCohortFlags } from '../cohortFlags';
import { resolveConstructOwner } from '../renderOwnerRegistry';

function lines(...ls: string[]): string[] {
  return ls;
}

describe('classifySafeFrontmatter (safe-subset boundary, fail-closed)', () => {
  it('accepts simple single-level key: value blocks (blank + comment lines allowed)', () => {
    expect(classifySafeFrontmatter(lines('title: My Post', 'date: 2026-08-29'))).toEqual({ safe: true });
    expect(classifySafeFrontmatter(lines('', '# a comment', 'key: value', ''))).toEqual({ safe: true });
  });

  it('accepts an empty body (no fields) as trivially safe', () => {
    expect(classifySafeFrontmatter([])).toEqual({ safe: true });
  });

  it('rejects anchors (&) and aliases (*) — complex YAML → exact source', () => {
    expect(classifySafeFrontmatter(lines('base: &base {a: 1}', 'copy: *base')).safe).toBe(false);
    expect(classifySafeFrontmatter(lines('a: &anchor val')).safe).toBe(false);
    expect(classifySafeFrontmatter(lines('merge: *anchor')).safe).toBe(false);
  });

  it('rejects custom tags (!!) — fail closed', () => {
    expect(classifySafeFrontmatter(lines('ts: !!timestamp 2026-08-29')).safe).toBe(false);
  });

  it('rejects non-simple YAML: lists, flow collections, nested maps, partial lines', () => {
    expect(classifySafeFrontmatter(lines('- item', 'b: 2')).safe).toBe(false);
    expect(classifySafeFrontmatter(lines('tags: [a, b]')).safe).toBe(false);
    expect(classifySafeFrontmatter(lines('author:', '  name: x')).safe).toBe(false);
    expect(classifySafeFrontmatter(lines('just-a-key')).safe).toBe(false);
    expect(classifySafeFrontmatter(lines(': value')).safe).toBe(false);
  });

  it('fails closed on non-array input and reports a reason for rejection', () => {
    // @ts-expect-error deliberate misuse for fail-closed coverage
    expect(classifySafeFrontmatter('title: x')).toEqual({ safe: false, reason: 'not-an-array' });
    const r = classifySafeFrontmatter(lines('ok: 1', 'bad: {a: 1}'));
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/line-2/);
  });
});

describe('frontmatter owner registration (flag-gated, source-only)', () => {
  beforeEach(() => resetAllCohortFlags());

  it('flag OFF (default): plain source-fallback default owner (no owner change)', () => {
    expect(resolveConstructOwner('frontmatter').owner).toBe('source-fallback');
    expect(resolveConstructOwner('frontmatter').source).toBe('default');
  });

  it('flag ON: owner resolves to the explicit policy label (still source-fallback)', () => {
    setP4bFlagEnabled('frontmatterPolicy', true);
    const r = resolveConstructOwner('frontmatter');
    expect(r.owner).toBe('source-fallback');
    expect(r.source).toBe('p4b.frontmatter-policy');
    setP4bFlagEnabled('frontmatterPolicy', false);
  });

  it('the descriptor is protocol-validated and source-only', () => {
    expect(frontmatterPolicyDescriptor.kind).toBe('frontmatter');
    expect(frontmatterPolicyDescriptor.ownerKind).toBe('frontmatter');
    expect(frontmatterPolicyDescriptor.security.allowsUnsafeHtml).toBe(false);
    expect(frontmatterPolicyDescriptor.security.containerPolicy).toBe('none');
    expect(frontmatterPolicyDescriptor.fallbackBehavior).toBe('exact-source');
    expect(frontmatterPolicyDescriptor.__frozen).toBe(true);
  });
});

describe('parser gap: safe projection is exact source by construction', () => {
  it('a `---`-delimited frontmatter doc passes through byte-identical (save preserves bytes)', () => {
    const doc = ['---', 'title: hi', 'tags: [a, b]', '---', '', '# body'].join('\n');
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const handle = createLosslessSourceEditor(parent, doc, { livePreview: true, mode: 'preview' });
    // No FrontMatter Lezer node exists under the current config (ADR §3.1), so
    // the projection never decorates the frontmatter region and the doc is
    // untouched — save reads the lossless Core, never a renderer.
    expect(handle.view.state.doc.toString()).toBe(doc);
    expect(handle.doc()).toBe(doc);
    handle.destroy();
    parent.remove();
  });
});
