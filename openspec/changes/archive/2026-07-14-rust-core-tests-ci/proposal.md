## Why

Issue #92 exposes a gap between the current green checks and the real risk profile of MarkFlow: Rust reports success without exercising any tests, while file safety, network restrictions, watcher behavior, conflict handling, and editor persistence paths have little automated regression coverage. The change is needed now so security and data-loss regressions are caught in pull requests rather than during manual acceptance.

## What Changes

- Add meaningful Rust unit and integration coverage for workspace/path and symlink validation, atomic save failure recovery, bounded and restricted HTTP fetching, file-tree filtering, watcher event coalescing, and conflict-related behavior.
- Add frontend regression coverage for DOM construction, autosave revision/concurrency behavior, external modification conflicts, large-file fallback, and WYSIWYG/source mode serialization.
- Use temporary directories and local HTTP servers for deterministic integration tests; failure-path tests SHALL cover injected write, rename, network, and conflict failures without depending on the public internet.
- Fix the three current strict Clippy findings without changing user-visible behavior.
- Expand the pull-request CI quality gate to run frontend tests and build, Rust tests, strict Clippy, formatting checks, and the existing production dependency audit. High/critical production dependency findings SHALL fail the check.

## Capabilities

### New Capabilities

- `regression-coverage`: Defines the required automated regression coverage and deterministic test boundaries for high-risk Rust and frontend paths.

### Modified Capabilities

- None. Existing product behavior specifications remain unchanged; this change verifies and hardens their current implementation.

## Impact

- Rust sources under `src-tauri/src/`, including file commands, path validation, HTTP handling, settings persistence, and filesystem watcher code.
- Frontend sources and tests under `src/` for persistence, conflict, DOM, large-document, and editor mode-switch paths.
- `.github/workflows/ci.yml` and possibly Rust test-only dependencies or test helpers.
- No public command/API behavior or user-facing feature is intentionally changed.
