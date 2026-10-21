import { describe, expect, it } from 'vitest';
import { TIPTAP_V3_CORPUS_RESULTS } from './tiptap-v3-spike.test';
import { WYSIWYG_ROUNDTRIP_FIXTURES } from './wysiwyg-roundtrip.fixtures';

function evaluateDifferentialGate(results: typeof TIPTAP_V3_CORPUS_RESULTS) {
  const supported = results.filter((row) => row.status === 'supported');
  const invalid = results.filter((row) => row.status === 'invalid');
  const expectedSupported = WYSIWYG_ROUNDTRIP_FIXTURES.filter((fixture) => fixture.category !== 'invalid').length;
  const expectedInvalid = WYSIWYG_ROUNDTRIP_FIXTURES.filter((fixture) => fixture.category === 'invalid').length;
  const failures = supported.filter((row) => row.roundTrip !== 'pass');
  return { supported, invalid, failures, expectedSupported, expectedInvalid };
}

function differentialGatePasses(results: typeof TIPTAP_V3_CORPUS_RESULTS): boolean {
  const gate = evaluateDifferentialGate(results);
  return results.length === WYSIWYG_ROUNDTRIP_FIXTURES.length
    && gate.supported.length === gate.expectedSupported
    && gate.invalid.length === gate.expectedInvalid
    && gate.failures.length === 0;
}

/**
 * Stage-one gate 5.4 (differential corpus).
 *
 * 100% of supported fixtures must preserve text, structure and authored
 * attributes across the v2→v3 engine migration. The v3 per-fixture round-trip
 * is asserted by `tiptap-v3-spike.test.ts` for every supported fixture.
 * This test validates the computed corpus counts and rejects any failed
 * supported round-trip without consulting evidence files.
 */
describe('stage-one differential corpus gate (5.4)', () => {
  it('gates on computed results for every fixture in the executed corpus', () => {
    const computed = evaluateDifferentialGate(TIPTAP_V3_CORPUS_RESULTS);
    expect(computed.failures.map((row) => row.id)).toEqual([]);
    expect(differentialGatePasses(TIPTAP_V3_CORPUS_RESULTS)).toBe(true);
  });

  it('rejects a complete corpus when one supported fixture fails', () => {
    const failing = TIPTAP_V3_CORPUS_RESULTS.map((row, index) =>
      index === TIPTAP_V3_CORPUS_RESULTS.findIndex((candidate) => candidate.status === 'supported')
        ? { ...row, roundTrip: 'fail' as const }
        : row,
    );
    expect(failing).toHaveLength(WYSIWYG_ROUNDTRIP_FIXTURES.length);
    expect(differentialGatePasses(failing)).toBe(false);
  });
});