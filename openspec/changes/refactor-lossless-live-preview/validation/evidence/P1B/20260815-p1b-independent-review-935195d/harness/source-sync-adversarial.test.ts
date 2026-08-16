import { describe, expect, it, vi } from 'vitest';

import {
  SourceSyncController,
  type LocalChange,
  type SyncControllerDeps,
} from '../../../../../../../../src/lib/lossless/sourceSyncController';

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

function deps(overrides: Partial<SyncControllerDeps> = {}): SyncControllerDeps {
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
    applyLocalChanges: vi.fn(),
    batchWindowMs: 1,
    maxRetries: 0,
    ...overrides,
  };
}

describe('P1B independent adversarial review', () => {
  it('blocked optimistic text must remain dirty', async () => {
    const controller = new SourceSyncController(
      deps({ applyPatch: vi.fn(async () => Promise.reject({ code: 'io', message: 'down' })) }),
    );
    controller.onUserEdit();
    await wait();

    // This is the exact EditorSurfaceBinding.isDirty() predicate.
    const bindingDirty =
      controller.pending > 0 || controller.isInFlight() || controller.revision !== 0;
    expect(controller.pipelineState).toBe('blocked');
    expect(bindingDirty).toBe(true);
  });

  it('resync must not apply confirmed-to-optimistic diff to the already optimistic editor', async () => {
    let editorDoc = 'Xbase';
    const applyPatch = vi
      .fn()
      .mockRejectedValueOnce({ code: 'stale-revision', message: 'stale' })
      .mockResolvedValueOnce({ revision: 2, confirmedHash: 'h2' });
    const applyLocalChanges = vi.fn((changes: LocalChange[]) => {
      for (const change of [...changes].reverse()) {
        editorDoc =
          editorDoc.slice(0, change.from) + change.insert + editorDoc.slice(change.to);
      }
    });
    const controller = new SourceSyncController(
      deps({
        applyPatch,
        getSnapshot: vi.fn(async () => ({
          revision: 1,
          logicalText: 'base',
          confirmedHash: 'h1',
        })),
        currentDoc: vi.fn(() => editorDoc),
        applyLocalChanges,
      }),
    );
    controller.onUserEdit();
    await wait(60);

    expect(applyPatch).toHaveBeenCalledTimes(2);
    expect(editorDoc).toBe('Xbase');
  });

  it('a never-settling patch request must time out into retry or blocked', async () => {
    const controller = new SourceSyncController(
      deps({ applyPatch: vi.fn(() => new Promise(() => undefined)) }),
    );
    controller.onUserEdit();
    await wait(250);

    expect(controller.pipelineState).toBe('blocked');
  });
});
