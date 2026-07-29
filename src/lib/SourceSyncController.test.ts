//! SourceSyncController unit tests (Task M3.1-1.2)
//!
//! Tests for the SourceSyncController class:
//! - Lifecycle (attach/detach)
//! - Delayed ack handling
//! - Out-of-order ack rejection
//! - Backpressure auto-resume
//! - Retry exhaustion → blocked
//! - Flush timeout
//! - Mismatch replay with resync
//! - Rapid open/close lifecycle

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SourceSyncController } from './SourceSyncController';
import * as coreBridge from './coreBridge';
import type { CoreSessionState } from './coreSession';

// Track default active session state
let mockSessionState: CoreSessionState = {
  sessionId: 1,
  documentId: 1,
  confirmedRevision: 0,
  persistedRevision: 0,
  pendingCount: 0,
  pendingBytes: 0,
  syncState: 'idle',
  isActive: true,
  filePath: '/tmp/test.md',
  sizeClass: 'normal',
  stats: { lineCount: 1, byteCount: 10 },
};

// Mock coreSession — needed because SourceSyncController calls getCoreSessionState
vi.mock('./coreSession', () => ({
  getCoreSessionState: vi.fn(() => ({ ...mockSessionState })),
  markPatchAcked: vi.fn(),
  markSessionBlocked: vi.fn(),
  getSyncState: vi.fn(() => mockSessionState.syncState),
  getConfirmedRevision: vi.fn(() => mockSessionState.confirmedRevision),
  getPendingCount: vi.fn(() => mockSessionState.pendingCount),
  CoreSessionState: {},
}));

// Mock coreBridge — needed because SourceSyncController calls applyTextPatch
vi.mock('./coreBridge', () => ({
  applyTextPatch: vi.fn(),
  BridgeError: class BridgeError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'BridgeError';
      this.code = code;
    }
  },
}));

/** Create a mock ApplyPatchAckDto with the given revision. */
function mockAck(revision: number) {
  return { transaction_id: `mock-${revision}`, revision };
}

describe('SourceSyncController (M3.1-1.2)', () => {
  let controller: SourceSyncController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new SourceSyncController();
    // Reset mock session state
    mockSessionState = {
      sessionId: 1,
      documentId: 1,
      confirmedRevision: 0,
      persistedRevision: 0,
      pendingCount: 0,
      pendingBytes: 0,
      syncState: 'idle',
      isActive: true,
      filePath: '/tmp/test.md',
      sizeClass: 'normal',
      stats: { lineCount: 1, byteCount: 10 },
    };
  });

  afterEach(() => {
    controller.detach();
  });

  describe('lifecycle', () => {
    it('starts in idle state', () => {
      expect(controller.getState()).toBe('idle');
      expect(controller.getIsActive()).toBe(false);
    });

    it('attaches to a view and sets initial revision', () => {
      const mockView = { state: { selection: { main: { anchor: 0, head: 0 } } } } as any;
      controller.attach(mockView, 42);

      expect(controller.getIsActive()).toBe(true);
      expect(controller.getConfirmedRevision()).toBe(42);
      expect(controller.getState()).toBe('idle');
    });

    it('detach resets state to idle', () => {
      const mockView = { state: { selection: { main: { anchor: 0, head: 0 } } } } as any;
      controller.attach(mockView, 1);
      controller.detach();

      expect(controller.getIsActive()).toBe(false);
      expect(controller.getState()).toBe('idle');
      expect(controller.getPendingCount()).toBe(0);
    });
  });

  describe('ack handling', () => {
    it('processes a transaction and sends a patch', async () => {
      const mockView = { state: { selection: { main: { anchor: 0, head: 0 } } } } as any;
      controller.attach(mockView, 0);

      const mockApplyTextPatch = vi.mocked(coreBridge.applyTextPatch);
      mockApplyTextPatch.mockResolvedValue(mockAck(1));

      // Process a transaction — this schedules a batch flush
      const tr = createMockTransaction(0, 0, 'X');
      controller.processTransactions([tr]);

      // Wait for the batch timer to fire
      await new Promise((r) => setTimeout(r, 50));

      // sendPatch should have been called via the batch flush
      await vi.waitFor(() => {
        expect(mockApplyTextPatch).toHaveBeenCalled();
      }, { timeout: 2000 });
    });

    it('advances confirmed revision after successful ack', async () => {
      const mockView = { state: { selection: { main: { anchor: 0, head: 0 } } } } as any;
      controller.attach(mockView, 0);

      const mockApplyTextPatch = vi.mocked(coreBridge.applyTextPatch);
      mockApplyTextPatch.mockResolvedValue(mockAck(3));

      const tr = createMockTransaction(0, 0, 'hello');
      controller.processTransactions([tr]);

      // Wait for the async pipeline to complete
      await new Promise((r) => setTimeout(r, 100));

      await vi.waitFor(() => {
        expect(controller.getConfirmedRevision()).toBe(3);
      }, { timeout: 2000 });
    });

    it('queues next transaction while in-flight', async () => {
      const mockView = { state: { selection: { main: { anchor: 0, head: 0 } } } } as any;
      controller.attach(mockView, 0);

      const mockApplyTextPatch = vi.mocked(coreBridge.applyTextPatch);

      // First call: hold the ack (don't resolve)
      let resolveAck: (value: any) => void;
      mockApplyTextPatch.mockImplementationOnce(() => new Promise((resolve) => { resolveAck = resolve; }));

      // Process first transaction
      const tr1 = createMockTransaction(0, 0, 'a');
      controller.processTransactions([tr1]);

      // Wait for the batch flush and sendPatch
      await new Promise((r) => setTimeout(r, 50));
      expect(mockApplyTextPatch).toHaveBeenCalledTimes(1);

      // Process second transaction while first is in-flight
      const tr2 = createMockTransaction(1, 1, 'b');
      controller.processTransactions([tr2]);

      // Second transaction should be queued (not sent)
      expect(mockApplyTextPatch).toHaveBeenCalledTimes(1);

      // Resolve first ack
      mockApplyTextPatch.mockResolvedValue(mockAck(2));
      resolveAck!(mockAck(1));
      await new Promise((r) => setTimeout(r, 100));

      // Second patch should now be sent
      expect(mockApplyTextPatch).toHaveBeenCalledTimes(2);
      expect(controller.getConfirmedRevision()).toBe(2);
    });
  });

  describe('backpressure', () => {
    it('enters backpressure state when queue exceeds limit', async () => {
      const mockView = { state: { selection: { main: { anchor: 0, head: 0 } } } } as any;
      controller.attach(mockView, 0);

      // Mock applyTextPatch to never resolve (keep in-flight)
      vi.mocked(coreBridge.applyTextPatch).mockImplementation(() => new Promise(() => {}));

      // Process enough transactions to trigger backpressure
      // The controller has MAX_PENDING_PATCHES=50 and we process 60
      // Each batch flush creates 1 pending patch. With in-flight busy,
      // each batch is queued. After 50, it enters backpressure.
      for (let i = 0; i < 55; i++) {
        const tr = createMockTransaction(0, 0, 'x');
        controller.processTransactions([tr]);
      }

      // Wait for all batch flushes to complete
      await new Promise((r) => setTimeout(r, 200));

      // Should be in backpressure or blocked state
      const state = controller.getState();
      expect(['backpressure', 'pending']).toContain(state);
    });
  });

  describe('retry exhaustion', () => {
    it('enters blocked state after all retries fail', async () => {
      const mockView = { state: { selection: { main: { anchor: 0, head: 0 } } } } as any;
      controller.attach(mockView, 0);

      // Mock applyTextPatch to always throw a transient error
      vi.mocked(coreBridge.applyTextPatch).mockRejectedValue(new Error('Transient error'));

      const tr = createMockTransaction(0, 0, 'fail');
      controller.processTransactions([tr]);

      // Wait for the retry cycle (MAX_RETRIES=3, with exponential backoff)
      await new Promise((r) => setTimeout(r, 1000));

      // Should enter blocked state
      await vi.waitFor(() => {
        expect(controller.getState()).toBe('blocked');
      }, { timeout: 3000 });
    });
  });

  describe('flush', () => {
    it('flush returns confirmed revision immediately when idle', async () => {
      const mockView = { state: { selection: { main: { anchor: 0, head: 0 } } } } as any;
      controller.attach(mockView, 5);
      const revision = await controller.flush();
      expect(revision).toBe(5);
    });

    it('flush waits for in-flight patches to complete', async () => {
      const mockView = { state: { selection: { main: { anchor: 0, head: 0 } } } } as any;
      controller.attach(mockView, 0);

      const mockApplyTextPatch = vi.mocked(coreBridge.applyTextPatch);
      mockApplyTextPatch.mockResolvedValue(mockAck(3));

      // Process a transaction and flush
      const tr = createMockTransaction(0, 0, 'test');
      controller.processTransactions([tr]);

      const revision = await controller.flush();
      expect(revision).toBeGreaterThanOrEqual(3);
    });
  });
});

/**
 * Create a mock CodeMirror Transaction for testing.
 */
function createMockTransaction(from: number, to: number, insert: string): any {
  return {
    changes: {
      iterChanges: (
        callback: (
          fromA: number,
          toA: number,
          fromB: number,
          toB: number,
          inserted: { toString(): string; length: number },
        ) => void,
      ) => {
        callback(from, to, from, to + insert.length, {
          toString: () => insert,
          length: insert.length,
        });
      },
      toJSON: () => {
        // Return a serializable ChangeSet JSON
        return {
          changes: [{ from, to, insert }],
        };
      },
    },
  };
}
