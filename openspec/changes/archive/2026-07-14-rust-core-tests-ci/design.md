## Context

The repository already has Vitest coverage for several frontend helpers and existing product specs for atomic saves, safe HTTP fetching, sidebar conflicts, and editor serialization. The Rust crate currently has no executable tests despite containing the highest-risk file, path, settings, watcher, and network code. CI currently installs Node dependencies, runs the production audit, and runs frontend tests, but does not build the frontend or exercise the Rust toolchain.

The change must preserve existing behavior, remain deterministic in CI, and avoid public-network dependencies. Tests should expose pure decisions where practical instead of coupling every assertion to Tauri runtime objects.

## Goals / Non-Goals

**Goals:**

- Establish executable regression coverage for the high-risk behaviors named by Issue #92.
- Make failure paths observable with temporary files, local HTTP fixtures, and controlled test inputs.
- Keep tests fast enough for every pull request and make the CI commands match the local project commands.
- Resolve current `cargo clippy --all-targets -- -D warnings` findings.

**Non-Goals:**

- Changing workspace security rules, HTTP policy, save semantics, watcher semantics, or editor UX.
- End-to-end testing of the full Tauri desktop shell or real OS file dialogs.
- Testing against public DNS, public HTTP services, or platform-specific GUI behavior.
- Introducing a new test framework when Rust's built-in test harness and the existing Vitest setup are sufficient.

## Decisions

### 1. Test pure Rust boundaries in place and extract only where necessary

Add unit tests beside or within the Rust modules for path normalization, workspace containment, symlink rejection, file-tree filtering, and watcher event coalescing. Extract small pure helpers only when the current command or callback cannot be tested without Tauri state. This keeps production behavior stable and makes security decisions directly testable.

**Alternative considered:** testing only through Tauri command invocation. Rejected because it would make tests slower, platform-dependent, and unable to isolate failure causes.

### 2. Use temporary directories and an in-process/local HTTP fixture

Use unique temporary directories for atomic writes, settings, path boundaries, and file-tree fixtures. Exercise HTTP limits, redirects, content validation, and timeout/error handling through a local server or injectable transport boundary, never the public internet. If a new test-only dependency is required, keep it under Rust dev-dependencies and prefer a minimal synchronous fixture compatible with the existing Tokio runtime.

**Alternative considered:** mocking every HTTP response without a server. Rejected because streaming, redirect, and actual response-size behavior are the risks being tested.

### 3. Test frontend orchestration through existing module seams

Extend Vitest tests around exported state and helper boundaries, using `happy-dom` and focused mocks for Tauri IPC, timers, DOM APIs, and storage. Cover revision snapshots, stale-save completion, external modifications, large-document fallback, safe DOM construction, and repeated mode switches without booting a full desktop window.

**Alternative considered:** browser-driven tests for every editor path. Rejected for this change because they are slower and less reliable in CI; the unit/integration seams provide sufficient regression signal.

### 4. Make CI a single required quality gate

Keep the existing production audit and add Rust toolchain setup plus the ordered checks: `npm test`, `npm run build`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, and `cargo fmt --check`. The audit remains `npm audit --omit=dev --audit-level=high`, so high and critical production vulnerabilities fail the job while moderate findings do not.

**Alternative considered:** separate optional jobs. Rejected because optional or independently non-required jobs can allow a PR to merge with a failed security or Rust check; a single required job provides an unambiguous merge gate.

## Risks / Trade-offs

- [Risk] Tests tied to private implementation details become brittle during refactoring → [Mitigation] Prefer pure helper contracts and observable outcomes; keep fixture builders local to tests.
- [Risk] Local HTTP tests can hang or leak resources → [Mitigation] Bind to an ephemeral localhost port, set explicit timeouts, and shut down the fixture per test or suite.
- [Risk] Rust test dependencies increase build time → [Mitigation] Use small dev-only dependencies and temporary-directory fixtures; avoid heavyweight browser or network stacks.
- [Risk] CI toolchain drift causes local/CI differences → [Mitigation] Use the repository's lockfiles and a stable Rust toolchain setup, and keep the exact commands documented in tasks.
- [Risk] Existing code may reveal behavior mismatches while adding tests → [Mitigation] Treat the spec scenarios as the contract; separate genuine bug fixes from test-only refactors and preserve issue scope.

## Migration Plan

1. Add the regression tests and any minimal test seams, then fix only the Clippy findings exposed by strict linting.
2. Run the full local quality command set and update CI to run the same checks.
3. No data migration or user rollout is required. If CI adoption exposes unrelated baseline failures, temporarily isolate the failing check while retaining the test and resolve it before making the gate required.

Rollback is a revert of the CI/test change; it does not require changes to user data or persisted formats.

## Open Questions

- Confirm whether the repository's preferred Rust toolchain should be pinned via a new `rust-toolchain.toml` or only selected in the GitHub Actions setup step.
- Confirm the minimal local HTTP fixture approach after inspecting the current `reqwest` implementation and Tokio runtime constraints.
