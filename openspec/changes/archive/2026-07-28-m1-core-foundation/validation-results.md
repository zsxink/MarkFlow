# Validation Results

Date: 2026-07-28
Branch: `feat/issue-197-m1-core-foundation`

## Commands

- `openspec validate m1-core-foundation` — passed.
- `openspec validate --all` — passed, 59 items passed and 0 failed.
- `cargo fmt --all` — passed.
- `cargo clippy -p markflow-core --all-targets -- -D warnings` — passed.
- `cargo test -p markflow-core` — passed, 1 unit test, 29 integration tests, and 2 compile-fail API doctests.
- `cargo test --workspace` — passed, 122 existing Tauri tests and 32 Core tests.
- `npm test` — passed, 31 files and 339 tests passed.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed; Vite reported existing large-chunk/dynamic-import warnings only.
- `cargo tree -p markflow-core --prefix none` — passed; output contains only `markflow-core`, confirming no host/UI/network/file IO dependencies.

## Notes

- M1 does not route current Source Mode, WYSIWYG, save, export, or UI paths through Core.
- The required LF, CRLF, Mixed EOL, UTF-8 BOM, Unicode, trailing newline, FrontMatter, HTML comment, mixed list marker, code fence, and table fixtures are present under `markflow-core/fixtures/lossless/`.
- The Core acceptance tests cover byte-for-byte fixture roundtrip, BOM preservation, CRLF and Mixed EOL preservation, trailing newline preservation, localized patch untouched-region preservation, stale revision rollback, overlapping range rollback, transaction retry idempotence, UTF-8/UTF-16/line-column/source-byte mapping, and generated Unicode/EOL patch cases.
- `npm test` continues to print the existing PlantUML test stderr about an unavailable Tauri `invoke` bridge; all 339 tests pass and M1.1 does not touch that path.
- `npm run build` continues to report the existing CodeMirror/PlantUML/editor dynamic-import and large-chunk warnings; the build succeeds.

## M1.1 Correction Evidence

Environment:

- `rustc 1.96.0 (ac68faa20 2026-05-25)`
- `aarch64-apple-darwin`
- `Darwin 25.5.0 arm64`

Core-focused commands:

- `cargo fmt --all` — passed.
- `cargo test -p markflow-core` — passed, including all original M1 tests and M1.1 reviewer corrections.
- `cargo tree -p markflow-core --prefix none` — passed; output contains only `markflow-core`.

The M1.1 tests cover:

- Bidirectional logical/source byte mapping for BOM, CRLF, Mixed EOL, and Unicode, including explicit rejection of BOM-internal, CRLF-middle, out-of-bounds, and UTF-8-internal source positions.
- LF-normalized replacement inheritance for CRLF and Mixed documents, removed-EOL reuse, explicit CRLF/CR preservation, and untouched EOL boundaries.
- Caller-order-independent multi-change normalization, reverse-order success, normalized-overlap atomic rollback, and order-independent retry fingerprints.
- Post-edit Unicode selection validation, rebinding to the committed revision, stale/invalid selection rollback, and exact idempotent outcomes.
- A deterministic 256-entry transaction retry window, retained-id conflict behavior, oldest-entry eviction, and normal validation after eviction.

## M1.1 Release Benchmark

Reproducible command:

```bash
cargo run --release -p markflow-core --example m1_1_benchmark
```

The example is compiled but not executed by the default test suite. One release run on the environment above produced:

| Size | Source bytes | Open | Localized patch | Save |
| --- | ---: | ---: | ---: | ---: |
| 1 MB | 1,048,576 | 7.206 ms | 4.601 ms | 0.849 ms |
| 10 MB | 10,485,760 | 39.824 ms | 23.100 ms | 5.870 ms |
| 50 MB | 52,428,800 | 205.008 ms | 109.470 ms | 31.690 ms |

Known copy and memory limitations:

- Patch application clones the current logical `String` once before mutation so failure remains atomic; old and candidate text coexist until commit.
- Every successful patch rebuilds `LineIndex` and `PositionMap` with full-document scans. `PositionMap` currently owns another `LineIndex`, so line-start indexing is duplicated.
- A patch that changes newline boundaries still expands the RLE EOL map to a full per-boundary vector before recompressing it. A localized patch with no newline change now avoids that expansion.
- `save_payload()` allocates one complete source-byte `Vec<u8>`; `write_save_payload()` currently delegates through that owned payload rather than streaming directly.
- The retry cache is bounded to 256 entries and stores only a 128-bit payload fingerprint plus `PatchOutcome`, not full replacement text.
- The harness records wall-clock duration only. It does not measure peak RSS, allocator behavior, native Tauri IPC, or the source buffer retained by a caller.

M1 has no frozen numeric latency or peak-memory threshold, so these measurements do not fail its correctness gate and do not justify a rushed rope migration. Before M2/M3 large-file integration, run the same workloads with real fixtures, a native memory profiler, and native Tauri IPC; freeze patch p95, peak RSS, transport copies, and save allocation budgets before deciding whether to replace `String`, incremental indexes, or owned `SavePayload`.

## M1.1 Full Validation Matrix

- `openspec validate m1-core-foundation` — passed.
- `openspec validate --all` — passed, 59 items passed and 0 failed.
- `cargo test --workspace` — passed, 122 existing Tauri tests and 32 Core tests.
- `npm test` — passed, 31 files and 339 tests; existing PlantUML logging stderr noted above.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed; existing Vite warnings noted above.

The existing TypeScript/Tauri editor, serializer, save, export, and UI paths remain unchanged. M1.1 modifies only `markflow-core`, its tests/example, root formatting output where applicable, and this OpenSpec change.

## M1.1 Independent Reviewer Corrections

Reviewer findings addressed:

- `DocumentSession` text, revision, original snapshot, line index, and position map are private. Shared getters expose current text/snapshot/revision, while line and coordinate queries are session-bound facades.
- `TextBuffer::replace`, `TextBuffer::apply_changes`, source-byte construction, and direct `PositionMap` conversions are crate-internal. Two compile-fail doctests verify that external callers cannot access session text fields or invoke map conversion with caller-supplied text.
- `TextBuffer::from_logical_text` now returns `CoreResult<TextBuffer>`, rejects bare CR and CRLF with `InvalidLogicalLineEnding`, and retains a concrete dominant EOL for empty logical text.
- New tests cover left-adjacent EOL fallback, dominant EOL fallback without neighbors, patch-after-map rebuild, UTF-8/UTF-16/line-column/source-byte roundtrips, read-only session getters, and the LF-only logical constructor contract.

Reviewer-fix validation:

- `cargo fmt --all` — passed.
- `cargo clippy -p markflow-core --all-targets -- -D warnings` — passed.
- `cargo test -p markflow-core` — passed: 1 unit test, 29 integration tests, and 2 compile-fail API doctests.
- `cargo test --workspace` — passed: 122 existing Tauri tests and all 32 Core tests.
- `openspec validate --all` — passed: 59 items passed and 0 failed.

No TypeScript/Tauri editor, save, export, or UI implementation files were changed by the reviewer corrections.
