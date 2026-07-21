## ADDED Requirements

### Requirement: Archive sync verification script
The repository SHALL include a script `scripts/check-archive-synced.sh` that verifies archived OpenSpec changes have their delta specs synced into main specs.

#### Scenario: All archived changes synced
- **WHEN** running `bash scripts/check-archive-synced.sh` and all archived changes (on/after cutoff) have delta specs fully reflected in `openspec/specs/<capability>/spec.md`
- **THEN** the script SHALL exit with code 0 and print "OK: all archived delta specs ... are synced to main specs"

#### Scenario: Unsynced archived change detected
- **WHEN** running `bash scripts/check-archive-synced.sh` and an archived change (on/after cutoff) has delta spec lines not found in the corresponding main spec
- **THEN** the script SHALL exit with non-zero and print "FAILED:" with a count of unsynced changes

#### Scenario: Legacy archive skipped
- **WHEN** running `bash scripts/check-archive-synced.sh` and an archive's date predates the cutoff (`ARCHIVE_SYNC_CUTOFF` or default `2026-07-21`)
- **THEN** the script SHALL skip verification for that archive and print a count of skipped legacy archives

#### Scenario: No archive directory
- **WHEN** running `bash scripts/check-archive-synced.sh` and `openspec/changes/archive/` does not exist
- **THEN** the script SHALL exit with code 0 and print a skip message

### Requirement: CI spec validation gate
The CI workflow (`.github/workflows/ci.yml`) SHALL run `npx openspec validate --all` on every PR to `main` and push to `main`.

#### Scenario: PR with valid specs
- **WHEN** a PR to `main` has all specs valid
- **THEN** the validate step SHALL pass and the workflow continues

#### Scenario: PR with invalid specs
- **WHEN** a PR to `main` has spec validation errors
- **THEN** the workflow SHALL fail at the validate step

### Requirement: CI archive sync verification gate
The CI workflow SHALL run `bash scripts/check-archive-synced.sh` as part of the audit-and-test job on every PR to `main` and push to `main`.

#### Scenario: Archive sync passes
- **WHEN** running in CI and all archived changes are properly synced
- **THEN** the check step SHALL pass

#### Scenario: Archive sync fails in CI
- **WHEN** running in CI and an archived change has unsynced delta specs
- **THEN** the check step SHALL fail

### Requirement: Development flow documentation
The development flow documentation (`AGENTS.md`) SHALL include an explicit "archive verification" step after archive operations.

#### Scenario: Archive step documented
- **WHEN** reading AGENTS.md archive section
- **THEN** it SHALL mention running `npx openspec validate --all` and `bash scripts/check-archive-synced.sh` after archiving a change
