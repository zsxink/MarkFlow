## ADDED Requirements

### Requirement: Dead code removal in Tauri Backend

`src-tauri/crates/runtime/src/document_service.rs` SHALL be deleted along with its export in `lib.rs`.
`ErrorDto` (core_bridge.rs:186-192) SHALL be deleted.
11 unused `AppError` constructor methods (error.rs:160-224) SHALL be deleted.
`consume_close_permission` / `cleanup_close_permission` in `state.rs` SHALL be deleted.

#### Scenario: document_service.rs removed

- **WHEN** building src-tauri
- **THEN** `src-tauri/crates/runtime/src/document_service.rs` SHALL NOT exist

#### Scenario: ErrorDto removed

- **WHEN** building src-tauri
- **THEN** `ErrorDto` SHALL NOT be defined in `core_bridge.rs`

### Requirement: Mutex safety

`FRONTEND_TXN_MAP.lock().expect()` in `core_bridge.rs:59` SHALL use `error::lock_mutex()?` pattern.
`snapshot.lock().unwrap()` in `fs/ignore.rs:41` SHALL use `error::lock_mutex()` pattern.

#### Scenario: no expect on FRONTEND_TXN_MAP

- **WHEN** building src-tauri
- **THEN** there SHALL be no `.expect()` call on `FRONTEND_TXN_MAP.lock()`

### Requirement: Code deduplication

`normalize_lexical` SHALL be extracted to `src-tauri/src/paths.rs` (used in both `files.rs` and `files_image.rs`).
`MockHost` SHALL be extracted to `src-tauri/crates/runtime/tests/common/mod.rs`.

#### Scenario: normalize_lexical in one place

- **WHEN** building src-tauri
- **THEN** `normalize_lexical` SHALL be defined once in `paths.rs`

### Requirement: Test coverage for AppHost

`AppHost::compare_and_atomic_write` in `runtime_host.rs` SHALL have at least one test.

#### Scenario: AppHost tested

- **WHEN** running `cd src-tauri && cargo test`
- **THEN** AppHost tests SHALL execute

### Requirement: resync_document uses confirmed_revision

`resync_document` in `core_bridge.rs:484` SHALL use the `_confirmed_revision` parameter to verify staleness instead of ignoring it.

#### Scenario: confirmed_revision validated

- **WHEN** a resync is triggered with a confirmed_revision
- **THEN** the backend SHALL validate that the revision is not stale before proceeding
