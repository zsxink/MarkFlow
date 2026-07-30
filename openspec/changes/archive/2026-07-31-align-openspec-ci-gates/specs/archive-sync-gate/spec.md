## MODIFIED Requirements

### Requirement: Development flow documentation
The development flow documentation (`AGENTS.md` and `openspec/specs/development-flow.md`) SHALL include explicit archive ordering and archive verification steps. For OpenSpec-managed changes with delta specs, documentation SHALL require syncing delta specs to main specs before moving the change directory to archive. The archived change and synced main specs SHALL be part of the feature branch PR, not an unreviewed post-merge change on `main`.

#### Scenario: Archive step documented
- **WHEN** reading AGENTS.md archive section
- **THEN** it SHALL mention syncing delta specs before archiving
- **THEN** it SHALL mention running `npm run validate:openspec` or `npx openspec validate --all` and `bash scripts/check-archive-synced.sh` after archiving a change

#### Scenario: Feature branch contains archive result
- **WHEN** reading the development flow documentation
- **THEN** it SHALL state that OpenSpec-managed changes are synced and archived on the feature branch before PR creation
- **THEN** it SHALL state that PR CI validates the archived delta specs are reflected in main specs
