## Context

M6 Phase 1-2 already put edit commands and history ownership in Core. Phase 3-5 now need the UI path to preserve that ownership across IPC, Source Mode synchronization, toolbar controls, and keyboard shortcuts.

The current branch registers command IPC and calls it from toolbar/keyboard, but the normal command path still fetches the entire document after every command and does not flush pending SourceSyncController edits before issuing a semantic command. The bridge also maps frontend transaction IDs to Core IDs without caching the request/result pair, so a successful retry can be observed as a stale-revision failure instead of an idempotent replay.

## Goals / Non-Goals

**Goals:**

- Return command, undo, and redo effects as UTF-16 patches plus selection/revision data.
- Keep Core as the only history owner and flush SourceSyncController before command/undo/redo.
- Make retry behavior stable for `session_id + frontend_txn_id`.
- Keep toolbar/keyboard callers semantic and independent from raw selection DTO construction.
- Add targeted tests and matrix evidence for the completed M6 Phase 3-5 scope.

**Non-Goals:**

- Complete M6 Phase 6 StyleMap inheritance.
- Migrate image/task-list/copy-paste behavior beyond explicit matrix documentation.
- Replace every bridge command with `ProtocolEnvelope`; existing stable DTO calls remain.

## Decisions

- **Patch-first command result:** `CommandResultDto` carries `patch`, `affected_ranges`, `selection_after`, and `revision`. This lets the frontend apply the exact command patch to CodeMirror and keeps whole-document resync as a recovery path only.
- **Bridge idempotency cache:** The Tauri bridge records a bounded per-session transaction cache keyed by frontend transaction id. Same request fingerprint returns the cached DTO result; same id with different payload returns `TRANSACTION_CONFLICT`.
- **Command layer owns context:** Toolbar and keyboard use semantic helpers such as `executeFormattingAction`, `executeUndo`, and `executeRedo`. FormatCommandLayer reads current selection/cursor, flushes pending edits, dispatches bridge calls, applies returned patches under a programmatic update guard, and verifies the session did not switch before mutating the view.
- **Core undo/redo patch exposure:** Existing `undo()` and `redo()` remain available, while patch-returning variants expose the rebased patch needed by IPC without moving history ownership out of Core.
- **Safe link path reuse:** Link shortcuts and toolbar link insertion use the existing dialog validation path and then call the Core `InsertLink` command when Source Core is active.

## Risks / Trade-offs

- **Risk: command patch coordinates drift if pending user edits are not flushed** -> FormatCommandLayer flushes SourceSyncController before reading base revision for command/undo/redo.
- **Risk: idempotency cache grows without bound** -> cache is bounded per process and prunes old entries, keyed with session id to avoid cross-session reuse.
- **Risk: programmatic CodeMirror dispatch re-enters SourceSyncController** -> command patch application uses the existing source editor programmatic update guard.
- **Risk: command result tests require global session registry isolation** -> tests close created sessions and use unique transaction ids.

## Migration Plan

1. Add delta specs and task checklist for M6 Phase 3-5.
2. Extend Core/bridge DTOs and idempotency behavior.
3. Update FormatCommandLayer and toolbar/keyboard call sites.
4. Add targeted Rust and TS tests.
5. Update the M6 feature migration matrix with completed and deferred items.
