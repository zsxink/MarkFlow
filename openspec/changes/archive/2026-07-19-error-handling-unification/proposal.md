## Why

The `error-handling` spec already defines requirements for lock recovery, unified error types, and no silent catches — but several source files still violate these requirements. Bare catches in `sidebar.fileops.ts` silently swallow errors, `documentExport.ts` uses raw `console.error`, and multiple `expect()` calls in `lib.rs` / `state.rs` will panic in production on poisoned mutexes or init failures. This change enforces the existing spec by fixing all known violations.

## What Changes

- **`src/components/sidebar.fileops.ts`**: 5 bare `catch {}` blocks → `catch(e) { logDebug(...) }` with structured context
- **`src/lib/documentExport.ts`**: 2 `console.error` calls → `logException()` / `logDebug()` via project logger
- **`src-tauri/src/lib.rs`**: 5 `expect("mutex poisoned")` → `error::lock_mutex()`; 1 `expect("build MarkFlow")` → `match` with log + graceful exit
- **`src-tauri/src/state.rs`**: 1 `expect("build HTTP client")` → `Result` return
- **`src-tauri/src/fs/watcher.rs`**: 1 `expect("watcher should start")` → `.map_err()` return

## Capabilities

### New Capabilities

_(none — this enforces an existing spec)_

### Modified Capabilities

- `error-handling`: No requirement changes — the spec already covers all these fixes. This change is a pure enforcement pass.

## Impact

- **Frontend**: `sidebar.fileops.ts`, `documentExport.ts` — error logging behavior changes (no longer silent)
- **Backend**: `lib.rs`, `state.rs`, `watcher.rs` — panic sites converted to proper error returns
- **No API changes**: `AppError`, `lock_mutex()`, and logger functions already exist
- **Tests**: `cargo test` + `npm test` must pass; no new test files expected (existing tests cover the helpers)
