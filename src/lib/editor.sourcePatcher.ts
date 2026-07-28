//! CodeMirror Patch Adapter — extracts text patches from CM transactions
//! and sends them through the Core Bridge.
//!
//! This module is the frontend half of the optimistic mirror pattern:
//!   1. Local edit → immediately reflected in CodeMirror (no rollback).
//!   2. Patch extracted and sent to Core via IPC (UTF-16 offsets).
//!   3. Core applies the patch and returns an ack with the new revision.
//!   4. On ack → pending counter decremented, confirmedRevision advanced.
//!   5. On mismatch → resync: fetch the confirmed snapshot from Core and
//!      replace the editor content programmatically.
//!
//! Frame/composition batching: rapid successive edits (e.g., IME composition
//! or pasting) are coalesced into a single patch using `requestAnimationFrame`
//! scheduling. If no patch has been sent within the batch window, only one
//! patch is dispatched with the cumulative changes.

import type { EditorView } from 'codemirror';
import type { Transaction } from '@codemirror/state';
import type { TransactionCallback } from './editor.source';
import type {
  Utf16ChangeDto,
  Utf16TextPatchDto,
  ApplyPatchAckDto,
} from './coreBridge';
import { applyTextPatch, BridgeError } from './coreBridge';
import {
  getCoreSessionState,
  markPatchPending,
  markPatchAcked,
  resyncCoreSession,
  getSyncState,
  markSessionBlocked,
  getConfirmedRevision,
  getPendingCount,
} from './coreSession';
import { logDebug, logException, logInfo } from './logger';
import { setSourceContent, getSourceView } from './editor.source';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum retry attempts for a single patch before giving up. */
const MAX_RETRIES = 3;

/** Retry delay base (ms) — doubles each attempt (exponential backoff). */
const RETRY_DELAY_MS = 100;

/** Frame batch window (ms). Changes within this window are coalesced. */
const FRAME_BATCH_MS = 16;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A pending patch that has been extracted but not yet sent (batching) or
 * sent but not acknowledged.
 */
interface PendingPatch {
  /** Frontend transaction ID for idempotent retry. */
  transactionId: string;
  /** Base revision at the time the patch was extracted. */
  baseRevision: number;
  /** UTF-16 changes extracted from the CM transaction(s). */
  changes: Utf16ChangeDto[];
  /** Selection after the change (anchor, head as UTF-16 offsets). */
  selectionAfter: { anchor: number; head: number } | null;
  /** Total byte length of the change content (for backpressure tracking). */
  byteLength: number;
  /** Number of retry attempts so far. */
  retryCount: number;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** Sequential counter for transaction ID generation. */
let txnCounter = 0;

/** Timer handle for frame batching (null = no pending batch). */
let batchTimer: ReturnType<typeof setTimeout> | null = null;

/** Accumulated changes during a frame batch. */
let batchChanges: Utf16ChangeDto[] = [];
let batchSelection: { anchor: number; head: number } | null = null;
let batchByteLength = 0;
let batchBaseRevision = 0;

/**
 * Reference to the EditorView, set by `attachPatcher`.
 * Used to read cursor position and dispatch programmatic updates.
 */
let attachedView: EditorView | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique transaction ID string. */
function nextTransactionId(): string {
  return `txn_${++txnCounter}_${Date.now()}`;
}

/**
 * Calculate the byte length of a pending patch's content.
 * Measures the sum of all inserted text lengths.
 */
function calcPatchByteLength(changes: Utf16ChangeDto[]): number {
  let total = 0;
  for (const c of changes) {
    total += new Blob([c.insert]).size;
  }
  return total;
}

/**
 * Extract changes from a single CodeMirror transaction.
 * Returns an array of Utf16ChangeDto entries.
 */
function extractChangesFromTransaction(
  tr: Transaction,
): Utf16ChangeDto[] {
  const changes: Utf16ChangeDto[] = [];

  if (!tr.changes || !tr.changes.iterChanges) return changes;

  tr.changes.iterChanges(
    (fromA: number, toA: number, _fromB: number, _toB: number, inserted: { toString(): string; length: number }) => {
      // CodeMirror positions are UTF-16 code unit offsets — pass through directly.
      // Only emit if there is an actual change (non-empty range or non-empty insert).
      if (fromA !== toA || inserted.length > 0) {
        changes.push({
          from: fromA,
          to: toA,
          insert: inserted.toString(),
        });
      }
    },
  );

  return changes;
}

/**
 * Extract the primary cursor selection from a CodeMirror view as UTF-16 offsets.
 * Returns null if the view is unavailable or has no selection.
 */
function extractSelection(
  view: EditorView | null,
): { anchor: number; head: number } | null {
  if (!view) return null;
  const sel = view.state.selection.main;
  return { anchor: sel.anchor, head: sel.head };
}

/**
 * Send a patch to Core via the bridge.
 * Handles retries on transient errors and resync on revision mismatch.
 */
async function sendPatch(patch: PendingPatch): Promise<void> {
  const sessionState = getCoreSessionState();
  if (!sessionState.isActive) {
    logDebug('patcher', 'Cannot send patch — no active session');
    return;
  }

  const patchDto: Utf16TextPatchDto = {
    transaction_id: patch.transactionId,
    base_revision: patch.baseRevision,
    changes: patch.changes,
    selection_after: patch.selectionAfter
      ? { anchor: patch.selectionAfter.anchor, head: patch.selectionAfter.head }
      : null,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff before retry
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        logDebug('patcher', 'Retrying patch', {
          transactionId: patch.transactionId,
          attempt,
          delay,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const ack: ApplyPatchAckDto = await applyTextPatch(
        sessionState.sessionId,
        patchDto,
      );

      // Success — advance confirmed revision, decrement pending counter
      markPatchAcked(ack.revision, patch.byteLength);

      logDebug('patcher', 'Patch acknowledged', {
        transactionId: patch.transactionId,
        revision: ack.revision,
      });
      return; // success
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const bridgeErr = err instanceof BridgeError ? err : null;
      const code = bridgeErr?.code ?? 'UNKNOWN';

      if (code === 'REVISION_MISMATCH') {
        // Resync required
        logInfo('patcher', 'Revision mismatch — triggering resync', {
          transactionId: patch.transactionId,
          attempt,
        });
        const text = await resyncCoreSession();
        if (text !== null && attachedView) {
          // Replace editor content programmatically
          // (programmaticUpdate guard prevents re-entering the patcher)
          setSourceContent(text);
        }
        return; // resync handled
      }

      if (code === 'SESSION_NOT_FOUND' || code === 'INVALID_UTF16_BOUNDARY') {
        // Unrecoverable errors
        logException('patcher', 'Unrecoverable patch error', err, {
          transactionId: patch.transactionId,
          code,
        });
        markSessionBlocked();
        return;
      }

      // Transient error — retry
      logDebug('patcher', 'Transient patch error, will retry', {
        transactionId: patch.transactionId,
        code,
        attempt,
      });
    }
  }

  // All retries exhausted
  logException('patcher', 'Patch failed after all retries', lastError, {
    transactionId: patch.transactionId,
  });
}

// ---------------------------------------------------------------------------
// Batch scheduling
// ---------------------------------------------------------------------------

/**
 * Flush the current frame batch — send a single coalesced patch.
 */
function flushBatch(): void {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  if (batchChanges.length === 0) return;

  // Check backpressure BEFORE clearing batch state — if we clear first,
  // accumulated changes are lost forever when backpressure drops them.
  if (getSyncState() === 'backpressure' || getSyncState() === 'blocked') {
    logDebug('patcher', 'Skipping patch dispatch — sync state is', {
      syncState: getSyncState(),
    });
    return;
  }

  const patch: PendingPatch = {
    transactionId: nextTransactionId(),
    baseRevision: batchBaseRevision,
    changes: [...batchChanges],
    selectionAfter: batchSelection,
    byteLength: batchByteLength,
    retryCount: 0,
  };

  // Clear batch state
  batchChanges = [];
  batchSelection = null;
  batchByteLength = 0;

  // Mark as pending
  const accepted = markPatchPending(patch.byteLength);
  if (!accepted) {
    logDebug('patcher', 'Backpressure — patch queued but not sent');
    // In backpressure: we still dispatch but the session state already reflects
    // the limit. The patch will be sent when acks reduce the backlog.
  }

  // Send the patch (fire-and-forget with async error handling)
  sendPatch(patch).catch((err) => {
    logException('patcher', 'Unhandled error in patch dispatch', err, {
      transactionId: patch.transactionId,
    });
  });
}

/**
 * Schedule a batch flush. If multiple changes arrive within the batch window,
 * they are coalesced into a single patch.
 */
function scheduleBatchFlush(): void {
  if (batchTimer) return; // already scheduled
  batchTimer = setTimeout(flushBatch, FRAME_BATCH_MS);
}

// ---------------------------------------------------------------------------
// Transaction callback
// ---------------------------------------------------------------------------

/**
 * Create a TransactionCallback for the Core-backed patcher.
 *
 * This callback is passed to `createSourceEditor()` as the `onTransaction`
 * parameter. It extracts changes from CM transactions and feeds them into
 * the batch/coalesce pipeline.
 */
export function createPatcherCallback(): TransactionCallback {
  const handler: TransactionCallback = (update) => {
    // Skip during programmatic updates (e.g., resync)
    const sessionState = getCoreSessionState();
    if (!sessionState.isActive) return;

    // Skip if blocked or resyncing
    const syncState = getSyncState();
    if (syncState === 'blocked' || syncState === 'resyncing') return;

    for (const tr of update.transactions) {
      if (!tr.changes || !tr.changes.iterChanges) continue;

      const extracted = extractChangesFromTransaction(tr);
      if (extracted.length === 0) continue;

      // Accumulate into batch
      batchChanges.push(...extracted);
      batchByteLength += calcPatchByteLength(extracted);

      // Update base revision from the confirmed revision at extraction time
      batchBaseRevision = getConfirmedRevision();

      // Update selection from the final transaction in the update
      const sel = extractSelection(attachedView);
      if (sel) batchSelection = sel;
    }

    // Schedule a batch flush if we accumulated changes
    if (batchChanges.length > 0) {
      scheduleBatchFlush();
    }
  };

  return handler;
}

// ---------------------------------------------------------------------------
// Attach / Detach
// ---------------------------------------------------------------------------

/**
 * Attach the patcher to a CodeMirror EditorView.
 *
 * This must be called after `createSourceEditor()` to enable Core-backed
 * patching for the source mode editor.
 */
export function attachPatcher(): void {
  attachedView = getSourceView();
  if (!attachedView) {
    logDebug('patcher', 'Cannot attach patcher — no editor view');
    return;
  }
  logInfo('patcher', 'Patcher attached to source editor');
}

/**
 * Detach the patcher from the current EditorView and flush any pending batch.
 */
export function detachPatcher(): void {
  if (batchTimer) {
    flushBatch(); // flush any accumulated changes
  }
  attachedView = null;
  batchChanges = [];
  batchSelection = null;
  batchByteLength = 0;
  logInfo('patcher', 'Patcher detached from source editor');
}

/**
 * Flush any pending accumulated patches immediately.
 * Returns a promise that resolves when all pending patches have been
 * acknowledged (or failed).
 */
export async function flushPendingPatches(): Promise<void> {
  // Flush any in-flight batch
  if (batchTimer) {
    flushBatch();
    batchTimer = null;
  }

  // Wait for pending patches to drain
  const maxWait = 5000; // 5s timeout
  const start = Date.now();

  while (getPendingCount() > 0) {
    if (Date.now() - start > maxWait) {
      logDebug('patcher', 'Flush pending patches timed out', {
        remainingCount: getPendingCount(),
      });
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// ---------------------------------------------------------------------------
// Resync helper
// ---------------------------------------------------------------------------

/**
 * Resync the editor with the Core session.
 * Fetches the confirmed snapshot and replaces the editor content.
 */
export async function resyncEditorWithCore(): Promise<boolean> {
  const text = await resyncCoreSession();
  if (text === null) return false;

  if (attachedView) {
    setSourceContent(text);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Patch queue inspection
// ---------------------------------------------------------------------------

/** Current batch change count (before scheduling). */
export function getBatchChangeCount(): number {
  return batchChanges.length;
}

/** Whether a batch flush is currently scheduled. */
export function hasPendingBatch(): boolean {
  return batchTimer !== null;
}