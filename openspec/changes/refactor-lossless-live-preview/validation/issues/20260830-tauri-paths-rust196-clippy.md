# Validation issue — Rust 1.96 strict clippy rejects E2E path branches

状态：CLOSED

## Detection

- Run: `validation/evidence/P4B/20260830-062641-p4b-6432059/`
- Gate: C06b Tauri clippy
- Command: `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`

## Finding

Rust 1.96 reports two `clippy::needless_return` diagnostics in the `feature = "e2e"` branches of `src-tauri/src/paths.rs`. Because the validation gate promotes warnings to errors, the candidate cannot proceed even though the branches' runtime behavior is otherwise valid.

## Required closure

- make the two cfg branches expression-based without changing their path-selection semantics;
- pass Tauri fmt, strict all-features clippy, targeted tests, and a completely fresh C00–C18 run;
- link the final immutable passing run before closing this issue.

## Closure

- Final run `../evidence/P4B/20260830-064651-p4b-6432059/` passed C06b strict all-features Tauri clippy and C08 tests.
