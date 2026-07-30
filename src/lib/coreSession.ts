//! Core-backed Source Mode session management.
//!
//! Manages the lifecycle, state tracking, and dirty detection for a single
//! Core-backed document session from the frontend side.
//!
//! # Session lifecycle
//!
//! 1. `openCoreSession(path)` - opens a document via the Core Bridge,
//!    storing the returned session_id and initial revision.
//! 2. `closeCoreSession()` - closes the session, releasing Core resources.
//! 3. Patches are applied via `coreBridge.applyTextPatch()`. The ack
//!    advances `confirmedRevision`.
//! 4. `syncState` tracks the pipeline status: idle → pending → backpressure
//!    → resyncing → idle.

import {
  type DocumentOpenedDto,
  BridgeError,
  openDocument,
  closeDocument,
  flushDocument,
  resyncDocument,
  saveDocument,
} from './coreBridge';
import { logDebug, logException, logInfo } from './logger';
import { showToast } from '../components/toast';
import { getCachedSettings } from './storage';

// Import type only to avoid circular dependency with SourceSyncController.ts
import type { SourceSyncController } from './SourceSyncController';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of pending unacknowledged patches before backpressure. */
export const MAX_PENDING_PATCHES = 50;

/** Maximum total byte length of pending patches before backpressure. */
export const MAX_PENDING_BYTES = 1_048_576; // 1MB

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Sync pipeline state for the Core-backed source mode.
 *
 * - `idle`: no pending patches, fully synced with Core.
 * - `pending`: patches are outstanding, waiting for ack.
 * - `backpressure`: pending queue exceeded limits — new edits are
 *   temporarily blocked until acks reduce the backlog.
 * - `resyncing`: a revision mismatch was detected — the adapter is
 *   fetching the confirmed snapshot to reconcile.
 * - `blocked`: an unrecoverable error occurred (e.g. session closed).
 */
export type SyncState = 'idle' | 'pending' | 'backpressure' | 'resyncing' | 'blocked';

/** Serializable state of a Core-backed session. */
export interface CoreSessionState {
  /** Core-assigned session ID (0 means no active session). */
  sessionId: number;
  /** Core-assigned document ID. */
  documentId: number;
  /** The revision confirmed by Core via the last ack. */
  confirmedRevision: number;
  /** The revision persisted to disk (updated after save). */
  persistedRevision: number;
  /** Number of patches sent but not yet acknowledged. */
  pendingCount: number;
  /** Total byte length of pending changes. */
  pendingBytes: number;
  /** Sync pipeline state. */
  syncState: SyncState;
  /** Whether the session is currently active. */
  isActive: boolean;
  /** File path for the opened document. */
  filePath: string | null;
  /** Size classification from the Core backend. */
  sizeClass: string;
  /** Document statistics from the Core backend. */
  stats: { lineCount: number; byteCount: number } | null;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: CoreSessionState = {
  sessionId: 0,
  documentId: 0,
  confirmedRevision: 0,
  persistedRevision: 0,
  pendingCount: 0,
  pendingBytes: 0,
  syncState: 'idle',
  isActive: false,
  filePath: null,
  sizeClass: 'normal',
  stats: null,
};

// ---------------------------------------------------------------------------
// Module-level state (singleton — one session at a time in a single window)
// ---------------------------------------------------------------------------

let currentSession: CoreSessionState = { ...INITIAL_STATE };
let onStateChange: ((state: CoreSessionState) => void) | null = null;

/** Monotonic generation counter, incremented per open/close cycle. */
let generation = 0;

function nextGeneration(): number {
  return ++generation;
}

/** Promise-based guard for idempotent closeCoreSession(). */
let closePromise: Promise<void> | null = null;

/**
 * SourceSyncController reference, set externally by editor.ts during source
 * mode initialization. This avoids a circular dependency: SourceSyncController
 * imports from coreSession (for getCoreSessionState, etc.), so coreSession
 * cannot import from SourceSyncController at the module level.
 *
 * Instead, editor.ts creates the controller and registers it here.
 */
let _sourceSyncController: SourceSyncController | null = null;

/**
 * Register the SourceSyncController instance. Called by editor.ts during
 * source mode initialization (switchToSource).
 */
export function setSourceSyncController(c: SourceSyncController): void {
  _sourceSyncController = c;
}

/**
 * Get the SourceSyncController instance. Throws if not initialized.
 * Called by editor.ts (attach/detach) and saveCoreSession (flush barrier).
 */
export function getSourceSyncController(): SourceSyncController {
  if (!_sourceSyncController) {
    throw new Error('SourceSyncController not initialized — call setSourceSyncController first');
  }
  return _sourceSyncController;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function updateState(partial: Partial<CoreSessionState>): void {
  currentSession = { ...currentSession, ...partial };
  if (onStateChange) {
    try {
      onStateChange(currentSession);
    } catch {
      // Isolate listener errors
    }
  }
}

/**
 * Map a BridgeError to a user-friendly message and optional log level.
 * Returns [toastMessage, logLevel, logDetail].
 */
function mapBridgeError(err: BridgeError): [string | null, string, string] {
  switch (err.code) {
    case 'SESSION_NOT_FOUND':
      return ['编辑会话已失效，请重新打开文件', 'warn', `Session not found: ${err.message}`];
    case 'REVISION_MISMATCH':
      return [null, 'warn', `Revision mismatch: ${err.message}`];
    case 'INVALID_UTF16_BOUNDARY':
      return ['编辑冲突，将重新同步', 'warn', `Invalid UTF-16 boundary: ${err.message}`];
    case 'INVALID_RANGE':
      return ['编辑范围异常，将重新同步', 'warn', `Invalid range: ${err.message}`];
    case 'TRANSACTION_CONFLICT':
      return [null, 'debug', `Transaction conflict: ${err.message}`];
    case 'CONFLICT':
      return ['文件已被外部修改，保存时发生冲突', 'error', `Conflict: ${err.message}`];
    case 'SAVE_FLUSH_TIMEOUT':
      return ['保存超时，请重试', 'error', `Save timeout: ${err.message}`];
    case 'PENDING_QUEUE_FULL':
      return ['待处理队列已满，请等待同步', 'warn', `Queue full: ${err.message}`];
    case 'UNSUPPORTED_ENCODING':
      return ['不支持的编码格式', 'error', `Unsupported encoding: ${err.message}`];
    case 'CANCELLED':
      return [null, 'debug', `Cancelled: ${err.message}`];
    default:
      return [`操作失败: ${err.message || '未知错误'}`, 'error', `Bridge error ${err.code}: ${err.message}`];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a callback invoked whenever the core session state changes.
 * Returns a cleanup function to unregister.
 */
export function onCoreSessionChange(cb: (state: CoreSessionState) => void): () => void {
  onStateChange = cb;
  return () => {
    if (onStateChange === cb) {
      onStateChange = null;
    }
  };
}

/** Get the current Core session state snapshot. */
export function getCoreSessionState(): CoreSessionState {
  return { ...currentSession };
}

/** Get the confirmed revision. */
export function getConfirmedRevision(): number {
  return currentSession.confirmedRevision;
}

/** Get the pending patch count. */
export function getPendingCount(): number {
  return currentSession.pendingCount;
}

/** Get the current sync state. */
export function getSyncState(): SyncState {
  return currentSession.syncState;
}

/**
 * Open a Core-backed document session.
 * Returns the opened DTO, or null on failure.
 */
export async function openCoreSession(
  path: string,
): Promise<DocumentOpenedDto | null> {
  if (currentSession.isActive) {
    logDebug('core.session', 'Closing previous session before opening new one', {
      path,
      oldSessionId: currentSession.sessionId,
    });
    await closeCoreSession();
  }

  const gen = nextGeneration();

  try {
    const opened = await openDocument(path);

    // Discard stale responses if another open/close cycle occurred
    if (gen !== generation) {
      logDebug('core.session', 'Discarding stale openCoreSession response', {
        gen,
        currentGen: generation,
      });
      return null;
    }

    updateState({
      sessionId: opened.session_id,
      documentId: opened.document_id,
      confirmedRevision: opened.revision,
      persistedRevision: opened.persisted_revision,
      pendingCount: 0,
      pendingBytes: 0,
      syncState: 'idle',
      isActive: true,
      filePath: path,
      sizeClass: opened.size_class,
      stats: { lineCount: opened.stats.line_count, byteCount: opened.stats.byte_count },
    });

    logInfo('core.session', 'Core session opened', {
      path,
      sessionId: opened.session_id,
      revision: opened.revision,
      fileSize: opened.stats.byte_count,
    });

    return opened;
  } catch (err) {
    if (gen !== generation) {
      logDebug('core.session', 'Discarding stale openCoreSession error', {
        gen,
        currentGen: generation,
      });
      return null;
    }
    const bridgeErr = err instanceof BridgeError ? err : new BridgeError('UNKNOWN', String(err));
    const [toastMsg, _level, detail] = mapBridgeError(bridgeErr);
    logException('core.session', 'Failed to open core session', err, { path, detail });
    if (toastMsg) showToast(toastMsg);
    return null;
  }
}

/**
 * Close the current Core-backed session. Idempotent — concurrent callers
 * receive the same promise.
 */
export async function closeCoreSession(): Promise<void> {
  if (!currentSession.isActive) return;
  if (closePromise) {
    return closePromise;
  }

  const sessionId = currentSession.sessionId;
  const gen = nextGeneration();

  closePromise = (async () => {
    try {
      await closeDocument(sessionId);
      logInfo('core.session', 'Core session closed', { sessionId, gen });
    } catch (err) {
      logException('core.session', 'Error closing core session (non-fatal)', err, { sessionId, gen });
    } finally {
      closePromise = null;
      updateState({ ...INITIAL_STATE });
    }
  })();

  return closePromise;
}

/**
 * Flush pending patches (barrier).
 * Returns the current revision after flush.
 */
export async function flushCoreSession(): Promise<number> {
  if (!currentSession.isActive) {
    logDebug('core.session', 'Flush called on inactive session');
    return 0;
  }

  const gen = generation;

  try {
    const result = await flushDocument(currentSession.sessionId);
    if (gen !== generation) {
      logDebug('core.session', 'Discarding stale flush response', {
        sessionId: currentSession.sessionId,
        gen,
        currentGen: generation,
      });
      return 0;
    }
    logDebug('core.session', 'Session flushed', {
      sessionId: currentSession.sessionId,
      revision: result.revision,
    });
    return result.revision;
  } catch (err) {
    logException('core.session', 'Flush failed', err, {
      sessionId: currentSession.sessionId,
    });
    throw err;
  }
}

/**
 * Resync the Core session to the confirmed revision.
 * Returns the confirmed text, or null on failure.
 */
export async function resyncCoreSession(confirmedRevision?: number): Promise<string | null> {
  if (!currentSession.isActive) return null;

  const gen = generation;
  const rev = confirmedRevision ?? currentSession.confirmedRevision;
  const prevState = currentSession.syncState;
  updateState({ syncState: 'resyncing' });

  try {
    const result = await resyncDocument(currentSession.sessionId, rev);
    if (gen !== generation) {
      logDebug('core.session', 'Discarding stale resync response', {
        gen,
        currentGen: generation,
      });
      return null;
    }
    updateState({
      confirmedRevision: result.revision,
      pendingCount: 0,
      pendingBytes: 0,
      syncState: 'idle',
    });
    logInfo('core.session', 'Session resynced', {
      sessionId: currentSession.sessionId,
      revision: result.revision,
      textLen: result.text.length,
    });
    return result.text;
  } catch (err) {
    if (gen !== generation) {
      logDebug('core.session', 'Discarding stale resync error', {
        gen,
        currentGen: generation,
      });
      return null;
    }
    const bridgeErr = err instanceof BridgeError ? err : new BridgeError('UNKNOWN', String(err));
    logException('core.session', 'Resync failed', err, {
      sessionId: currentSession.sessionId,
      revision: rev,
    });
    updateState({ syncState: prevState });
    const [toastMsg] = mapBridgeError(bridgeErr);
    if (toastMsg) showToast(toastMsg);
    return null;
  }
}

/**
 * Save the Core-backed document through the Runtime.
 * Returns the save result revision, or -1 on failure.
 */
export async function saveCoreSession(options?: {
  interactive?: boolean;
}): Promise<number> {
  if (!currentSession.isActive) {
    logDebug('core.session', 'Save called on inactive session');
    return -1;
  }

  const gen = generation;
  const { interactive = true } = options ?? {};

  try {
    // B3: Wait for all pending patches to be acked before flushing to Core
    if (_sourceSyncController) {
      await _sourceSyncController.flush();
    }
    if (gen !== generation) return -1;

    // Flush first to ensure all patches are applied to Core's backend state
    await flushDocument(currentSession.sessionId);
    if (gen !== generation) return -1;

    const result = await saveDocument(currentSession.sessionId);
    if (gen !== generation) return -1;

    updateState({
      persistedRevision: result.revision,
    });

    if (interactive) {
      logInfo('core.session', 'Core session saved', {
        sessionId: currentSession.sessionId,
        revision: result.revision,
      });
    }

    return result.revision;
  } catch (err) {
    if (gen !== generation) return -1;
    const bridgeErr = err instanceof BridgeError ? err : new BridgeError('UNKNOWN', String(err));
    logException('core.session', 'Save failed', err, {
      sessionId: currentSession.sessionId,
      interactive,
    });
    if (interactive) {
      const [toastMsg] = mapBridgeError(bridgeErr);
      showToast(toastMsg ?? '保存失败，请重试');
    }
    return -1;
  }
}

/**
 * Mark a patch as pending (increment counter).
 * Called by the adapter before sending a patch to Core.
 */
export function markPatchPending(byteLength: number): boolean {
  if (!currentSession.isActive) return false;

  const newPendingCount = currentSession.pendingCount + 1;
  const newPendingBytes = currentSession.pendingBytes + byteLength;

  if (newPendingCount > MAX_PENDING_PATCHES || newPendingBytes > MAX_PENDING_BYTES) {
    updateState({
      pendingCount: newPendingCount,
      pendingBytes: newPendingBytes,
      syncState: 'backpressure',
    });
    return false; // over limit — caller should throttle
  }

  updateState({
    pendingCount: newPendingCount,
    pendingBytes: newPendingBytes,
    syncState: 'pending',
  });
  return true;
}

/**
 * Mark a patch as acknowledged (decrement counter, advance confirmedRevision).
 */
export function markPatchAcked(revision: number, byteLength: number): void {
  if (!currentSession.isActive) return;

  const newPendingCount = Math.max(0, currentSession.pendingCount - 1);
  const newPendingBytes = Math.max(0, currentSession.pendingBytes - byteLength);

  updateState({
    confirmedRevision: revision,
    pendingCount: newPendingCount,
    pendingBytes: newPendingBytes,
    syncState: newPendingCount === 0 ? 'idle' : 'pending',
  });
}

export function markSessionRevisionConfirmed(revision: number): void {
  if (!currentSession.isActive) return;

  updateState({
    confirmedRevision: revision,
    pendingCount: 0,
    pendingBytes: 0,
    syncState: 'idle',
  });
}

/**
 * Update sync state to blocked — called on unrecoverable error.
 */
export function markSessionBlocked(): void {
  updateState({ syncState: 'blocked' });
}

// ---------------------------------------------------------------------------
// Dirty selector (mirrors legacy isDocumentDirty() for the Core path)
// ---------------------------------------------------------------------------

/**
 * Returns true if the Core-backed session has unsaved changes.
 * Dirty when: pendingCount > 0 OR confirmedRevision !== persistedRevision,
 * OR the session is in an error state.
 */
export function isCoreSessionDirty(): boolean {
  if (!currentSession.isActive) return false;
  // Even when blocked, unsaved edits still count as dirty.
  // Session may be blocked (e.g. unrecoverable error) but still have
  // unacknowledged patches or a confirmed revision ahead of persisted.
  if (currentSession.syncState === 'blocked') {
    return (
      currentSession.pendingCount > 0 ||
      currentSession.confirmedRevision !== currentSession.persistedRevision
    );
  }
  return (
    currentSession.pendingCount > 0 ||
    currentSession.confirmedRevision !== currentSession.persistedRevision
  );
}

// ---------------------------------------------------------------------------
// Feature flag check
// ---------------------------------------------------------------------------

/**
 * Check whether Core-backed Source Mode is enabled.
 * Reads from the cached settings (loaded by storage.ts).
 * Defaults to true when not explicitly set to false.
 */
export function isCoreBackedSourceModeEnabled(): boolean {
  return getCachedSettings().coreBackedSourceMode !== false;
}
