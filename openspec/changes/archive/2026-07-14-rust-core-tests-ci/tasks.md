## 1. Rust test seams and filesystem coverage

- [x] 1.1 Inventory the Rust file/path, settings, HTTP, watcher, and conflict code paths and identify the smallest pure helpers needed for test isolation.
- [x] 1.2 Add Rust unit tests for workspace containment, lexical/canonical path handling, symlink rejection, hidden-file filtering, and recursive file-tree ordering.
- [x] 1.3 Add temporary-directory tests for atomic write success, parent-directory creation, write failure cleanup, rename failure cleanup, and preservation of the original file.
- [x] 1.4 Add settings persistence tests proving successful cache updates and preservation/fallback behavior when settings input is invalid or unreadable.
- [x] 1.5 Add watcher tests for relevant event filtering, self-write suppression, duplicate-event coalescing, and conflict-triggering changes.

## 2. Rust network and lint coverage

- [x] 2.1 Add deterministic local HTTP fixtures or an injectable transport boundary for response streaming and request error scenarios.
- [x] 2.2 Add Rust tests for URL scheme validation, DNS/IP restrictions, redirect revalidation, response-size limits, image content validation, timeout behavior, and sanitized logging inputs.
- [x] 2.3 Add failure-path assertions for network errors and oversized/mismatched responses, ensuring no partial result is persisted.
- [x] 2.4 Fix the three current Clippy findings while preserving behavior, then verify `cargo clippy --all-targets -- -D warnings` passes.
- [x] 2.5 Run `cargo fmt` and verify `cargo fmt --check` passes with the new tests and helper changes.

## 3. Frontend regression coverage

- [x] 3.1 Add or extend Vitest fixtures for safe DOM construction and assert that untrusted content is not interpreted as executable markup.
- [x] 3.2 Add autosave revision/concurrency tests covering a save resolving after a newer edit and confirming the document remains dirty for the newer revision.
- [x] 3.3 Add external modification conflict tests covering dirty and clean documents, external deletion, and the resulting user-visible state decisions.
- [x] 3.4 Add large-file fallback tests covering bounded loading/serialization behavior and complete content preservation.
- [x] 3.5 Add WYSIWYG/source mode round-trip tests, including repeated switching and serialization-integrity fallback behavior.
- [x] 3.6 Run `npm test` and `npm run build`, resolving only regressions attributable to this change.

## 4. CI quality gate

- [x] 4.1 Update `.github/workflows/ci.yml` to install/select the Rust toolchain and cache Rust dependencies where supported.
- [x] 4.2 Add CI steps for `npm run build`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, and `cargo fmt --check` alongside the existing frontend test and production audit steps.
- [x] 4.3 Confirm `npm audit --omit=dev --audit-level=high` remains a required step so high/critical production vulnerabilities fail while moderate-only findings do not.
- [x] 4.4 Run the complete local CI-equivalent command set and record/resolve any baseline failures before marking the quality gate complete.

## 5. Verification and handoff

- [x] 5.1 Validate the OpenSpec change with `openspec validate rust-core-tests-ci`.
- [x] 5.2 Review the diff for accidental product behavior changes, public-network test dependencies, generated files, and untracked artifacts.
- [x] 5.3 Confirm all acceptance scenarios in `specs/regression-coverage/spec.md` map to an automated test or CI assertion.
