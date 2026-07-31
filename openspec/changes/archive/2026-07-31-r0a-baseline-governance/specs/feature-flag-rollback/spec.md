## ADDED Requirements

### Requirement: Feature flags are defined per milestone with rollback behavior
The repository SHALL maintain `docs/markflow-core-phase2/flags.md` (human-readable) and `openspec/capabilities/flags.json` (machine-readable, with schema). Each flag SHALL record id, stage, default value, fallback behavior, deletion time, and owning child change.

#### Scenario: Flag schema is validated
- **WHEN** running `scripts/check-capability-matrix.sh` on `openspec/capabilities/flags.json`
- **THEN** SHALL validate against the flags schema and fail on unknown fields

#### Scenario: Rollback is exact source projection only
- **WHEN** a flag's `fallback` value is not `exact-source-projection`
- **THEN** the check SHALL fail; serializer, DOM-save, and ProseMirror fallback values SHALL be rejected

### Requirement: Expired flags are removed
A flag whose `deleteAfter` milestone or date has passed SHALL be removed from the product configuration, and its use SHALL fail the rollback/flag check.

#### Scenario: Expired flag still configured
- **WHEN** a flag's deletion time has passed but it is still configured
- **THEN** `scripts/check-capability-matrix.sh` SHALL fail and name the flag
