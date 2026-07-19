## Context

The `error-handling` spec (openspec/specs/error-handling/) defines three requirements:
1. Lock recovery via `lock_mutex()` helper — already implemented in `src-tauri/src/error.rs`
2. Unified `AppError` type with stable error codes — already implemented
3. No silent catches in frontend — logger functions exist in `src/lib/logger.ts`

However, several source files still use the old patterns (bare catches, `console.error`, `expect()`). This change is a pure enforcement pass: replace all known violations with the existing helpers. No new helpers or architectural changes are needed.

## Goals / Non-Goals

**Goals:**
- Eliminate all bare `catch {}` blocks in `sidebar.fileops.ts` (5 sites)
- Replace `console.error` with project logger in `documentExport.ts` (2 sites)
- Replace `expect()` with `lock_mutex()` / `Result` returns in Rust code (8 sites)
- Ensure `cargo test` and `npm test` pass with no regressions

**Non-Goals:**
- No new error codes or error types
- No new logger functions
- No changes to existing test files
- No new feature work

## Decisions

### 1. Frontend: bare catch → `logDebug` with structured context

Each bare catch in `sidebar.fileops.ts` gets `logDebug('fileops', 'description', { path, error: String(e) })`. The scope is `'fileops'` to match the module. Using `logDebug` (not `logError`) because these are non-critical best-effort operations (get stats, mark processed, save window state) per the spec's "尽力调用" scenario.

### 2. Frontend: `console.error` → `logException`

`documentExport.ts` uses `console.error` for export failures. These are user-initiated operations that should be logged via the project logger. Use `logException('export', msg, error)` which wraps the error into structured context automatically.

### 3. Backend: `expect("mutex poisoned")` → `error::lock_mutex()`

The `lock_mutex()` helper in `error.rs` already handles poisoned mutexes by recovering via `into_inner()` and logging at `warn` level. All 5 `expect("xxx mutex poisoned")` sites in `lib.rs` will call `lock_mutex(&mutex)?` instead. The `?` operator propagates the `AppError` to the command's caller, which serializes it for the frontend.

### 4. Backend: `expect("build MarkFlow")` → `match` with log + process exit

Line 367 in `lib.rs` panics if the main builder fails. This is a fatal init error — replace with `match` that logs via `tracing::error!` then calls `process::exit(1)` for a clean exit instead of a panic traceback.

### 5. Backend: `expect("build HTTP client")` → `Result` return

Line 39 in `state.rs` panics if HTTP client construction fails. Change the initializer to return `Result<Self, AppError>` and propagate via `?`. The caller (Tauri setup) handles the error at startup.

### 6. Backend: `expect("watcher should start")` → `.map_err()`

Line 462 in `watcher.rs` panics if the watcher fails to start. Replace with `.map_err(|e| AppError::watcher_start_failed(...))?` to return a structured error.

## Risks / Trade-offs

- **[Risk] Changing `State::new` return type propagates** → The caller in `lib.rs` already handles init errors; adding `?` is straightforward. Verify no other callers exist.
- **[Risk] Bare catch removal changes error visibility** → This is intentional per spec. Errors that were previously invisible will now appear in debug logs. No user-facing behavior changes.
- **[Trade-off] `process::exit(1)` vs `std::process::exit`** → Using `process::exit` for the fatal init case. This bypasses destructors but is acceptable for a startup failure that can't be recovered from.
