## ADDED Requirements

### Requirement: Rust core behavior has executable regression coverage

The project SHALL maintain automated Rust tests for workspace/path and symlink validation, atomic save success and failure recovery, settings persistence, URL/DNS/redirect/response-limit enforcement, file-tree filtering, watcher event coalescing, and conflict-related backend decisions.

#### Scenario: Security and persistence regression suite runs
- **WHEN** `cargo test` is executed
- **THEN** the test harness SHALL execute tests for path containment, symlink rejection, atomic-write failure preservation, and HTTP restriction/limit behavior
- **THEN** the command SHALL report at least one executed Rust test

#### Scenario: High-risk failure paths are covered
- **WHEN** a test fixture injects a write, rename, network, watcher, or conflict failure
- **THEN** the test SHALL assert the returned error or resulting state
- **THEN** the original file or prior document state SHALL remain preserved where the product contract requires preservation

### Requirement: Rust integration fixtures are deterministic and offline

Rust integration tests SHALL use temporary directories and local HTTP fixtures or injectable transports, and SHALL NOT require public DNS or internet access.

#### Scenario: Filesystem tests isolate their data
- **WHEN** a filesystem integration test creates or modifies files
- **THEN** it SHALL use a unique temporary directory
- **THEN** the fixture SHALL be cleaned up after the test

#### Scenario: HTTP tests exercise real bounded responses locally
- **WHEN** a network test verifies streaming limits, redirect validation, or content checks
- **THEN** it SHALL communicate only with a local test server or controlled transport
- **THEN** the test SHALL complete with an explicit timeout

### Requirement: Frontend high-risk paths have regression coverage

The frontend test suite SHALL cover safe DOM construction, autosave revision/concurrency behavior, external modification conflicts, large-file fallback, and WYSIWYG/source mode serialization round trips.

#### Scenario: Stale save completion does not clear newer edits
- **WHEN** a save starts at revision N and an edit advances the document to revision N+1 before the save resolves
- **THEN** the persisted state SHALL retain the newer dirty state

#### Scenario: Mode and fallback paths preserve content
- **WHEN** content is switched between WYSIWYG and source mode repeatedly, or a large document triggers the fallback path
- **THEN** the test SHALL verify content remains complete and the editor state remains consistent

### Requirement: Pull requests enforce the complete quality gate

The required CI workflow SHALL run `npm test`, `npm run build`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, and `npm audit --omit=dev --audit-level=high`.

#### Scenario: Strict checks pass on a valid change
- **WHEN** all frontend, Rust, formatting, and dependency checks pass
- **THEN** the CI job SHALL pass for the pull request

#### Scenario: Strict Rust lint or formatting failure blocks merge
- **WHEN** Clippy emits a warning under `-D warnings`, or Rust formatting differs from `rustfmt`
- **THEN** the CI job SHALL fail

#### Scenario: High or critical production vulnerability blocks merge
- **WHEN** the production dependency audit reports a high or critical vulnerability
- **THEN** the CI job SHALL fail
- **THEN** moderate-only findings SHALL not fail the audit threshold
