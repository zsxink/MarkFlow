import { describe, expect, it } from 'vitest';
import { createMarkdownSession, reconcile } from './editor.markdown.reconcile';
import { OpaqueRegistry, opaqueDigest } from './editor.markdown.opaque';
import type { ReconcileInput } from './editor.markdown.reconcile';

/**
 * Task 8.1 — session creation captures every baseline from one transaction.
 * Task 8.3 — the `unchanged` path returns the EXACT source baseline (no byte
 *            rewrite), even across differing newlines / file-tail / markers.
 */
describe('reconcile session + unchanged path (8.1, 8.3)', () => {
  it('8.1: creates a session with all fields from one transaction', () => {
    const source = '---\ntitle: Hi\n---\n\n# Body\n';
    const registry = new OpaqueRegistry(source, { randomSource: () => 1 });
    const reg = registry.register('frontmatter', '---\ntitle: Hi\n---\n', { from: 0, to: 18 });
    if (!reg.ok) throw new Error('reg');

    const session = createMarkdownSession({
      source,
      verifiedRenderBaseline: '# Body\n',
      fingerprint: 'fp-abc123',
      sourceRevision: 42,
      userRevisionAtAdmission: 7,
      registry,
    });

    expect(session.sourceBaseline).toBe(source);
    expect(session.verifiedRenderBaseline).toBe('# Body\n');
    expect(session.baselineFingerprint).toBe('fp-abc123');
    expect(session.sourceRevision).toBe(42);
    expect(session.userRevisionAtAdmission).toBe(7);
    // The opaque registry snapshot carries the same slot/raw/digest.
    const entry = session.opaqueRegistry.get(reg.entry.slot);
    expect(entry?.raw).toBe('---\ntitle: Hi\n---\n');
    expect(entry?.category).toBe('frontmatter');
    expect(entry?.digest).toBe(opaqueDigest('---\ntitle: Hi\n---\n'));
  });

  it('8.3: unchanged returns the exact source baseline (CRLF, EOF, non-preferred markers)', () => {
    // Authered formatting the candidate would canonicalize away.
    const sourceBaseline = 'title: X\r\n---\r\n\r\n# Heading\r\nbody *em*\r\n\r\n';
    const session = {
      sourceBaseline,
      baselineFingerprint: 'fp',
      userRevisionAtAdmission: 0,
      sourceRevision: 1,
    };

    // No user edit; the candidate differs only by canonicalization (LF, no EOF
    // blank line, preferred-ish marks) — reconcile must return the ORIGINAL
    // bytes, not the candidate.
    const input: ReconcileInput = {
      session,
      currentUserRevision: 0,
      candidate: 'title: X\n---\n\n# Heading\nbody *em*\n',
      candidateReparsesToEditor: true,
      sourceRevisionMatches: true,
      opaqueIntact: true,
      canonicalOnly: true,
      currentEditorFingerprint: 'fp',
    };

    const r = reconcile(input);
    expect(r.verdict).toBe('unchanged');
    if (r.verdict === 'unchanged') {
      // Byte-for-byte the authored source, never a canonicalized rewrite.
      expect(r.markdown).toBe(sourceBaseline);
      expect(r.markdown).toContain('\r\n');
      expect(r.markdown).toHaveLength(sourceBaseline.length);
    }
  });

  it('8.3: a user edit with canonical-only differences is NOT unchanged (safe-edit governed by reparse)', () => {
    const session = {
      sourceBaseline: '# A\n',
      baselineFingerprint: 'fp',
      userRevisionAtAdmission: 0,
      sourceRevision: 1,
    };
    const r = reconcile({
      session,
      currentUserRevision: 2, // user edited
      candidate: '# B\n',
      candidateReparsesToEditor: true,
      sourceRevisionMatches: true,
      opaqueIntact: true,
      canonicalOnly: false,
      currentEditorFingerprint: 'fp-b',
    });
    expect(r.verdict).toBe('safe-edit');
    if (r.verdict === 'safe-edit') expect(r.markdown).toBe('# B\n');
  });
});
