# feature-flag-rollback Specification

## Purpose

定义 phase-2 里程碑特性开关的注册与生命周期治理：机器可读的 flags 注册表（含 schema）、按里程碑记录的默认值/回退行为/删除时间/属主 child change，以及过期开关必须删除的强制规则。回退边界只允许 exact-source-projection，禁止 serializer、DOM-save 或 ProseMirror 回退。

## Agent Context

- **源码入口：** `openspec/capabilities/flags.json`、`openspec/capabilities/flags.schema.json`、`docs/markflow-core-phase2/flags.md`（人类可读说明）、`scripts/check-capability-matrix.sh`。
- **关联规范：** `phase2-governance`（capability matrix 的 flag 引用）、`ci-openspec-validation`（检查纳入 `validate:openspec`）。
- **不变量：** 每个 flag 的 `fallback` 只能为 `exact-source-projection`；过期 flag 必须从产品配置移除；matrix 中非空 flag 引用必须能在 flags.json 中解析。
- **验证：** `scripts/check-capability-matrix.sh`；`npm run validate:openspec`。

## Requirements

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
