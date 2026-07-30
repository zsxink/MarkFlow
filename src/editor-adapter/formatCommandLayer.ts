//! FormatCommandLayer — semantic edit command dispatcher for Core-backed Source Mode.
//!
//! This layer sits between the toolbar/keyboard and the Core Bridge:
//!
//!   toolbar/keyboard  →  FormatCommandLayer  →  coreBridge.executeEditCommand()
//!                                                  → Rust execute_edit_command()
//!                                                    → EditCommand.execute()
//!                                                    → apply_patch_with_history()
//!
//! It extracts the current UTF-16 selection from the CodeMirror editor view,
//! builds an `EditCommandDto`, sends it via the Core Bridge, and then
//! resynchronises the editor content and selection from Core's authoritative state.
//!
//! # Resync after command execution
//!
//! An edit command mutates the Core state in-place. After a successful command
//! the frontend CodeMirror editor is stale — its content does not yet reflect
//! the Core-applied patch. This layer handles that by:
//!   1. Advancing `confirmedRevision` via `markPatchAcked()`
//!   2. Calling `resyncCoreSession()` to fetch the authoritative text
//!   3. Dispatching the text and `selection_after` into the CodeMirror view
//!
//! This is intentionally conservative: for a production optimisation, the
//! `TextPatch` returned by the command execution could be applied directly to
//! the CodeMirror ChangeSet, avoiding a full resync.

import {
  type EditCommandDto,
  type CommandResultDto,
  executeEditCommand,
} from '../lib/coreBridge';
import {
  getCoreSessionState,
  markPatchAcked,
  resyncCoreSession,
} from '../lib/coreSession';
import { getSourceView } from '../lib/editor.source';
import { setSourceContent } from '../lib/editor.source';
import { markSessionBlocked } from '../lib/coreSession';
import { showToast } from '../components/toast';
import { logDebug, logException } from '../lib/logger';

// ---------------------------------------------------------------------------
// Transaction ID generation
// ---------------------------------------------------------------------------

let formatCmdCounter = 0;

function nextFormatCmdId(): string {
  return `fmt_${++formatCmdCounter}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Selection extraction from CodeMirror
// ---------------------------------------------------------------------------

/**
 * Extract the current selection from the CodeMirror source view as UTF-16
 * anchor/head offsets.
 *
 * CodeMirror positions (`from` / `to`) are already in UTF-16 code units, so
 * they can be passed directly to the EditCommandDto fields.
 *
 * Returns `null` if there is no active source view.
 */
function getSelectionFromSourceView(): { anchor: number; head: number } | null {
  const view = getSourceView();
  if (!view) return null;
  const sel = view.state.selection.main;
  return { anchor: sel.from, head: sel.to };
}

// ---------------------------------------------------------------------------
// Error texts
// ---------------------------------------------------------------------------

const COMMAND_ERROR_MAP: Record<string, string> = {
  REVISION_MISMATCH: '编辑冲突，请重新同步',
  SESSION_NOT_FOUND: '编辑会话已失效，请重新打开文件',
  INVALID_UTF16_BOUNDARY: '选择范围异常，请重试',
  INVALID_RANGE: '编辑范围异常，请重试',
  INTERNAL: '编辑命令执行失败',
};

function commandErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.code === 'string' && COMMAND_ERROR_MAP[e.code]) {
      return COMMAND_ERROR_MAP[e.code];
    }
  }
  return '格式命令执行失败';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a semantic edit command on the current Core-backed source session.
 *
 * This is the primary entry point for toolbar buttons and keyboard shortcuts
 * when operating in Core-backed Source Mode.
 *
 * 1. Checks that a Core session is active
 * 2. Extracts the current selection (if the command needs one)
 * 3. Builds the DTO and sends it via the Core Bridge
 * 4. On success: advances revision, resyncs editor content, applies selection
 * 5. On error: shows a user-facing toast
 *
 * @param command - The edit command DTO to execute.
 * @returns The command result on success, or `null` on failure.
 */
export async function executeFormatCommand(
  command: EditCommandDto,
): Promise<CommandResultDto | null> {
  const session = getCoreSessionState();
  if (!session.isActive) {
    logDebug('formatCommand', 'No active Core session — skipping command', {
      commandType: command.type,
    });
    return null;
  }

  // For commands that need selection, read from the CM view if not provided.
  // Callers may supply anchor/head directly; if they pass 0/0, fill from CM.
  const needsSelection = !(
    command.type === 'insert_code_fence' || command.type === 'insert_image'
  );
  if (needsSelection) {
    const cmd = command as EditCommandDto & { anchor: number; head: number };
    if (cmd.anchor === 0 && cmd.head === 0) {
      const sel = getSelectionFromSourceView();
      if (sel) {
        cmd.anchor = sel.anchor;
        cmd.head = sel.head;
      }
    }
  } else {
    // Position-based commands — fill from cursor position
    const cmd = command as EditCommandDto & { position: number };
    if (cmd.position === 0) {
      const sel = getSelectionFromSourceView();
      if (sel) {
        cmd.position = sel.anchor;
      }
    }
  }

  const txnId = nextFormatCmdId();
  const baseRevision = session.confirmedRevision;

  logDebug('formatCommand', 'Executing format command', {
    type: command.type,
    baseRevision,
    txnId,
  });

  try {
    const result = await executeEditCommand(
      session.sessionId,
      command,
      baseRevision,
      txnId,
    );

    logDebug('formatCommand', 'Command executed', {
      type: command.type,
      revision: result.revision,
    });

    // (1) Advance confirmedRevision so the session tracking stays in sync
    markPatchAcked(result.revision, 0);

    // (2) Resync the editor content from Core
    const syncedText = await resyncCoreSession();
    if (syncedText !== null) {
      setSourceContent(syncedText);
    }

    // (3) Apply selection_after in the CM view
    if (result.selection_after) {
      const view = getSourceView();
      if (view) {
        view.dispatch({
          selection: { anchor: result.selection_after.anchor, head: result.selection_after.head },
        });
      }
    }

    return result;
  } catch (err) {
    logException('formatCommand', 'Command execution failed', err, {
      type: command.type,
      baseRevision,
    });

    const msg = commandErrorMessage(err);
    showToast(msg);

    // If session-related, mark blocked
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      if (e.code === 'SESSION_NOT_FOUND') {
        markSessionBlocked();
      }
    }

    return null;
  }
}
