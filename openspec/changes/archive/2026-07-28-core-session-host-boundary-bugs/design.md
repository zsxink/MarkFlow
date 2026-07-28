## Context

Code review of the `feat/issue-205` branch identified 7 bugs in the Core-backed Source Mode implementation (M3, #205). These bugs span the frontend session lifecycle (`editor.ts`, `coreSession.ts`, `editor.sourcePatcher.ts`), the Rust host bridge (`core_bridge.rs`), and the runtime host (`runtime_host.rs`). They affect session switching stability, data integrity during backpressure, dirty state tracking, coordinate mapping, error UX, and code cleanliness.

Current state: All 7 bugs are confirmed in the current `main` branch. The code is in active development with tests and CI in place.

## Goals / Non-Goals

**Goals:**
- Fix all 7 confirmed bugs from the code review
- Add/re-enable tests that verify the fix
- All existing tests continue to pass
- Rust: `cargo clippy -- -D warnings`, `cargo test --lib`
- TS: `npx tsc --noEmit`, `npm test`

**Non-Goals:**
- No new features or capabilities
- No architectural redesign beyond the minimal fix for Bug 7 (remove redundant Mutex)
- No spec-level behavior changes outside `core-backed-source-mode`

## Decisions

### Bug 1: closeCoreSession 竞态 — await + 防重入锁

- **Decision**: Add a `closeInProgress` boolean flag to the editor state. Set it before the async close starts, clear it in `finally`. When switching Source → WYSIWYG → Source fast, the second `closeCoreSession()` call sees `closeInProgress` and returns early.
- **Why not a lock/mutex**: A simple JS flag is sufficient — we only need mutual exclusion at the call site. A full lock would be over-engineered for a single sequential concern.
- **Why not debounce**: Debounce would add latency to legitimate fast switches. The flag pattern is immediate and deterministic.

### Bug 2: Backpressure batch 丢弃 — move check before clear

- **Decision**: Move the backpressure check (`pendingPatches.length >= MAX_PENDING`) from after `this._pendingPatches.splice(0)` to before it, in `applyChanges()`.
- **Why**: If we clear pending patches before checking backpressure, the accumulated patches are lost forever. Checking first preserves them until they can be drained.
- **Why not a retry queue**: The backpressure flush mechanism already drains `_pendingPatches` after ack. If we don't discard them, the existing drain works. Adding a separate retry queue would duplicate drain logic.

### Bug 3: Selection UTF-16 偏移 — use byte_for_utf16

- **Decision**: In `core_bridge.rs::apply_patch`, convert Selection anchor/head from UTF-16 to byte offsets using `state.core.byte_for_utf16()` before constructing the patch.
- **Why**: `TextChange` already uses this conversion correctly. Selection was missed in the original implementation. Using the same utility ensures consistency.
- **Why not snap/truncate**: Truncation loses position information for CJK/emoji. Proper conversion is the correct fix.

### Bug 4: Core save dirty 永真 — call markDocumentPersisted

- **Decision**: After a successful Core-backed save in `editor.ts`, call `markDocumentPersisted()` (or the equivalent dirty-reset path) to sync `lastPersistedMarkdown` / revision state.
- **Why**: The save flow was split into Core path and legacy path. The Core path never calls the dirty-reset that the legacy path does. Calling it after Core save restores parity.
- **Why not change the dirty formula**: The dirty formula is correct for its inputs — it just never gets the right input after Core save.

### Bug 5: Blocked dirty 掩藏 — check pendingCount

- **Decision**: In `isCoreSessionDirty()`, when the session is in `blocked` state, return `true` if `pendingCount > 0` or `confirmedRevision !== persistedRevision` instead of short-circuiting to `false`.
- **Why**: `blocked` means the session temporarily can't ack patches — it doesn't mean the patches are discarded. The user still has unsaved work.
- **Why not always return true in blocked**: A fresh blocked session with no edits should still report `false`. We check actual pending/unpersisted state.

### Bug 6: 双重 toast — remove redundant showToast

- **Decision**: Delete the `if (toastMsg) showToast(toastMsg)` line in `saveCoreSession` catch block that fires after catch has already shown a toast.
- **Why**: The catch block already shows a toast via `showToast()` for error reporting. The second `showToast` with `toastMsg` is a refactoring artifact that produces duplicate toasts.

### Bug 7: 冗余 Mutex — unwrap SessionRegistry

- **Decision**: Change `Mutex<SessionRegistry>` to plain `SessionRegistry` in `runtime_host.rs`. Update all access patterns from `session_registry.lock().unwrap()` to direct calls.
- **Why**: `SessionRegistry` internally uses `DashMap` (RwLock per shard) and `AtomicU64` — it's already thread-safe. The outer Mutex adds lock contention and code noise with zero correctness benefit.
- **Why not keep as defense-in-depth**: The Mutex adds a runtime failure mode (`lock().unwrap()`) for no actual protection. The internal locking is proven correct by the existing M1/M2 design.

## Risks / Trade-offs

- **[Risk]** Bug 1 flag approach may still have edge cases with >2 rapid switches → Mitigation: The flag is in `finally` and guarded by try/catch; worst case is a delayed close, not a crash.
- **[Risk]** Bug 3 coordinate conversion assumes `selection_after` uses UTF-16 → Mitigation: CodeMirror 6 always provides UTF-16 offsets. This is documented in the existing codebase conventions.
- **[Risk]** Bug 7 exposing SessionRegistry internals could introduce new data races in future refactors → Mitigation: `SessionRegistry` methods are all `&self` with internal synchronization. The removal is safe as long as the internal types remain synchronized.
