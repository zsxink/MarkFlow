import { describe, expect, it } from 'vitest';
import { reconcile, type ReconcileConflictCode, type ReconcileInput } from './editor.markdown.reconcile';
import type { MarkdownSession } from './editor.markdown.types';

/**
 * Task 8.2 — pure reconcile classifier matrix.
 *
 * unchanged / safe-edit / conflict over: allowed canonicalization, user edit,
 * stale source revision, semantic mismatch and opaque mismatch.
 */
describe('reconcile classifier (8.2)', () => {
  const session = {
    sourceBaseline: '---\na: 1\n---\n\n# Hi\n',
    baselineFingerprint: 'fp-baseline',
    userRevisionAtAdmission: 3,
    sourceRevision: 7,
  } satisfies Pick<MarkdownSession, 'sourceBaseline' | 'baselineFingerprint' | 'userRevisionAtAdmission' | 'sourceRevision'>;

  const base: ReconcileInput = {
    session,
    currentUserRevision: 3, // == userRevisionAtAdmission → no user edit
    candidate: '---\na: 1\n---\n\n# Hi\n',
    candidateReparsesToEditor: true,
    sourceRevisionMatches: true,
    opaqueIntact: true,
    canonicalOnly: true,
    currentEditorFingerprint: 'fp-baseline',
  };

  type Case = {
    name: string;
    mutate: (i: ReconcileInput) => ReconcileInput;
    verdict: 'unchanged' | 'safe-edit' | 'conflict';
    code?: ReconcileConflictCode;
    markdown?: string;
  };

  const CASES: Case[] = [
    {
      name: 'unchanged: no user edit + canonical-only → exact source baseline',
      mutate: (i) => i,
      verdict: 'unchanged',
      markdown: session.sourceBaseline,
    },
    {
      name: 'safe-edit: user edit + candidate reparses to editor + opaque intact',
      mutate: (i) => ({
        ...i,
        currentUserRevision: 5, // user edited
        candidate: '---\na: 1\n---\n\n# Edited\n',
        canonicalOnly: false,
      }),
      verdict: 'safe-edit',
      markdown: '---\na: 1\n---\n\n# Edited\n',
    },
    {
      name: 'conflict: no candidate (serialize/restore failed)',
      mutate: (i) => ({ ...i, candidate: null }),
      verdict: 'conflict',
      code: 'conversion-failed',
    },
    {
      name: 'conflict: stale source revision (external change)',
      mutate: (i) => ({ ...i, sourceRevisionMatches: false }),
      verdict: 'conflict',
      code: 'stale-source',
    },
    {
      name: 'conflict: opaque integrity broken',
      mutate: (i) => ({ ...i, opaqueIntact: false }),
      verdict: 'conflict',
      code: 'opaque-mismatch',
    },
    {
      name: 'conflict: user edit but candidate does NOT reparse to editor',
      mutate: (i) => ({
        ...i,
        currentUserRevision: 5,
        candidateReparsesToEditor: false,
      }),
      verdict: 'conflict',
      code: 'semantic-mismatch',
    },
    {
      name: 'conflict: no user edit but candidate is not canonical-only',
      mutate: (i) => ({
        ...i,
        canonicalOnly: false,
        candidateReparsesToEditor: true,
      }),
      verdict: 'conflict',
      code: 'unexpected-change',
    },
    {
      name: 'conflict: stale source beats everything even with a good candidate',
      mutate: (i) => ({
        ...i,
        currentUserRevision: 9,
        sourceRevisionMatches: false,
        candidateReparsesToEditor: true,
        userRevisionAtAdmission: 3,
      }),
      verdict: 'conflict',
      code: 'stale-source',
    },
  ];

  it.each(CASES)('$name', ({ mutate, verdict, code, markdown }) => {
    const r = reconcile(mutate({ ...base, session: { ...session } }));
    expect(r.verdict).toBe(verdict);
    if (verdict === 'conflict') {
      if (r.verdict === 'conflict') expect(r.code).toBe(code);
    } else if (markdown !== undefined && r.verdict !== 'conflict') {
      expect(r.markdown).toBe(markdown);
    }
  });

  it('userMadeEdit is evaluated against userRevisionAtAdmission (boundary)', () => {
    // At exactly userRevisionAtAdmission there is no user edit → unchanged path.
    const r = reconcile({
      ...base,
      currentUserRevision: session.userRevisionAtAdmission,
      canonicalOnly: true,
    });
    expect(r.verdict).toBe('unchanged');
    // One more revision → user edit exists.
    const s = reconcile({
      ...base,
      currentUserRevision: session.userRevisionAtAdmission + 1,
      canonicalOnly: false,
      candidateReparsesToEditor: true,
    });
    expect(s.verdict).toBe('safe-edit');
  });
});
