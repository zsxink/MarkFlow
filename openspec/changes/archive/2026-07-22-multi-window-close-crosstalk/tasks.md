## 1. Backend State Refactor

- [x] 1.1 Replace `close_allowed: Arc<AtomicBool>` with `close_permissions: Arc<Mutex<HashSet<String>>>` in `AppState` (state.rs)
- [x] 1.2 Add helper methods on `AppState`: `grant_close_permission(label)`, `consume_close_permission(label) -> bool`, `cleanup_close_permission(label)`
- [x] 1.3 Update `AppState::new()` to initialize the new field

## 2. Backend Close Event Targeting

- [x] 2.1 Modify `intercept_close_request` to accept the window label and use `emit_to(EventTarget::webview_window(label), "close-requested", payload)` with `{ windowLabel }` payload instead of broadcast `emit`
- [x] 2.2 Modify `confirm_window_close` to insert the window label into `close_permissions` instead of setting the AtomicBool to true
- [x] 2.3 Add window destroy/cleanup handler that removes the label from `close_permissions` when a window is destroyed

## 3. Backend Logging

- [x] 3.1 Add tracing log in `intercept_close_request` when close is intercepted (include label)
- [x] 3.2 Add tracing log when `close-requested` event is emitted (include label)
- [x] 3.3 Add tracing log in `confirm_window_close` when permission is granted (include label)
- [x] 3.4 Add tracing log when permission is consumed in the close handler (include label)

## 4. Frontend Label Validation

- [x] 4.1 Update `listen("close-requested", ...)` in `src/main.ts` to read `windowLabel` from event payload
- [x] 4.2 Compare payload `windowLabel` with current window's label; ignore event if mismatched

## 5. Backend Unit Tests

- [x] 5.1 Write test: granting close permission for window A does not grant permission for window B
- [x] 5.2 Write test: consumed permission is removed and cannot be consumed again
- [x] 5.3 Write test: cleanup removes the correct label without affecting others

## 6. Verification

- [x] 6.1 Run `npm test` and ensure all tests pass
- [x] 6.2 Run `npx tsc --noEmit` and ensure no type errors
- [x] 6.3 Run `npm run build` and ensure build succeeds
