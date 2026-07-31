## ADDED Requirements

### Requirement: Archive honesty check runs before archive
The repository SHALL include `scripts/check-evidence-honesty.sh` verifying that archived capability evidence is non-empty, current-revision, and that required gates marked PASS carry evidence URIs.

#### Scenario: Honesty check passes for complete change
- **WHEN** running `scripts/check-evidence-honesty.sh` and all archived capabilities have non-empty, current-revision evidence with referenced files present
- **THEN** the script SHALL exit with code 0 and print a summary count

#### Scenario: Fabricated evidence fails the check
- **WHEN** a capability state is `true` but has no evidence URI, or evidence `revision` does not match current HEAD
- **THEN** the script SHALL exit non-zero and print the capability and field

#### Scenario: Honesty check is wired to validate
- **WHEN** running `npm run validate:openspec`
- **THEN** SHALL execute `scripts/check-evidence-honesty.sh` when an archive directory is present in the change under review, otherwise SHALL skip with a message
