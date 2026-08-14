import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SourceSyncController,
  diffText,
  type LocalChange,
  type SyncControllerDeps,
} from './sourceSyncController';

/** Build a controller with controllable deps. */
function makeController(overrides: Partial<SyncControllerDeps> = {}) {
  const state = {
    confirmedRevision: 0,
    confirmedHash: 'h0',
    patchCalls: [] as Array<{ baseRevision: number; transactionId: number; changes: LocalChange[] }>,
  };
  const applyPatch = vi.fn(async (patch: any) => {
    state.patchCalls.push({
      baseRevision: patch.baseRevision,
      transactionId: patch.transactionId,
      changes: patch.changes,
    });
    state.confirmedRevision = patch.baseRevision + 1;
    return { revision: state.confirmedRevision, confirmedHash: `h${state.confirmedRevision}` };
  });
  const getSnapshot = vi.fn(async () => ({
    revision: state.confirmedRevision,
    logicalText: 'confirmed',
    confirmedHash: state.confirmedHash,
  }));
  const composePending = vi.fn(() => [{ from: 0, to: 0, insert: 'X' }]);
  const currentDoc = vi.fn(() => 'Xconfirmed');
  const applyLocalChanges = vi.fn();
  const onStateChange = vi.fn();

  const controller = new SourceSyncController({
    sessionId: 1,
    documentId: 1,
    bindingGeneration: 0,
    confirmedRevision: 0,
    confirmedHash: 'h0',
    applyPatch: applyPatch as any,
    getSnapshot,
    composePending,
    currentDoc,
    applyLocalChanges,
    onStateChange,
    batchWindowMs: 1,
    maxRetries: 2,
    ...overrides,
  });

  return { controller, state, applyPatch, getSnapshot, composePending, currentDoc, applyLocalChanges, onStateChange };
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

describe('SourceSyncController', () => {
  afterEach(() => vi.useRealTimers());

  it('sends a single composed frame after a user edit and converges to idle', async () => {
    const { controller, state, applyPatch, onStateChange } = makeController();
    controller.onUserEdit();
    await tick();
    await tick();
    expect(applyPatch).toHaveBeenCalledTimes(1);
    // Bridge DTO shape: every change carries UTF-16 coords + provenance.
    const sent = (applyPatch.mock.calls[0][0] as any).changes;
    expect(sent).toHaveLength(1);
    expect(sent[0].fromUtf16).toBeTypeOf('number');
    expect(sent[0].toUtf16).toBeTypeOf('number');
    expect(sent[0].insertedLogicalText).toBeTypeOf('string');
    expect(Array.isArray(sent[0].insertedLineEndings)).toBe(true);
    expect(state.patchCalls[0].transactionId).toBe(1);
    expect(state.patchCalls[0].baseRevision).toBe(0);
    expect(controller.revision).toBe(1);
    expect(controller.pipelineState).toBe('idle');
    expect(controller.pending).toBe(0);
    const states = onStateChange.mock.calls.map((c) => c[0]);
    expect(states).toContain('awaitingAck');
    expect(states[states.length - 1]).toBe('idle');
  });

  it('retries with the SAME transaction id on a transient error, then succeeds', async () => {
    const applyPatch = vi
      .fn()
      .mockRejectedValueOnce({ code: 'io', message: 'network' })
      .mockResolvedValueOnce({ revision: 1, confirmedHash: 'h1' });
    const { controller } = makeController({ applyPatch: applyPatch as any });
    controller.onUserEdit();
    await tick(150);
    expect(applyPatch).toHaveBeenCalledTimes(2);
    const txnIds = new Set(applyPatch.mock.calls.map((c) => c[0].transactionId as number));
    expect(txnIds.size).toBe(1); // same txn id across retries
    expect(controller.revision).toBe(1);
    expect(controller.pipelineState).toBe('idle');
  });

  it('enters blocked after exhausting retries and preserves optimistic text', async () => {
    const applyPatch = vi.fn().mockRejectedValue({ code: 'io', message: 'disk' });
    const { controller, onStateChange } = makeController({ applyPatch: applyPatch as any });
    controller.onUserEdit();
    await tick(400);
    expect(controller.isBlocked()).toBe(true);
    expect(onStateChange).toHaveBeenCalledWith('blocked', expect.anything());
  });

  it('resyncs with a fresh transaction id on stale-revision', async () => {
    const applyPatch = vi
      .fn()
      .mockRejectedValueOnce({ code: 'stale-revision', message: 'stale' })
      .mockResolvedValueOnce({ revision: 2, confirmedHash: 'h2' });
    const getSnapshot = vi.fn(async () => ({
      revision: 1,
      logicalText: 'confirmed',
      confirmedHash: 'h1',
    }));
    const applyLocalChanges = vi.fn();
    const { controller } = makeController({
      applyPatch: applyPatch as any,
      getSnapshot,
      applyLocalChanges,
    });
    // First send produces txn 1; it is rejected as stale → resync → fresh txn 2.
    controller.onUserEdit();
    await tick(50);
    expect(applyLocalChanges).toHaveBeenCalled();
    expect(applyPatch).toHaveBeenCalledTimes(2);
    expect((applyPatch.mock.calls as any)[0][0].transactionId).toBe(1);
    expect((applyPatch.mock.calls as any)[1][0].transactionId).toBe(2);
    expect((applyPatch.mock.calls as any)[1][0].baseRevision).toBe(1);
    expect(controller.revision).toBe(2);
    expect(controller.pipelineState).toBe('idle');
  });

  it('flush() drains pending edits and returns Flushed with the confirmed revision', async () => {
    const { controller } = makeController();
    controller.onUserEdit();
    controller.onUserEdit();
    const flush = await controller.flush();
    expect(flush).toEqual({ status: 'flushed', revision: 1, confirmedHash: 'h1' });
    expect(controller.pending).toBe(0);
  });

  it('flush() returns Blocked when the pipeline is blocked', async () => {
    const applyPatch = vi.fn().mockRejectedValue({ code: 'io', message: 'disk' });
    const { controller } = makeController({ applyPatch: applyPatch as any });
    controller.onUserEdit();
    await tick(400);
    const flush = await controller.flush();
    expect(flush.status).toBe('blocked');
  });

  it('dispose() cancels timers, rejects pending flush with Disposed, and drops late acks', async () => {
    let releaseAck!: (r: any) => void;
    const applyPatch = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseAck = resolve;
        }),
    );
    const { controller } = makeController({ applyPatch: applyPatch as any });
    controller.onUserEdit();
    await tick();
    const flushPromise = controller.flush();
    controller.dispose();
    const flush = await flushPromise;
    expect(flush.status).toBe('disposed');
    // A late ack after disposal must be dropped (identity guard).
    releaseAck({ revision: 1, confirmedHash: 'h1' });
    await tick();
    expect(controller.pipelineState).toBe('disposed');
    expect(controller.revision).toBe(0);
  });

  it('isInFlight() is true while a patch awaits its ack (in-flight dirty hole)', async () => {
    let releaseAck!: (r: any) => void;
    const applyPatch = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseAck = resolve;
        }),
    );
    const { controller } = makeController({ applyPatch: applyPatch as any });
    controller.onUserEdit();
    await tick();
    // pending is 0 (frame consumed) but the patch is in flight — must NOT look clean.
    expect(controller.pending).toBe(0);
    expect(controller.isInFlight()).toBe(true);
    releaseAck({ revision: 1, confirmedHash: 'h1' });
    await tick(20);
    expect(controller.isInFlight()).toBe(false);
    expect(controller.pipelineState).toBe('idle');
  });

  it('does not send while in flight; queues edits until the ack lands', async () => {
    let releaseAck!: (r: any) => void;
    const applyPatch = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseAck = resolve;
        }),
    );
    const { controller } = makeController({ applyPatch: applyPatch as any });
    controller.onUserEdit();
    await tick();
    expect(applyPatch).toHaveBeenCalledTimes(1);
    controller.onUserEdit(); // arrives while awaiting ack
    expect(applyPatch).toHaveBeenCalledTimes(1); // not yet a second send
    releaseAck({ revision: 1, confirmedHash: 'h1' });
    await tick(30);
    expect(applyPatch).toHaveBeenCalledTimes(2);
    expect((applyPatch.mock.calls as any)[1][0].transactionId).toBe(2);
  });
});

describe('diffText', () => {
  it('returns the minimal change between two strings', () => {
    expect(diffText('hello world', 'hello CM world')).toEqual([
      { from: 6, to: 6, insert: 'CM ' },
    ]);
    expect(diffText('abc', 'abc')).toEqual([]);
    expect(diffText('abc', 'XYZabc')).toEqual([{ from: 0, to: 0, insert: 'XYZ' }]);
    expect(diffText('abc', 'abcXYZ')).toEqual([{ from: 3, to: 3, insert: 'XYZ' }]);
  });
});
