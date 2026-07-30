## 1. Bridge Contract

- [x] 1.1 Extend `CommandResultDto` to include UTF-16 patch, affected ranges, selection_after, and revision.
- [x] 1.2 Add bounded per-session transaction idempotency for semantic command, undo, and redo requests.
- [x] 1.3 Add patch-returning Core undo/redo helpers without changing existing callers.
- [x] 1.4 Add Rust tests for success, non-ASCII selection mapping, revision mismatch, unknown session, idempotent retry, transaction conflict, and undo/redo session isolation.

## 2. Format Command Layer

- [x] 2.1 Refactor FormatCommandLayer into injectable dependencies with a default exported instance API.
- [x] 2.2 Capture current UTF-16 selection/cursor inside the layer without 0/0 sentinel semantics.
- [x] 2.3 Flush SourceSyncController before command, undo, and redo.
- [x] 2.4 Apply returned UTF-16 patches to CodeMirror under programmatic update guard and synchronize revision/selection.
- [x] 2.5 Guard against stale session switches before mutating the editor.

## 3. Toolbar And Keyboard

- [x] 3.1 Route Core-backed Source Mode toolbar formatting controls through semantic FormatCommandLayer actions.
- [x] 3.2 Route Core-backed Source Mode keyboard formatting shortcuts through semantic FormatCommandLayer actions.
- [x] 3.3 Add Core-backed Source Mode undo/redo keyboard handling.
- [x] 3.4 Unify link insertion through the safe link dialog path and Core `InsertLink`.
- [x] 3.5 Move CodeFence toolbar action to Core `InsertCodeFence` and document deferred Image/HR/TaskList scope.

## 4. Tests And Docs

- [x] 4.1 Add TS tests for FormatCommandLayer flush-before-command, patch apply, selection_after, and stale session guard.
- [x] 4.2 Add toolbar/keyboard tests for Core Source Mode dispatch and WYSIWYG fallback.
- [x] 4.3 Update `feature-migration-matrix.md` with actual completed and deferred M6 items.
- [x] 4.4 Run `openspec validate m6-phase3-core-command-bridge`, `npx tsc --noEmit`, `npm test -- --run`, and `cargo test --manifest-path src-tauri/Cargo.toml`.

## 5. CR Follow-up

- [x] 5.1 Preserve link dialog display text in Core Source Mode `InsertLink`.
- [x] 5.2 Preserve selected text when inserting CodeFence through the Core path.
- [x] 5.3 Prevent Ctrl/Cmd+Shift+S from triggering save and strikethrough together.
- [x] 5.4 Restrict undo/redo IPC patch results to single-step operations.
- [x] 5.5 Clean runtime/agent scratch files from the worktree and clear diff whitespace issues.
