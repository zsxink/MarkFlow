## ADDED Requirements

### Requirement: Independent CI test step for markflow-core

The CI workflow (`.github/workflows/ci.yml`) SHALL include a dedicated `cargo test` step for `markflow-core/`.
The CI workflow SHALL also include a `cargo clippy` step for `markflow-core/`.

#### Scenario: markflow-core tested in CI

- **WHEN** CI runs on a push to the repository
- **THEN** `cd markflow-core && cargo test` SHALL execute as an independent step

#### Scenario: markflow-core clippy in CI

- **WHEN** CI runs on a push to the repository
- **THEN** `cd markflow-core && cargo clippy --all-targets -- -D warnings` SHALL execute as an independent step
