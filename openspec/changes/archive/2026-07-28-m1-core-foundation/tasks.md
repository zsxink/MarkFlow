## 1. Workspace and Crate

- [x] 1.1 Add a root Cargo workspace that includes `src-tauri` and `markflow-core` without changing existing Tauri package metadata.
- [x] 1.2 Create the `markflow-core` crate with the M1 module layout and no host/UI/network/file IO dependencies.

## 2. Document Kernel

- [x] 2.1 Implement MarkFlow-owned public newtypes, error types, `DocumentSession`, `OriginalSnapshot`, and save payload APIs.
- [x] 2.2 Implement `TextBuffer` with LF logical text and run-length encoded `LineEndingMap` for LF, CRLF, Mixed EOL, BOM, and trailing newline preservation.
- [x] 2.3 Implement `LineIndex` and `PositionMap` conversions for UTF-8 byte, UTF-16 code unit, line/column, source byte offsets, and revision-bound ranges.
- [x] 2.4 Implement `TextPatch` application with revision checks, range sorting/non-overlap validation, character-boundary validation, rollback on failure, and idempotent transaction retry.

## 3. Fixtures and Tests

- [x] 3.1 Add the required M1 lossless fixtures under `markflow-core/fixtures/lossless/`.
- [x] 3.2 Add Rust unit tests for snapshots, line index, line ending map, position map, patch apply/failure atomicity, and save bytes.
- [x] 3.3 Add fixture tests for open/save byte-for-byte roundtrip, CRLF/Mixed EOL/BOM/trailing newline preservation, and untouched-region preservation after localized patch.
- [x] 3.4 Add property-style generated tests for Unicode offset reversibility and EOL map behavior after patches.

## 4. Validation and OpenSpec

- [x] 4.1 Validate the OpenSpec change and update artifacts if validation reports contract issues.
- [x] 4.2 Run Core Rust tests without Tauri startup.
- [x] 4.3 Run project TypeScript/Rust build checks to confirm current application paths do not regress.
- [x] 4.4 Record validation results and mark all completed tasks in this checklist.

## 5. M1.1 Correctness and Scalability Gate

- [x] 5.1 Add strict `SourceByteOffset -> ByteOffset` conversion with explicit BOM, CRLF-middle, out-of-bounds, and source UTF-8 boundary errors; cover BOM, CRLF, Mixed, and Unicode roundtrips.
- [x] 5.2 Implement deterministic EOL inheritance for LF-normalized editor replacements while preserving explicit CRLF/CR and untouched source EOLs.
- [x] 5.3 Normalize a copy of patch changes inside Core, accept reverse-ordered non-overlapping changes, reject normalized overlap atomically, and make equivalent orderings produce identical results.
- [x] 5.4 Validate projected post-edit selections and bind successful `selection_after` values to `next_revision`; cover Unicode, stale, failed, and idempotent retry cases.
- [x] 5.5 Replace unbounded full-patch retry storage with a deterministic 256-entry fingerprint/outcome window and test conflict plus eviction behavior.
- [x] 5.6 Add a default-skipped std-only release harness for 1/10/50 MB localized patch and save evidence.
- [x] 5.7 Run Core-focused formatting/tests and record M1.1 benchmark timings plus known copy/memory limitations.
- [x] 5.8 Run the full OpenSpec, Rust workspace, TypeScript, and production build validation matrix; update `validation-results.md`.

## 6. M1.1 Independent Reviewer Corrections

- [x] 6.1 Make session-owned text/revision/snapshot/index/map state private, expose read-only getters and session-bound coordinate conversion facades, and restrict direct text mutation/map conversion to the crate.
- [x] 6.2 Make `TextBuffer::from_logical_text` return `CoreResult`, reject CR with `InvalidLogicalLineEnding`, and preserve a concrete dominant fallback for empty logical text.
- [x] 6.3 Add left/dominant EOL fallback, post-patch coordinate roundtrip, logical-constructor, and public-invariant regression coverage; update existing tests and benchmark for the tightened API.
- [x] 6.4 Run formatting, strict Core clippy, Core/workspace tests, and full OpenSpec validation; record reviewer-fix evidence in `validation-results.md`.
