## ADDED Requirements

### Requirement: Phase 2 tracking source is machine-readable
`docs/markflow-core-phase2/**` SHALL identify `openspec/capabilities/matrix.json` and `requirements.json` as the machine-readable tracking source for phase-2 implementation status and task ownership.

#### Scenario: README links the matrix
- **WHEN** reading `docs/markflow-core-phase2/README.md`
- **THEN** it SHALL link to `openspec/capabilities/matrix.json` as the tracking source
- **THEN** it SHALL NOT describe the archived charter as product acceptance

#### Scenario: Traceability matrix references requirements source
- **WHEN** reading `docs/markflow-core-phase2/04-traceability-matrix.md`
- **THEN** it SHALL state that unique task ownership is defined by `openspec/capabilities/requirements.json`
