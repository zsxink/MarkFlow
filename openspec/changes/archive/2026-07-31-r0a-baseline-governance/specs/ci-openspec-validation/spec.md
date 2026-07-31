## ADDED Requirements

### Requirement: Capability and fixture checks are part of validate
The `validate:openspec` npm script SHALL sequentially run `scripts/check-fixtures.sh` and `scripts/check-capability-matrix.sh` in addition to the OpenSpec spec validation.

#### Scenario: Fixture manifest fails validation
- **WHEN** `markflow-core/fixtures/manifest.json` is invalid or a fixture hash mismatches
- **THEN** `npm run validate:openspec` SHALL fail at the fixture check step

#### Scenario: Capability matrix fails validation
- **WHEN** `openspec/capabilities/matrix.json` is invalid, task ownership is duplicated, or a passed state lacks evidence
- **THEN** `npm run validate:openspec` SHALL fail at the capability check step
