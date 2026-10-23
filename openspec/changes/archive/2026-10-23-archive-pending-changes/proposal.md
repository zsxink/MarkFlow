# Proposal

## Why

`compact-frontmatter-properties`（紧凑可编辑笔记属性）与 `editor-default-context-menu`（编辑区默认右键菜单 + 统一菜单外观）两个变更的实现都已合入 `main`，`tasks.md` 全部勾选、`openspec validate --strict` 通过，但两个 change 目录仍滞留在 `openspec/changes/` 下。`AGENTS.md` 的强制规则要求：归档前必须先把 delta spec 合并进主规范，再移动目录，并跑 `openspec validate --all`、`scripts/check-archive-synced.sh`、`scripts/check-layering.mjs` 门禁；`scripts/check-archive-synced.sh` 只扫描 `changes/archive/**`，未归档的 delta 正好落在门禁盲区，因此只能靠补做归档来消除这个盲区（Issue #369）。

## What Changes

- 用 `openspec-sync-specs` 把 `compact-frontmatter-properties` 的 delta（`specs/frontmatter-visual-editor/spec.md`，3 条 ADDED Requirement）合并进 `openspec/specs/frontmatter-visual-editor/spec.md`。
- 用 `openspec-sync-specs` 把 `editor-default-context-menu` 的 delta（`specs/context-menu/spec.md`，2 条 ADDED Requirement）合并进 `openspec/specs/context-menu/spec.md`，并让主规范的 `Agent Context` 与 `API`/`DOM` 段落反映子菜单、快捷键、默认编辑菜单分流等新增能力。
- 两个 change 目录归档到 `openspec/changes/archive/2026-10-23-<name>/`。
- 归档后跑门禁：`npx openspec validate --all`、`bash scripts/check-archive-synced.sh`、`node scripts/check-layering.mjs`。
- 归档前派独立 sub-agent 复核（静态走查 + `npm test` + `npx tsc --noEmit`），归档后再派新的 sub-agent 复核最终 diff。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. 本次只把**已经合入并由测试覆盖**的现有行为对应的 delta spec 补进主规范，不改变任何规范语义；因此 `.openspec.yaml` 设置 `skip_specs: true`。

> 注：被归档的两个变更各自的 delta 仍按 `AGENTS.md` 强制流程先同步进主规范——那是被归档变更的 delta，不是本次提案引入的新 delta。

## Impact

- 规范：`openspec/specs/frontmatter-visual-editor/spec.md`（追加 3 条 Requirement）、`openspec/specs/context-menu/spec.md`（追加 2 条 Requirement + 补充 Agent Context / API 说明）。
- 变更档案：`openspec/changes/compact-frontmatter-properties/`、`openspec/changes/editor-default-context-menu/` 移入 `openspec/changes/archive/2026-10-23-<name>/`；本变更自身随后同样归档。
- 无产品代码、无测试代码、无 API、无依赖、无构建配置、无 Rust 侧改动。
- 验收：`openspec/changes/` 下只剩 `archive`；`npx openspec validate --all`、`bash scripts/check-archive-synced.sh`、`node scripts/check-layering.mjs` 全绿；`npm test`、`npx tsc --noEmit` 与 `main` 一致通过。
