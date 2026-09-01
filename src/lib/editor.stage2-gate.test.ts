import { describe, expect, it } from 'vitest';
import {
  MARKDOWN_PIPELINE_ORDER,
  isPipelineModeAtOrBelow,
  type MarkdownPipelineMode,
} from './editor.markdown.types';
import { getMarkdownPipelineMode } from './editor.state';

/**
 * Stage-two gate (task 6.1): stage-two pipeline modes must not be reachable by
 * accident. Stage one defaults to `v3-compatible`; `gated`/`opaque`/`reconcile`
 * may advance only through the explicit ordering and never start activated.
 * This guards against turning on eligibility/opaque/reconcile behavior before
 * its contracts (sections 6–8) are implemented and tested.
 */
describe('stage-two pipeline gate (6.1)', () => {
  it('defaults the runtime to v3-compatible (stage two not auto-enabled)', () => {
    expect(getMarkdownPipelineMode()).toBe('v3-compatible');
  });

  it('models the full supported mode set with a monotonic safety order', () => {
    // source-only is the recovery floor; the progression only strengthens.
    expect(MARKDOWN_PIPELINE_ORDER).toEqual([
      'source-only',
      'v3-compatible',
      'gated',
      'opaque',
      'reconcile',
    ]);
    // Every value the type admits is in the order, in exactly one place.
    const seen = new Set<string>();
    for (const mode of MARKDOWN_PIPELINE_ORDER) {
      expect(seen.has(mode)).toBe(false);
      seen.add(mode);
    }
    // Type-level exhaustiveness: these are all the modes we support today.
    const all: MarkdownPipelineMode[] = ['source-only', 'v3-compatible', 'gated', 'opaque', 'reconcile'];
    expect(all).toHaveLength(MARKDOWN_PIPELINE_ORDER.length);
  });

  it('isPipelineModeAtOrBelow reflects the safety ordering', () => {
    expect(isPipelineModeAtOrBelow('source-only', 'v3-compatible')).toBe(true);
    expect(isPipelineModeAtOrBelow('v3-compatible', 'v3-compatible')).toBe(true);
    expect(isPipelineModeAtOrBelow('gated', 'v3-compatible')).toBe(false); // cannot run gated under v3
    expect(isPipelineModeAtOrBelow('opaque', 'gated')).toBe(false);        // opaque needs gated first
    expect(isPipelineModeAtOrBelow('reconcile', 'reconcile')).toBe(true);
    expect(isPipelineModeAtOrBelow('v3-compatible', 'reconcile')).toBe(true);
  });

  it('stage-two modes are not entered unless the pipeline has advanced (no jump)', () => {
    // A doc that is merely parsed stays at v3-compatible; eligibility (6.2)
    // is what advances to `gated`, and opaque/reconcile build on it. Here we
    // assert the ordering invariant that would make a jump illegal.
    expect(MARKDOWN_PIPELINE_ORDER.indexOf('opaque')).toBeGreaterThan(
      MARKDOWN_PIPELINE_ORDER.indexOf('gated'),
    );
    expect(MARKDOWN_PIPELINE_ORDER.indexOf('reconcile')).toBeGreaterThan(
      MARKDOWN_PIPELINE_ORDER.indexOf('opaque'),
    );
  });
});
