## Why

When two or more markdown files are open in separate windows, closing one window can incorrectly close another window. This happens because Tauri's `emit()` broadcasts the close-request event to all windows instead of targeting the specific window, and a shared `AtomicBool` close permission is consumed globally. This is a critical usability bug affecting the core multi-window workflow on macOS.

## What Changes

- Change backend close event emission from broadcast to window-targeted delivery using `emit_to(EventTarget::webview_window(label), ...)`
- Replace the global shared `AtomicBool` close permission with per-window label-based permissions stored in a `HashSet<String>` behind `Mutex`
- Make close permissions one-time consumable (consumed on use, removed after)
- Ensure permission cleanup on window destruction or close failure
- Add window label logging throughout the close flow for debuggability
- Update frontend `close-requested` listener to validate the event's target window label

## Capabilities

### New Capabilities
- `multi-window-close-isolation`: Ensures close request events, confirmation dialogs, and close permissions are scoped to individual windows with no cross-window interference

### Modified Capabilities

## Impact

- **Backend Rust**: `src-tauri/src/lib.rs` (close event emission), `src-tauri/src/state.rs` (close permission storage)
- **Frontend TypeScript**: `src/main.ts` (close-requested listener registration and window label validation)
- **Tests**: New Rust unit tests for per-window permission logic; potential macOS E2E tests for multi-window close
- **No breaking changes**: Internal implementation detail fix, no API surface changes
