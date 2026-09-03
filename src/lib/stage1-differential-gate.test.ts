import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { TIPTAP_V3_CORPUS_RESULTS } from './tiptap-v3-spike.test';

/**
 * Stage-one gate 5.4 (differential corpus).
 *
 * 100% of supported fixtures must preserve text, structure and authored
 * attributes across the v2→v3 engine migration. The v3 per-fixture round-trip
 * is asserted by `tiptap-v3-spike.test.ts` (each supported fixture must
 * round-trip to the same canonicalized document). This test wires that result
 * to the on-disk differential evidence and verifies the gate is PASS and every
 * canonicalization is named.
 */
describe('stage-one differential corpus gate (5.4)', () => {
  it('all supported corpus fixtures round-trip through the v3 engine', () => {
    const failures = TIPTAP_V3_CORPUS_RESULTS.filter((r) => r.status === 'supported' && r.roundTrip !== 'pass');
    expect(failures.map((f) => f.id)).toEqual([]);
    expect(TIPTAP_V3_CORPUS_RESULTS.filter((r) => r.status === 'invalid')).toHaveLength(2);
  });

  it('writes PASS-gated differential evidence to evidence/differential-corpus-summary.json', () => {
    expect(existsSync('evidence/differential-corpus-summary.json')).toBe(true);
    const evidence = JSON.parse(readFileSync('evidence/differential-corpus-summary.json', 'utf8'));
    expect(evidence.gate).toBe('PASS');
    expect(evidence.counts.supported).toBe(24);
    // Every supported fixture carries a named canonicalization list.
    for (const row of evidence.supported) {
      expect(Array.isArray(row.canonical), (row as { id: string }).id).toBe(true);
    }
    // Named canonicalization must cover the corpus notes the fixtures declare.
    const canonicalizations = new Set((evidence.supported as Array<{ canonical: string[] }>).flatMap((f) => f.canonical));
    expect(canonicalizations.has('list-continuation-indent')).toBe(true);
    expect(canonicalizations.has('table-column-padding')).toBe(true);
  });
});