## ADDED Requirements

### Requirement: Stage docs updated to reflect current state

`docs/markflow-core-stages/technical-plan.md` SHALL be reviewed and updated to reflect M3 post-implementation state (architecture descriptions, cargo layout).
`docs/markflow-core-stages/product-plan.md` SHALL be updated to match current product status.
`docs/markflow-core-stages/feature-migration-matrix.md` SHALL replace "测试与验证中" entries with precise status (verified/not completed).
`docs/markflow-core-stages/m3-core-backed-source-mode.md` SHALL include a verifiable acceptance checklist.

#### Scenario: technical-plan not misleading

- **WHEN** reading `docs/markflow-core-stages/technical-plan.md`
- **THEN** architecture descriptions SHALL match the current implementation

### Requirement: Spec fragmentation assessed

Existing legacy specs (`openspec/specs/architecture.md`, `openspec/specs/technical-design.md`) SHALL be reviewed and their status documented.
The overlap between `openspec/specs/core-restructure/spec.md`, `core-backed-source-mode/spec.md`, `runtime-document-service/spec.md` and stage docs SHALL be assessed.

#### Scenario: legacy status documented

- **WHEN** reading `openspec/specs/architecture.md`
- **THEN** it SHALL clearly indicate its status (historical reference, kept as-is)
