import { describe, expect, it, vi } from 'vitest';

import {
  SourceSyncController,
  diffText,
  type SyncControllerDeps,
} from '../../../../../../../../src/lib/lossless/sourceSyncController';

const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

function makeDeps(overrides: Partial<SyncControllerDeps> = {}): SyncControllerDeps {
  return {
    sessionId: 1,
    documentId: 1,
    bindingGeneration: 0,
    confirmedRevision: 0,
    confirmedHash: 'h0',
    applyPatch: vi.fn(async () => ({ revision: 1, confirmedHash: 'h1' })),
    getSnapshot: vi.fn(async () => ({
      revision: 0,
      logicalText: 'base',
      confirmedHash: 'h0',
    })),
    composePending: vi.fn(() => [{ from: 0, to: 0, insert: 'X' }]),
    currentDoc: vi.fn(() => 'Xbase'),
    discardPending: vi.fn(),
    batchWindowMs: 1,
    maxRetries: 0,
    attemptTimeoutMs: 100,
    ...overrides,
  };
}

function isUtf16Boundary(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return true;
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}

describe('P1B final independent corrective probes', () => {
  it('resync diff never splits an astral Unicode scalar', () => {
    const changes = diffText('😀', '😁');
    expect(changes).not.toBeNull();
    for (const change of changes ?? []) {
      expect(isUtf16Boundary('😀', change.from)).toBe(true);
      expect(isUtf16Boundary('😀', change.to)).toBe(true);
    }
  });

  it('a net-zero batch proves convergence and clears unresolved dirty', async () => {
    const controller = new SourceSyncController(makeDeps({
      composePending: vi.fn(() => []),
      currentDoc: vi.fn(() => 'base'),
    }));
    controller.onUserEdit();
    await wait(20);
    expect(controller.pipelineState).toBe('idle');
    expect(controller.hasUnresolvedOptimisticChanges()).toBe(false);
  });

  it('forced resync retains explicit CRLF paste provenance', async () => {
    const applyPatch = vi
      .fn()
      .mockRejectedValueOnce({ code: 'stale-revision', message: 'forced stale' })
      .mockResolvedValueOnce({ revision: 2, confirmedHash: 'h2' });
    const controller = new SourceSyncController(makeDeps({
      applyPatch,
      composePending: vi.fn(() => [{
        from: 0,
        to: 0,
        insert: 'X\n',
        insertedLineEndings: ['crlf'],
      }]),
      currentDoc: vi.fn(() => 'X\nbase'),
    }));
    controller.onUserEdit();
    await wait(80);
    expect(applyPatch).toHaveBeenCalledTimes(2);
    const recoveryPatch = applyPatch.mock.calls[1]?.[0] as {
      changes: Array<{ insertedLineEndings: string[] }>;
    };
    expect(recoveryPatch.changes[0]?.insertedLineEndings).toEqual(['crlf']);
  });
});
