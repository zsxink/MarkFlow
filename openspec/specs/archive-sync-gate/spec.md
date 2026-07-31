# archive-sync-gate Specification

## Purpose
定义 archive 变更的 spec 同步完整性校验与 CI 验证门禁要求，防止归档操作遗漏 delta spec 同步到主规范。

## Agent Context
- **源码入口：** `scripts/check-archive-synced.sh`、`.github/workflows/ci.yml`。
- **关联规范：** `INDEX.md`（OpenSpec 工作流）。
- **不变量：** 归档后的 delta spec 必须全部反映在主规范中；cutoff 日期前的旧归档不做追溯校验；校验只检测不修复，不自动同步。
- **验证：** `bash scripts/check-archive-synced.sh`；`npx openspec validate --all`；`npx openspec validate archive-sync-gate --strict`。

## Requirements

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

#### Scenario: Later archive removes an earlier requirement
- **WHEN** an archived delta spec on or after the cutoff contains a requirement under `## REMOVED Requirements`
- **THEN** the script SHALL NOT require the removed requirement to remain in the main spec solely because an earlier archive added it
- **THEN** the script SHALL continue checking the rest of the earlier archive's non-removed requirements

#### Scenario: Modified requirement titles use explanatory suffixes
- **WHEN** an archived delta spec uses a requirement title like `Requirement（修改 — reason）`
- **THEN** the script SHALL treat the stable requirement name before the `（修改...）` suffix as synced if the main spec contains that stable title

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
The development flow documentation (`AGENTS.md` and `openspec/specs/development-flow.md`) SHALL include explicit archive ordering and archive verification steps. For OpenSpec-managed changes with delta specs, documentation SHALL require syncing delta specs to main specs before moving the change directory to archive. The archived change and synced main specs SHALL be part of the feature branch PR, not an unreviewed post-merge change on `main`.

#### Scenario: Archive step documented
- **WHEN** reading AGENTS.md archive section
- **THEN** it SHALL mention syncing delta specs before archiving
- **THEN** it SHALL mention running `npm run validate:openspec` or `npx openspec validate --all` and `bash scripts/check-archive-synced.sh` after archiving a change

#### Scenario: Feature branch contains archive result
- **WHEN** reading the development flow documentation
- **THEN** it SHALL state that OpenSpec-managed changes are synced and archived on the feature branch before PR creation
- **THEN** it SHALL state that PR CI validates the archived delta specs are reflected in main specs

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
