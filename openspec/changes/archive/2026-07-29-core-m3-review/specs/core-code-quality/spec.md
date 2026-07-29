## ADDED Requirements

### Requirement: Testing infrastructure gated behind feature flag

The `markflow-core/src/testing/` module SHALL only be compiled when `feature = "testing"` is enabled.
The `markflow-core/tests/common/mod.rs` SHALL NOT use blanket `#![allow(dead_code)]` — individual items SHALL use `#[allow(dead_code)]` where needed.
Dead code functions in test files (`tests/lossless.rs` block_kinds) SHALL be removed.

#### Scenario: testing module not in default API

- **WHEN** building markflow-core without `--features testing`
- **THEN** `markflow_core::testing` SHALL NOT be accessible in public API

#### Scenario: dead_code not suppressed blanket

- **WHEN** running `cargo clippy --all-targets -- -D warnings` on markflow-core
- **THEN** there SHALL be no `#![allow(dead_code)]` in test common module files

### Requirement: Visibility encapsulation for core types

`OriginalSnapshot` fields in `snapshot.rs` SHALL be private with getter methods.
Internal helper functions in scanner.rs, heading.rs, list.rs, table.rs, incremental.rs SHALL use `pub(crate)` or private visibility instead of `pub`.
`TextBuffer::validate_range` and `TextBuffer::is_char_boundary` SHALL be `pub(crate)`.

#### Scenario: OriginalSnapshot fields immutable from outside

- **WHEN** external code accesses `OriginalSnapshot`
- **THEN** all fields SHALL only be readable via getter methods, not directly mutable

#### Scenario: internal helpers not exported

- **WHEN** running `cargo doc --no-deps` on markflow-core
- **THEN** internal helpers (`collect_lines`, `count_leading_spaces`, `is_space`, `heading_title`, `starts_task_checkbox`, `starts_like_list_marker`, `parse_table_delimiter`, `split_table_cells`, `SYNC_REPARSE_CONTEXT_BYTES`, `SYNC_REPARSE_BUDGET_BYTES`) SHALL NOT appear in public API

### Requirement: Error handling improvement

`expect()` calls on `session.rs` parse_index_cache RwLock SHALL be encapsulated in `read_cache()` / `write_cache()` methods.
`expect("checked by caller")` calls in scanner.rs SHALL have `debug_assert` preconditions.
`unreachable!()` in scanner.rs `list_start` method SHALL be replaced with safe fallback or documented invariant.

#### Scenario: no expect in session.rs cache methods

- **WHEN** building markflow-core
- **THEN** parse_index_cache access in `session.rs` SHALL NOT use raw `.expect()` calls

#### Scenario: unreachable replaced with fallback

- **WHEN** list_start encounters unexpected input
- **THEN** it SHALL NOT panic via `unreachable!()`

### Requirement: Code structure improvement

ID types in `session.rs` (`SessionId`, `DocumentId`, `Revision`, `TransactionId`, `ByteOffset`, `Utf16Offset`, `SourceByteOffset`, `SourceOffsetError`, `SourceRange`) SHALL be extracted to `src/document/types.rs`.
`incremental.rs` SHALL be renamed to `update.rs`.

#### Scenario: ID types in separate file

- **WHEN** building markflow-core
- **THEN** ID type definitions SHALL reside in `src/document/types.rs`, not in `session.rs`

### Requirement: Test coverage for line_index and text_buffer

`tests/line_index.rs` SHALL cover `LineIndex::find_line_end` and `line_col_for_byte` with at least 3 test cases.
`tests/text_buffer.rs` SHALL be expanded to cover `replace`, `apply_changes`, `validate_range`, `chunks` with at least 4 tests total.

#### Scenario: line_index tested directly

- **WHEN** running `cd markflow-core && cargo test`
- **THEN** line_index tests SHALL execute (at least 3 test cases)

#### Scenario: text_buffer tested directly

- **WHEN** running `cd markflow-core && cargo test`
- **THEN** text_buffer tests SHALL cover replace, apply_changes, validate_range, and chunks (at least 4 test cases)

### Requirement: File naming cleanup

Benchmark files SHALL use descriptive names:
- `examples/m1_1_benchmark.rs` → `examples/bench_session_open_patch_save.rs`
- `examples/m2_parse_index_benchmark.rs` → `examples/bench_parse_index_update.rs`

Empty directories `examples/lossless/` and `examples/m3/` SHALL be deleted.

`fixtures/m3/` directory SHALL be deleted. Filler files (1mb.md, 10mb.md, 50mb.md) SHALL be moved to `fixtures/size/`.

#### Scenario: descriptive benchmark names

- **WHEN** listing `markflow-core/examples/`
- **THEN** filenames SHALL not contain internal stage numbers (m1_1, m2)

#### Scenario: no m3 fixtures

- **WHEN** listing `markflow-core/fixtures/`
- **THEN** there SHALL be no `m3/` subdirectory

#### Scenario: size fixtures in size dir

- **WHEN** looking for large test fixtures
- **THEN** they SHALL be in `fixtures/size/`
