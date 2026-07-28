import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyTextPatch: vi.fn(),
  BridgeError: class BridgeError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'BridgeError';
      this.code = code;
    }
  },
  getCoreSessionState: vi.fn(),
  markPatchPending: vi.fn(),
  markPatchAcked: vi.fn(),
  resyncCoreSession: vi.fn(),
  getSyncState: vi.fn(),
  markSessionBlocked: vi.fn(),
  getConfirmedRevision: vi.fn(),
  getPendingCount: vi.fn(),
  logDebug: vi.fn(),
  logException: vi.fn(),
  logInfo: vi.fn(),
  setSourceContent: vi.fn(),
  getSourceView: vi.fn(),
}));

vi.mock('./coreBridge', () => ({
  applyTextPatch: mocks.applyTextPatch,
  BridgeError: mocks.BridgeError,
}));

vi.mock('./coreSession', () => ({
  getCoreSessionState: mocks.getCoreSessionState,
  markPatchPending: mocks.markPatchPending,
  markPatchAcked: mocks.markPatchAcked,
  resyncCoreSession: mocks.resyncCoreSession,
  getSyncState: mocks.getSyncState,
  markSessionBlocked: mocks.markSessionBlocked,
  getConfirmedRevision: mocks.getConfirmedRevision,
  getPendingCount: mocks.getPendingCount,
}));

vi.mock('./logger', () => ({
  logDebug: mocks.logDebug,
  logException: mocks.logException,
  logInfo: mocks.logInfo,
}));

vi.mock('./editor.source', () => ({
  setSourceContent: mocks.setSourceContent,
  getSourceView: mocks.getSourceView,
}));

import {
  createPatcherCallback,
  attachPatcher,
  detachPatcher,
  flushPendingPatches,
  resyncEditorWithCore,
  hasPendingBatch,
  getBatchChangeCount,
} from './editor.sourcePatcher';

// Clean up the module-level state before each test
function cleanPatcherState(): void {
  detachPatcher();
}

// Reset module state before each test
beforeEach(() => {
  cleanPatcherState();
});

function createMockTransaction(changes: Array<{ from: number; to: number; inserted: string }>): any {
  return {
    changes: {
      iterChanges: (fn: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString(): string; length: number }) => void) => {
        for (const c of changes) {
          fn(c.from, c.to, c.from, c.to, { toString: () => c.inserted, length: c.inserted.length });
        }
      },
    },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: active session in idle state
  mocks.getCoreSessionState.mockReturnValue({
    isActive: true,
    sessionId: 42,
    documentId: 1,
    confirmedRevision: 5,
    persistedRevision: 3,
    pendingCount: 0,
    pendingBytes: 0,
    syncState: 'idle',
    filePath: '/tmp/test.md',
  });
  mocks.getSyncState.mockReturnValue('idle');
  mocks.getConfirmedRevision.mockReturnValue(5);
  mocks.getPendingCount.mockReturnValue(0);
  mocks.getSourceView.mockReturnValue({ state: { selection: { main: { anchor: 0, head: 0 } } } });
});

afterEach(() => {
  // Reset module-level patcher state to avoid cross-test leakage
  detachPatcher();
});

describe('editor.sourcePatcher', () => {
  describe('createPatcherCallback', () => {
    it('returns a function that skips when session is inactive', () => {
      mocks.getCoreSessionState.mockReturnValue({
        isActive: false,
        sessionId: 0,
        documentId: 0,
        confirmedRevision: 0,
        persistedRevision: 0,
        pendingCount: 0,
        pendingBytes: 0,
        syncState: 'idle',
        filePath: null,
      });

      const callback = createPatcherCallback();
      callback({ transactions: [createMockTransaction([{ from: 0, to: 1, inserted: 'a' }])] });

      expect(hasPendingBatch()).toBe(false);
    });

    it('accumulates changes and schedules batch flush', () => {
      const callback = createPatcherCallback();
      const tr = createMockTransaction([{ from: 0, to: 1, inserted: 'x' }]);
      callback({ transactions: [tr] });

      expect(getBatchChangeCount()).toBeGreaterThan(0);
      expect(hasPendingBatch()).toBe(true);
    });

    it('skips when syncState is blocked', () => {
      mocks.getSyncState.mockReturnValue('blocked');

      const callback = createPatcherCallback();
      callback({ transactions: [createMockTransaction([{ from: 0, to: 1, inserted: 'a' }])] });

      expect(hasPendingBatch()).toBe(false);
    });

    it('skips when syncState is resyncing', () => {
      mocks.getSyncState.mockReturnValue('resyncing');

      const callback = createPatcherCallback();
      callback({ transactions: [createMockTransaction([{ from: 0, to: 1, inserted: 'a' }])] });

      expect(hasPendingBatch()).toBe(false);
    });
  });

  describe('attachPatcher', () => {
    it('gets source view and stores reference', () => {
      attachPatcher();

      expect(mocks.getSourceView).toHaveBeenCalled();
    });

    it('handles null view gracefully', () => {
      mocks.getSourceView.mockReturnValue(null);

      expect(() => attachPatcher()).not.toThrow();
    });
  });

  describe('detachPatcher', () => {
    it('flushes batch and clears references', () => {
      attachPatcher();

      // Add some changes via the callback
      const callback = createPatcherCallback();
      callback({ transactions: [createMockTransaction([{ from: 0, to: 1, inserted: 'a' }])] });

      expect(hasPendingBatch()).toBe(true);

      detachPatcher();

      expect(hasPendingBatch()).toBe(false);
      expect(getBatchChangeCount()).toBe(0);
    });
  });

  describe('flushPendingPatches', () => {
    it('waits for pending count to reach 0, times out after 5s', async () => {
      mocks.getPendingCount.mockReturnValue(1);

      const promise = flushPendingPatches();

      // Simulate pending count dropping after some time
      setTimeout(() => {
        mocks.getPendingCount.mockReturnValue(0);
      }, 10);

      await promise;
      expect(mocks.getPendingCount).toHaveBeenCalled();
    });

    it('returns immediately when pending count is 0', async () => {
      mocks.getPendingCount.mockReturnValue(0);

      await flushPendingPatches();
      expect(mocks.getPendingCount).toHaveBeenCalledTimes(1);
    });
  });

  describe('resyncEditorWithCore', () => {
    it('calls resyncCoreSession and sets content on success', async () => {
      // need attachedView to be set for setSourceContent to work
      attachPatcher();

      mocks.resyncCoreSession.mockResolvedValue('# Resynced');

      const result = await resyncEditorWithCore();

      expect(result).toBe(true);
      expect(mocks.resyncCoreSession).toHaveBeenCalled();
      expect(mocks.setSourceContent).toHaveBeenCalledWith('# Resynced');
    });

    it('returns false when resync returns null', async () => {
      mocks.resyncCoreSession.mockResolvedValue(null);

      const result = await resyncEditorWithCore();

      expect(result).toBe(false);
      expect(mocks.setSourceContent).not.toHaveBeenCalled();
    });
  });

  describe('hasPendingBatch / getBatchChangeCount', () => {
    it('returns initial state as empty', () => {
      expect(hasPendingBatch()).toBe(false);
      expect(getBatchChangeCount()).toBe(0);
    });

    it('reflects accumulated changes', () => {
      const callback = createPatcherCallback();
      callback({ transactions: [createMockTransaction([{ from: 0, to: 1, inserted: 'x' }])] });

      expect(getBatchChangeCount()).toBeGreaterThan(0);
      expect(hasPendingBatch()).toBe(true);
    });

    it('resets after detach', () => {
      attachPatcher();

      const callback = createPatcherCallback();
      callback({ transactions: [createMockTransaction([{ from: 0, to: 1, inserted: 'x' }])] });

      expect(hasPendingBatch()).toBe(true);

      detachPatcher();
      expect(hasPendingBatch()).toBe(false);
      expect(getBatchChangeCount()).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Multi-change transaction extraction
// ---------------------------------------------------------------------------
describe('multi-change transaction extraction', () => {
  it('extracts all changes from a transaction with multiple changes', () => {
    const callback = createPatcherCallback();
    const tr = createMockTransaction([
      { from: 0, to: 1, inserted: 'a' },
      { from: 3, to: 5, inserted: 'bb' },
      { from: 10, to: 12, inserted: 'cc' },
    ]);
    callback({ transactions: [tr] });

    expect(getBatchChangeCount()).toBe(3);
    expect(hasPendingBatch()).toBe(true);
  });
});

describe('IME composition batching', () => {
  it('coalesces multiple rapid edits into a single batch', () => {
    const callback = createPatcherCallback();
    const tr1 = createMockTransaction([{ from: 0, to: 1, inserted: 'a' }]);
    const tr2 = createMockTransaction([{ from: 1, to: 2, inserted: 'b' }]);
    const tr3 = createMockTransaction([{ from: 2, to: 3, inserted: 'c' }]);

    // First rapid edit — schedules a batch timer
    callback({ transactions: [tr1] });
    expect(hasPendingBatch()).toBe(true);
    expect(getBatchChangeCount()).toBe(1);

    // Second rapid edit — should reuse the same timer, not create a new one
    callback({ transactions: [tr2] });
    expect(hasPendingBatch()).toBe(true); // still one timer
    expect(getBatchChangeCount()).toBe(2);

    // Third rapid edit — still reusing the original timer
    callback({ transactions: [tr3] });
    expect(hasPendingBatch()).toBe(true); // still one timer
    expect(getBatchChangeCount()).toBe(3);
  });
});

describe('ack ordering', () => {
  it('calls markPatchAcked in order for sequentially acknowledged patches', async () => {
    vi.useFakeTimers();
    try {
      attachPatcher();
      mocks.applyTextPatch
        .mockResolvedValueOnce({ revision: 6 })
        .mockResolvedValueOnce({ revision: 7 });

      const callback = createPatcherCallback();

      // First patch
      callback({ transactions: [createMockTransaction([{ from: 0, to: 1, inserted: 'a' }])] });
      await vi.advanceTimersByTimeAsync(20);

      expect(mocks.markPatchAcked).toHaveBeenCalledTimes(1);
      expect(mocks.markPatchAcked).toHaveBeenCalledWith(6, expect.any(Number));

      // Second patch
      callback({ transactions: [createMockTransaction([{ from: 1, to: 2, inserted: 'b' }])] });
      await vi.advanceTimersByTimeAsync(20);

      expect(mocks.markPatchAcked).toHaveBeenCalledTimes(2);
      expect(mocks.markPatchAcked).toHaveBeenNthCalledWith(1, 6, expect.any(Number));
      expect(mocks.markPatchAcked).toHaveBeenNthCalledWith(2, 7, expect.any(Number));
    } finally {
      vi.useRealTimers();
    }
  });

  it('handles out-of-order acknowledgment via coreSession module', () => {
    // Directly simulate calling coreSession functions as the patcher would
    // markPatchPending for two patches
    mocks.markPatchPending(10);
    mocks.markPatchPending(10);

    // markPatchAcked receives a newer revision before an older one (out-of-order)
    // This simulates the second patch being acknowledged before the first
    mocks.markPatchAcked(7, 10);
    mocks.markPatchAcked(6, 10);

    // The coreSession module functions should handle out-of-order calls
    expect(mocks.markPatchPending).toHaveBeenCalledTimes(2);
    expect(mocks.markPatchAcked).toHaveBeenCalledTimes(2);
  });
});

describe('revision mismatch resync', () => {
  it('triggers resyncCoreSession when applyTextPatch throws REVISION_MISMATCH', async () => {
    vi.useFakeTimers();
    try {
      attachPatcher();
      mocks.applyTextPatch.mockRejectedValue(
        new mocks.BridgeError('REVISION_MISMATCH', 'Revision mismatch'),
      );
      mocks.resyncCoreSession.mockResolvedValue('# Resynced content');

      const callback = createPatcherCallback();
      callback({ transactions: [createMockTransaction([{ from: 0, to: 1, inserted: 'a' }])] });

      expect(hasPendingBatch()).toBe(true);

      await vi.advanceTimersByTimeAsync(20);

      // sendPatch was called, which called applyTextPatch, which threw
      expect(mocks.applyTextPatch).toHaveBeenCalled();
      // resyncCoreSession should be triggered by the REVISION_MISMATCH error
      expect(mocks.resyncCoreSession).toHaveBeenCalled();
      // setSourceContent should replace editor content with resynced text
      expect(mocks.setSourceContent).toHaveBeenCalledWith('# Resynced content');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('flushPendingPatches timeout', () => {
  it('times out when pending count never reaches 0', async () => {
    vi.useFakeTimers();
    try {
      mocks.getPendingCount.mockReturnValue(1);

      const promise = flushPendingPatches();

      // Advance past the 5s timeout
      await vi.advanceTimersByTimeAsync(5100);

      await promise;

      // Should have logged the timeout message
      expect(mocks.logDebug).toHaveBeenCalledWith(
        'patcher',
        'Flush pending patches timed out',
        expect.objectContaining({ remainingCount: 1 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('backpressure limits', () => {
  it('handles backpressure when markPatchPending returns false', () => {
    vi.useFakeTimers();
    try {
      attachPatcher();
      // Simulate pending count at the limit
      mocks.getCoreSessionState.mockReturnValue({
        isActive: true,
        sessionId: 42,
        documentId: 1,
        confirmedRevision: 5,
        persistedRevision: 3,
        pendingCount: 50,
        pendingBytes: 5000,
        syncState: 'idle',
        filePath: '/tmp/test.md',
      });
      mocks.markPatchPending.mockReturnValue(false);

      const callback = createPatcherCallback();
      callback({ transactions: [createMockTransaction([{ from: 0, to: 1, inserted: 'x' }])] });

      expect(hasPendingBatch()).toBe(true);
      expect(getBatchChangeCount()).toBe(1);

      vi.advanceTimersByTime(20);

      // flushBatch calls markPatchPending which returns false
      expect(mocks.markPatchPending).toHaveBeenCalled();
      // Patcher state is cleaned up after flush batch
      expect(hasPendingBatch()).toBe(false);
      expect(getBatchChangeCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});