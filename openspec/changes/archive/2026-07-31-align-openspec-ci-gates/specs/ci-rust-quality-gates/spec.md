## ADDED Requirements

### Requirement: Rust workspace formatting gate
CI SHALL run Rust formatting verification for the Tauri workspace with `cargo fmt --all -- --check` from the `src-tauri` working directory. Rust-affecting PRs SHALL run the same command locally before PR creation or before marking verification complete.

#### Scenario: Workspace formatting is checked in CI
- **WHEN** CI runs for a PR to `main`
- **THEN** the workflow SHALL execute `cargo fmt --all -- --check` from `src-tauri`

#### Scenario: Local verification uses workspace formatting command
- **WHEN** a Rust-affecting change is verified locally before PR
- **THEN** verification SHALL use `cd src-tauri && cargo fmt --all -- --check`
- **THEN** local verification SHALL NOT treat `cargo fmt --manifest-path <path>` as equivalent to the workspace formatting gate

### Requirement: Rust workspace clippy gate
CI SHALL run Rust clippy for the Tauri workspace with `cargo clippy --workspace --all-targets -- -D warnings` from the `src-tauri` working directory. Rust-affecting PRs SHALL run the same command locally before PR creation or before marking verification complete.

#### Scenario: Workspace clippy is checked in CI
- **WHEN** CI runs for a PR to `main`
- **THEN** the workflow SHALL execute `cargo clippy --workspace --all-targets -- -D warnings` from `src-tauri`

#### Scenario: Local verification uses workspace clippy command
- **WHEN** a Rust-affecting change is verified locally before PR
- **THEN** verification SHALL use `cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings`
- **THEN** local verification SHALL NOT treat a single-crate clippy run as equivalent to the workspace clippy gate

### Requirement: Core clippy gate
CI SHALL run Core clippy with `cargo clippy --all-targets -- -D warnings` from the `markflow-core` working directory. Core-affecting PRs SHALL run the same command locally before PR creation or before marking verification complete.

#### Scenario: Core clippy is checked in CI
- **WHEN** CI runs for a PR to `main`
- **THEN** the workflow SHALL execute `cargo clippy --all-targets -- -D warnings` from `markflow-core`

#### Scenario: Local verification uses Core clippy command
- **WHEN** a Core-affecting change is verified locally before PR
- **THEN** verification SHALL use `cd markflow-core && cargo clippy --all-targets -- -D warnings`

### Requirement: CI-equivalent verification command list
The development workflow documentation SHALL list the CI-equivalent local verification commands and SHALL identify Rust workspace formatting, Rust workspace clippy, and Core clippy as mandatory for Rust-affecting changes.

#### Scenario: Developer reads pre-PR gate
- **WHEN** reading the development workflow pre-PR verification section
- **THEN** the documentation SHALL include exact commands for `npm test`, `npx tsc --noEmit`, OpenSpec validation, archive sync verification, frontend build, Rust tests, Rust workspace formatting, Rust workspace clippy, and Core clippy
