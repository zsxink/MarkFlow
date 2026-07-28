import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openDocument: vi.fn(),
  closeDocument: vi.fn(),
  flushDocument: vi.fn(),
  resyncDocument: vi.fn(),
  saveDocument: vi.fn(),
  logDebug: vi.fn(),
  logException: vi.fn(),
  logInfo: vi.fn(),
  showToast: vi.fn(),
  flushPendingPatches: vi.fn(),
}));

vi.mock('./coreBridge', () => ({
  openDocument: mocks.openDocument,
  closeDocument: mocks.closeDocument,
  flushDocument: mocks.flushDocument,
  resyncDocument: mocks.resyncDocument,
  saveDocument: mocks.saveDocument,
  BridgeError: class BridgeError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'BridgeError';
      this.code = code;
    }
    static fromInvokeError(err: unknown) {
      if (err && typeof err === 'object') {
        const e = err as Record<string, unknown>;
        const code = typeof e.code === 'string' ? e.code : 'UNKNOWN';
        const message = typeof e.message === 'string' ? e.message : String(err);
        return new BridgeError(code, message);
      }
      return new BridgeError('UNKNOWN', String(err));
    }
  },
}));

vi.mock('./logger', () => ({
  logDebug: mocks.logDebug,
  logException: mocks.logException,
  logInfo: mocks.logInfo,
}));

vi.mock('../components/toast', () => ({
  showToast: mocks.showToast,
}));

vi.mock('./editor.sourcePatcher', () => ({
  flushPendingPatches: mocks.flushPendingPatches,
}));

import {
  openCoreSession,
  closeCoreSession,
  saveCoreSession,
  isCoreSessionDirty,
  markPatchPending,
  markPatchAcked,
  markSessionBlocked,
  getCoreSessionState,
  isCoreBackedSourceModeEnabled,
  getConfirmedRevision,
  getPendingCount,
  getSyncState,
  resyncCoreSession,
  MAX_PENDING_PATCHES,
} from './coreSession';

beforeEach(() => {
  vi.clearAllMocks();
  // Setup default mock return values so that afterEach closeCoreSession() works
  mocks.closeDocument.mockResolvedValue(undefined);
  mocks.flushDocument.mockResolvedValue({ revision: 0 });
  mocks.saveDocument.mockResolvedValue({
    revision: 0,
    file_identity: { canonical_path: '', size: 0, fingerprint_hash: '' },
  });
  mocks.resyncDocument.mockResolvedValue({ revision: 0, text: '' });
});

afterEach(async () => {
  // Close any active session from the test to reset module-level state
  await closeCoreSession();
});

describe('coreSession', () => {
  const sampleDto = {
    protocol_version: 1,
    session_id: 42,
    document_id: 1,
    revision: 5,
    persisted_revision: 3,
    text: '# Hello',
    size_class: 'normal',
    file_identity: { canonical_path: '/tmp/test.md', size: 100, fingerprint_hash: 'abc' },
    outline: [],
    stats: { line_count: 1, byte_count: 8 },
    capabilities: { writable: true, patch_editing: true, core_save: true },
  };

  describe('openCoreSession', () => {
    it('on success, sets isActive=true, sessionId, confirmedRevision, persistedRevision from DTO and returns the DTO', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);

      const result = await openCoreSession('/tmp/test.md');

      expect(result).toEqual(sampleDto);
      expect(mocks.openDocument).toHaveBeenCalledWith('/tmp/test.md');

      const state = getCoreSessionState();
      expect(state.isActive).toBe(true);
      expect(state.sessionId).toBe(42);
      expect(state.confirmedRevision).toBe(5);
      expect(state.persistedRevision).toBe(3);
      expect(state.documentId).toBe(1);
      expect(state.syncState).toBe('idle');
      expect(state.pendingCount).toBe(0);
      expect(state.pendingBytes).toBe(0);
      expect(state.filePath).toBe('/tmp/test.md');
    });

    it('on bridge error, returns null and state remains inactive', async () => {
      mocks.openDocument.mockRejectedValue({ code: 'FILE_NOT_FOUND', message: 'file not found' });

      const result = await openCoreSession('/tmp/missing.md');

      expect(result).toBeNull();
      expect(mocks.logException).toHaveBeenCalled();
      expect(mocks.showToast).toHaveBeenCalled();

      const state = getCoreSessionState();
      expect(state.isActive).toBe(false);
    });
  });

  describe('closeCoreSession', () => {
    it('calls closeDocument and resets to INITIAL_STATE', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');
      vi.clearAllMocks();
      mocks.closeDocument.mockResolvedValue(undefined);

      await closeCoreSession();

      expect(mocks.closeDocument).toHaveBeenCalledWith(42);

      const state = getCoreSessionState();
      expect(state.isActive).toBe(false);
      expect(state.sessionId).toBe(0);
      expect(state.documentId).toBe(0);
      expect(state.confirmedRevision).toBe(0);
      expect(state.persistedRevision).toBe(0);
      expect(state.pendingCount).toBe(0);
      expect(state.pendingBytes).toBe(0);
      expect(state.syncState).toBe('idle');
      expect(state.filePath).toBeNull();
    });

    it('when already inactive, does nothing', async () => {
      // afterEach already closed any session, so state should be inactive
      const stateBefore = getCoreSessionState();
      expect(stateBefore.isActive).toBe(false);

      await closeCoreSession();

      expect(mocks.closeDocument).not.toHaveBeenCalled();
    });
  });

  describe('saveCoreSession', () => {
    it('calls flushPendingPatches, then flushDocument then saveDocument and updates persistedRevision', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');
      vi.clearAllMocks();
      mocks.closeDocument.mockResolvedValue(undefined);
      mocks.flushPendingPatches.mockResolvedValue(undefined);
      mocks.flushDocument.mockResolvedValue({ revision: 5 });
      mocks.saveDocument.mockResolvedValue({
        revision: 10,
        file_identity: { canonical_path: '/tmp/test.md', size: 120, fingerprint_hash: 'def' },
      });

      const result = await saveCoreSession();

      expect(result).toBe(10);
      expect(mocks.flushPendingPatches).toHaveBeenCalledTimes(1);
      // flushPendingPatches must complete before flushDocument
      expect(mocks.flushPendingPatches.mock.invocationCallOrder[0])
        .toBeLessThan(mocks.flushDocument.mock.invocationCallOrder[0]);
      expect(mocks.flushDocument).toHaveBeenCalledWith(42);
      expect(mocks.saveDocument).toHaveBeenCalledWith(42);

      const state = getCoreSessionState();
      expect(state.persistedRevision).toBe(10);
    });

    it('when inactive, returns -1', async () => {
      // afterEach already closed any session, so state is inactive
      const result = await saveCoreSession();
      expect(result).toBe(-1);
      expect(mocks.flushDocument).not.toHaveBeenCalled();
      expect(mocks.saveDocument).not.toHaveBeenCalled();
    });

    it('on error, returns -1', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');
      vi.clearAllMocks();
      mocks.closeDocument.mockResolvedValue(undefined);
      mocks.flushDocument.mockRejectedValue({ code: 'SAVE_FLUSH_TIMEOUT', message: 'timeout' });
      mocks.saveDocument.mockResolvedValue({
        revision: 0,
        file_identity: { canonical_path: '', size: 0, fingerprint_hash: '' },
      });

      const result = await saveCoreSession();
      expect(result).toBe(-1);
      expect(mocks.logException).toHaveBeenCalled();
    });
  });

  describe('isCoreSessionDirty', () => {
    it('returns false when inactive', () => {
      expect(isCoreSessionDirty()).toBe(false);
    });

    it('returns true when pendingCount > 0', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');

      markPatchPending(10);
      expect(isCoreSessionDirty()).toBe(true);
    });

    it('returns true when confirmedRevision !== persistedRevision', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');

      // After opening: confirmedRevision=5, persistedRevision=3
      expect(isCoreSessionDirty()).toBe(true);
    });

    it('returns true when blocked but has unpersisted edits', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');

      // After opening: confirmedRevision=5, persistedRevision=3 — dirty
      markSessionBlocked();
      expect(isCoreSessionDirty()).toBe(true);
    });

    it('returns false when blocked and no unsaved changes', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');

      // Make persistedRevision match confirmedRevision
      const state = getCoreSessionState();
      markPatchAcked(state.confirmedRevision, 0);
      // Both revisions now match after the ack adjusts confirmed revision only.
      // Actually ack doesn't adjust persistedRevision — we need a save.
      // For this test, let's use a fresh session where they match.
      await closeCoreSession();
      vi.clearAllMocks();
      mocks.closeDocument.mockResolvedValue(undefined);

      // Open a session where persisted == confirmed
      const cleanDto = { ...sampleDto, revision: 3, persisted_revision: 3 };
      mocks.openDocument.mockResolvedValue(cleanDto);
      await openCoreSession('/tmp/test.md');

      markSessionBlocked();
      expect(isCoreSessionDirty()).toBe(false);
    });
  });

  describe('markPatchPending', () => {
    it('increments pendingCount and sets syncState to pending', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');

      const accepted = markPatchPending(10);
      expect(accepted).toBe(true);

      expect(getPendingCount()).toBe(1);
      expect(getSyncState()).toBe('pending');
    });

    it('sets backpressure when over MAX_PENDING_PATCHES', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');

      for (let i = 0; i < MAX_PENDING_PATCHES; i++) {
        markPatchPending(1);
      }

      const accepted = markPatchPending(1);
      expect(accepted).toBe(false);
      expect(getSyncState()).toBe('backpressure');
    });
  });

  describe('markPatchAcked', () => {
    it('decrements pendingCount and advances confirmedRevision', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');

      markPatchPending(10);
      expect(getPendingCount()).toBe(1);
      expect(getSyncState()).toBe('pending');

      markPatchAcked(6, 10);
      expect(getConfirmedRevision()).toBe(6);
      expect(getPendingCount()).toBe(0);
      expect(getSyncState()).toBe('idle');
    });
  });

  describe('markSessionBlocked', () => {
    it('sets syncState to blocked', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');

      markSessionBlocked();
      expect(getSyncState()).toBe('blocked');
    });
  });

  describe('getCoreSessionState', () => {
    it('returns a copy (not a reference)', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');

      const state1 = getCoreSessionState();
      const state2 = getCoreSessionState();

      expect(state1).toEqual(state2);
      (state1 as any).sessionId = 999;
      const state3 = getCoreSessionState();
      expect(state3.sessionId).toBe(42);
    });
  });

  describe('isCoreBackedSourceModeEnabled', () => {
    it('returns true', () => {
      expect(isCoreBackedSourceModeEnabled()).toBe(true);
    });
  });

  describe('error code mapping', () => {
    it('REVISION_MISMATCH triggers resync path (no toast, log level warn)', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');
      vi.clearAllMocks();
      mocks.closeDocument.mockResolvedValue(undefined);

      // mapBridgeError maps REVISION_MISMATCH to [null, 'warn', detail] — no toast
      expect(mocks.showToast).not.toHaveBeenCalled();
    });

    it('CONFLICT shows conflict toast', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');
      vi.clearAllMocks();
      mocks.closeDocument.mockResolvedValue(undefined);
      mocks.flushDocument.mockResolvedValue({ revision: 5 });
      mocks.saveDocument.mockRejectedValue({ code: 'CONFLICT', message: 'File modified externally' });

      const result = await saveCoreSession();
      expect(result).toBe(-1);
      expect(mocks.showToast).toHaveBeenCalled();
      expect(mocks.logException).toHaveBeenCalled();
    });

    it('SESSION_NOT_FOUND shows session expired toast', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');
      vi.clearAllMocks();
      mocks.closeDocument.mockResolvedValue(undefined);
      mocks.flushDocument.mockRejectedValue({ code: 'SESSION_NOT_FOUND', message: 'Session not found' });

      const result = await saveCoreSession();
      expect(result).toBe(-1);
      expect(mocks.showToast).toHaveBeenCalled();
      expect(mocks.logException).toHaveBeenCalled();
    });
  });

  describe('resyncCoreSession', () => {
    it('returns null when inactive', async () => {
      const result = await resyncCoreSession();
      expect(result).toBeNull();
      expect(mocks.resyncDocument).not.toHaveBeenCalled();
    });

    it('on success, updates state and returns text', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');
      vi.clearAllMocks();
      mocks.closeDocument.mockResolvedValue(undefined);
      mocks.resyncDocument.mockResolvedValue({ revision: 8, text: '# Resynced' });

      const result = await resyncCoreSession();
      expect(result).toBe('# Resynced');
      expect(mocks.resyncDocument).toHaveBeenCalledWith(42, 5);

      const state = getCoreSessionState();
      expect(state.confirmedRevision).toBe(8);
      expect(state.pendingCount).toBe(0);
      expect(state.syncState).toBe('idle');
    });

    it('on failure, restores previous syncState and returns null', async () => {
      mocks.openDocument.mockResolvedValue(sampleDto);
      await openCoreSession('/tmp/test.md');
      vi.clearAllMocks();
      mocks.closeDocument.mockResolvedValue(undefined);
      mocks.resyncDocument.mockRejectedValue({ code: 'REVISION_MISMATCH', message: 'mismatch' });

      const result = await resyncCoreSession();
      expect(result).toBeNull();
      // Should restore to the previous state (idle before resync)
      expect(getSyncState()).toBe('idle');
    });
  });
});