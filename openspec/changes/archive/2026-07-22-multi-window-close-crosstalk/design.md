## Context

MarkFlow is a Tauri v2 desktop Markdown editor that supports opening multiple files in separate windows. A critical bug exists where closing one window can incorrectly close another due to two shared-state issues:

1. **Broadcast event**: `Emitter::emit("close-requested", ())` in `src-tauri/src/lib.rs:194` sends the close event to all windows, not just the originating window.
2. **Shared permission**: `AppState.close_allowed` (`Arc<AtomicBool>` in `src-tauri/src/state.rs:21`) is a single boolean shared across all windows. Once set to `true` by one window's confirmation, it permanently allows all windows to close without confirmation.

The frontend `listen("close-requested", ...)` in `src/main.ts:162` also registers globally, so every window processes every close event.

## Goals / Non-Goals

**Goals:**
- Close event delivery is window-scoped: only the target window receives the event
- Close permission is per-window, one-time consumable, and label-keyed
- Permission cleanup on window destruction or failure
- Window label logging for debuggability
- Frontend validates event target label
- All existing tests pass; new unit tests cover per-window permission logic

**Non-Goals:**
- Changing Tauri's window management or lifecycle
- Refactoring the unsaved dialog system (it stays per-window as-is)
- Adding cross-window coordination features (e.g., "close all windows")
- Changing the `isDocumentDirty()` or `showUnsavedDialog()` APIs

## Decisions

### D1: Window-targeted event emission using `emit_to`

**Choice**: Replace `w.emit("close-requested", ())` with `w.emit_to(EventTarget::webview_window(label), "close-requested", payload)`.

**Why**: Tauri v2's `emit_to` with `EventTarget::webview_window` sends the event to exactly one window identified by its label. This is the idiomatic Tauri v2 approach for window-scoped events.

**Alternatives considered**:
- Custom event names with label suffix: Fragile, no type safety.
- Frontend-side filtering only: Backend still broadcasts, wasting resources and creating a race condition window.
- Using `window.emit()` on the specific `WebviewWindow` object: In Tauri v2, `WebviewWindow::emit()` broadcasts to all event listeners on that window object but doesn't scope to just that webview. `emit_to(EventTarget::webview_window(...))` is the correct scoping mechanism.

### D2: Per-window permission via `Arc<Mutex<HashSet<String>>>`

**Choice**: Replace `close_allowed: Arc<AtomicBool>` with `close_permissions: Arc<Mutex<HashSet<String>>>` in `AppState`, keyed by window label.

**Why**: 
- `HashSet<String>` allows O(1) insert/remove/contains for permission check
- `Mutex` (not `RwLock`) because contention is minimal (close events are infrequent, and the critical section is tiny)
- `Arc` because the state is shared across the closure in `on_window_event` and the command handler
- String keys are the window labels, which are unique per-window

**Alternatives considered**:
- `HashMap<String, bool>`: Less semantic, `HashSet` is cleaner for "has permission or not"
- `DashMap`: Overkill for this low-contention use case, adds a dependency
- Channel-based permission: Would require async plumbing through the close flow, adding complexity

### D3: One-time consumption semantics

**Choice**: When `confirm_window_close` is called for a window, the label is inserted into the `HashSet`. When `intercept_close_request` fires and the label is in the set, it removes the label and allows the close. If the label is NOT in the set, the close is prevented and the `close-requested` event is emitted.

**Why**: This matches the existing UX pattern: the first close attempt is intercepted, the user confirms, the second close attempt (triggered by `window.close()`) goes through. The key change is this is now scoped per-window.

### D4: Permission cleanup on window destroy

**Choice**: Register a window destroy event handler that removes the window's label from the permissions set.

**Why**: If a window is destroyed (e.g., OS-level close, crash) while a permission entry exists, the stale entry could cause issues if a new window is created with the same label. Cleanup prevents this.

### D5: Frontend label validation

**Choice**: The `close-requested` listener reads the event payload's `windowLabel` and compares it with `getCurrentWebviewWindow().label`. If they don't match, the event is ignored.

**Why**: Defense in depth — even though the backend now targets events correctly, the frontend should also validate. This prevents any edge cases where events might still leak (e.g., during Tauri version upgrades or unexpected event routing).

### D6: Window label in event payload

**Choice**: The event payload changes from `()` to `{ windowLabel: String }`.

**Why**: The frontend needs the label to validate the event target. Including it in the payload avoids the frontend needing to query the backend for the current window's label.

## Risks / Trade-offs

- **[Risk] Tauri `emit_to` behavior with multiple webviews**: If a window has multiple webviews, `emit_to` might behave differently than expected. **Mitigation**: MarkFlow uses single-webview windows; verify in testing.
- **[Risk] Mutex contention during rapid close sequences**: If multiple windows close simultaneously, the Mutex could cause brief blocking. **Mitigation**: The critical section (HashSet insert/remove/contains) is O(1) and takes nanoseconds; not a real concern.
- **[Trade-off] Slightly more complex state**: `HashSet<String>` is more complex than `AtomicBool`. **Mitigation**: The added complexity is minimal and well-contained in `AppState` methods.
