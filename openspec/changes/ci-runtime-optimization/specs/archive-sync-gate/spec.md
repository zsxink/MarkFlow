# Spec Delta

## MODIFIED Requirements

### Requirement: CI archive sync verification gate
The CI workflow SHALL run `bash scripts/check-archive-synced.sh` as part of the `web-checks` job on every PR to `main` and push to `main`.

#### Scenario: Archive sync passes
- **WHEN** running in CI and all archived changes are properly synced
- **THEN** the check step SHALL pass

#### Scenario: Archive sync fails in CI
- **WHEN** running in CI and an archived change has unsynced delta specs
- **THEN** the check step SHALL fail

#### Scenario: Archive sync check does not wait for system libraries
- **WHEN** CI runs the archive sync verification
- **THEN** the check runs in a job that installs no Linux system packages
