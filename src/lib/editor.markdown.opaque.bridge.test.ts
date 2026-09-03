import { describe, expect, it } from 'vitest';
import { renderOpaque, restoreOpaque } from './editor.markdown.opaque.bridge';

/**
 * Task 7.4 — one-to-one opaque restore + final no-sentinel assertion.
 *
 * render:   scan → register → swap raw spans for slot sentinels.
 * restore:  validate occurrence, order and digest → substitute raws → assert
 *           no sentinel remains. Missing / duplicated / reordered / unknown
 *           slots all return `conflict` (no candidate, no internal token out).
 */
describe('opaque render/restore bridge (7.4)', () => {
  it('renders raw spans to sentinels and restores them byte-for-byte', () => {
    const source = '---\ntitle: Hi\n---\n\n# Body\n\n<!-- a note -->\n\n<div>\nx\n</div>\n';
    const render = renderOpaque(source);
    expect(render.ok).toBe(true);
    if (!render.ok) return;
    // The rendered source contains sentinels, not the opaque bytes.
    expect(render.markdown).not.toContain('title: Hi');
    expect(render.markdown).not.toContain('<div>');
    expect(render.markdown).not.toContain('<!-- a note -->');
    expect(render.markdown).toContain('⟦MF-OPAQUE:');
    expect(render.spans).toHaveLength(3);

    // Restoring returns the EXACT original bytes.
    const restore = restoreOpaque(render.markdown, render.registry);
    expect(restore.ok).toBe(true);
    if (!restore.ok) return;
    expect(restore.markdown).toBe(source);
  });

  it('handles multiple identical fragments without mixing them up', () => {
    const source = '<!-- same -->\n\nA\n\n<!-- same -->\n\nB\n';
    const render = renderOpaque(source);
    expect(render.ok).toBe(true);
    if (!render.ok) return;
    const slots = render.registry.all().map((e) => e.slot);
    expect(slots).toHaveLength(2);
    expect(slots[0]).not.toBe(slots[1]); // distinct slots for identical raws
    const restore = restoreOpaque(render.markdown, render.registry);
    expect(restore.ok).toBe(true);
    if (!restore.ok) return;
    expect(restore.markdown).toBe(source);
  });

  it('rejects an unknown/foreign slot with no candidate', () => {
    const render = renderOpaque('# Hi\n\n<!-- real -->\n');
    expect(render.ok).toBe(true);
    if (!render.ok) return;
    // A foreign sentinel from another session snuck into the serialized output.
    const tampered = render.markdown.replace(
      render.registry.all()[0].slot,
      'deadbeef1234.99',
    );
    const restore = restoreOpaque(tampered, render.registry);
    expect(restore.ok).toBe(false);
    if (!restore.ok) expect(restore.code).toBe('unknown-slot');
  });

  it('rejects a duplicated slot (one-to-one violated) with no candidate', () => {
    const render = renderOpaque('# Hi\n\n<!-- real -->\n');
    expect(render.ok).toBe(true);
    if (!render.ok) return;
    const sentinel = render.markdown.match(/⟦MF-OPAQUE:[^⟧]+⟧/)?.[0]!;
    const duplicated = `${sentinel}\n\n${sentinel}\n`;
    const restore = restoreOpaque(duplicated, render.registry);
    expect(restore.ok).toBe(false);
    if (!restore.ok) expect(restore.code).toBe('duplicate-slot');
  });

  it('rejects a deleted placeholder (missing slot) with no candidate', () => {
    const render = renderOpaque('# Hi\n\n<!-- real -->\n');
    expect(render.ok).toBe(true);
    if (!render.ok) return;
    // The atom was deleted by the user: its sentinel is gone from the output.
    const restore = restoreOpaque('# Hi\n\n', render.registry);
    expect(restore.ok).toBe(false);
    if (!restore.ok) expect(restore.code).toBe('missing-slot');
  });

  it('rejects reordered placeholders with no candidate', () => {
    const source = '<!-- first -->\n\nA\n\n<!-- second -->\n\nB\n';
    const render = renderOpaque(source);
    expect(render.ok).toBe(true);
    if (!render.ok) return;
    const sentinels = render.markdown.match(/⟦MF-OPAQUE:[^⟧]+⟧/g)!;
    expect(sentinels).toHaveLength(2);
    // Swap the two sentinel lines → registration order no longer holds.
    const marker = 'ZZ_OPAQUE_MARKER_ZZ';
    const reordered = render.markdown
      .replace(sentinels[0], marker)
      .replace(sentinels[1], sentinels[0])
      .replace(marker, sentinels[1]);
    const restore = restoreOpaque(reordered, render.registry);
    expect(restore.ok).toBe(false);
    if (!restore.ok) expect(restore.code).toBe('reorder');
  });

  it('emits no sentinel when restore is successful (final no-token assertion)', () => {
    const render = renderOpaque('# Hi\n\n<!-- a -->\n\n<!-- b -->\n');
    expect(render.ok).toBe(true);
    if (!render.ok) return;
    const restore = restoreOpaque(render.markdown, render.registry);
    expect(restore.ok).toBe(true);
    if (!restore.ok) return;
    expect(restore.markdown).not.toContain('⟦MF-OPAQUE:');
    expect(restore.markdown).toBe('# Hi\n\n<!-- a -->\n\n<!-- b -->\n');
  });

  it('returns scan-failed for an unclosed/ambiguous span (render side)', () => {
    const render = renderOpaque('# Hi\n\n<div>\nnever closed\n');
    expect(render.ok).toBe(false);
    if (!render.ok) expect(render.code).toBe('scan-failed');
  });

  it('restores content around opaque spans (sentinels removed cleanly)', () => {
    const source = '# Title\n\nintro *text*\n\n<!-- html -->\n\n- list\n- items\n';
    const render = renderOpaque(source);
    expect(render.ok).toBe(true);
    if (!render.ok) return;
    const restore = restoreOpaque(render.markdown, render.registry);
    expect(restore.ok).toBe(true);
    if (!restore.ok) return;
    expect(restore.markdown).toBe(source);
  });

  it('does not treat fenced-code sentinel-like text as an opaque span', () => {
    const source = '```\n⟦MF-OPAQUE:abc.0⟧\n<!-- inside fence -->\n<div>\n</div>\n```\n\nbody\n';
    const render = renderOpaque(source);
    expect(render.ok).toBe(true);
    if (!render.ok) return;
    expect(render.spans).toHaveLength(0); // nothing inside the fence is opaque
    expect(render.markdown).toBe(source); // untouched
  });
});
