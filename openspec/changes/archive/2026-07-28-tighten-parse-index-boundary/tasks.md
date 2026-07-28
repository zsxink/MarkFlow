# Tasks: tighten-parse-index-boundary

## Phase A: 收紧 parse_index 模块依赖方向

### Task A1: 将 `ParseIndex::scan*` 从 types.rs 移到 mod.rs

- [x] In `parse_index/types.rs`: remove the `impl ParseIndex` block (lines 81-102), and the imports used only by it: `use super::scanner::BlockScanner` and `use crate::document::LineEndingKind`.
- [x] Retain: `use super::style_map::StyleMap` (used by `ScanOutcome`), `use super::large_document_policy::LargeDocumentPolicy` (used by `ScanOutcome`).
- [x] In `parse_index/mod.rs`: add `use scanner::BlockScanner` and `use crate::document::{LineEndingKind, Revision}`, then add the `impl ParseIndex` block with the three methods (scan, scan_with_line_ending, scan_with_document_bytes).
- [x] Confirm `pub use types::ParseIndex` in mod.rs already exists (it does) so the re-export chain works unchanged.

### Task A2: 确保无行为变化

- [x] Run `cargo test --manifest-path markflow-core/Cargo.toml` passes.
- [x] Run `cargo clippy --manifest-path markflow-core/Cargo.toml -- -D warnings` passes.

## Phase B: 清理 integration test lint

### Task B1: 清理 lossless.rs unused imports

- [x] Remove unused imports in imports: `use common::patch_at` (not used in this file).
- [x] The helper `block_kinds` is used. `markdown_options` and `collect_markdown_rs_blocks` are used by the last test. Keep them.
- [x] Remove unused import `fixture` (also unused).
- [x] Remove unused import `Revision`, `SourceRange`, `TextChange`, `TextPatch`, `TransactionId`.
- [x] Add `#[allow(dead_code)]` to `block_kinds` since it's defined but not currently used in this file.

### Task B2: 清理 session.rs unused imports

- [x] Remove unused imports: `TextChange`, `TextPatch`, `TransactionId`.

### Task B3: 清理 patch.rs unused imports

- [x] Check: `use markflow_core::{ByteOffset, CoreError, Revision, SourceRange, TextChange, TextPatch, TransactionId}` — all used. No changes needed.

### Task B4: 清理 position_map.rs unused imports

- [x] Check: `DocumentSession` — used in `assert_position_roundtrip`. All used. No changes needed.

### Task B5: 清理 snapshot.rs unused imports

- [x] Check: All used. No changes needed.

### Task B6: 清理 parse_index.rs unused imports

- [x] Check: `TextChange`, `TextPatch`, `TransactionId` — actually used in test code. Keep them.

### Task B7: 给 tests/common/mod.rs 添加 `#![allow(dead_code)]`

- [x] Add `#![allow(dead_code)]` at the top of `tests/common/mod.rs` to suppress dead_code warnings from multi-crate compilation.

### Task B8: 验证 `cargo clippy --tests -- -D warnings` 通过

- [x] Run the full validation suite:
  - [x] `cargo fmt --all --check` — passes
  - [x] `cargo test --manifest-path markflow-core/Cargo.toml` — passes
  - [x] `cargo clippy --manifest-path markflow-core/Cargo.toml -- -D warnings` — passes
  - [x] `cargo clippy --manifest-path markflow-core/Cargo.toml --tests -- -D warnings` — passes
  - [x] `cargo run --manifest-path markflow-core/Cargo.toml --release --example m2_parse_index_benchmark` — runs successfully
  - [x] `npm test` — 339 passes, 0 failures
  - [x] `npm run build` — builds successfully
