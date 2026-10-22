# Proposal

## Why

`openspec/specs/development-flow.md` §4.4 要求变更在 PR 合并到 `main` 后执行归档：含 delta spec 的变更必须先 `openspec-sync-specs` 合并进主规范，再移动目录（禁止「只搬目录不同步」），且 archive 前必须先派独立 agent 复核。但 PR #331（`bundle-chunk-optimization`）与 PR #329（`source-mode-soft-wrap`）的实现都已合入 `main`，两个 change 目录却仍滞留在 `openspec/changes/` 下，`openspec/changes/` 里剩下的非 archive 目录恰好只有这两个（Issue #338）。

其中 `source-mode-soft-wrap` 的问题更实质：它的 delta spec 里的两条 Requirement ——「源码模式自动换行跟随 `softWrap` 设置」与「源码模式运行时配置互不干扰」——从未进入 `openspec/specs/codemirror-source-editor/spec.md`（对该文件 `grep "softWrap\|自动换行"` 命中数为 0），`tasks.md` 的 4.3、4.4 也仍未勾选。实现已经在生产代码里（`src/lib/editor.source.ts` 的 `softWrapCompartment`），但规范层没有记录，档案也不完整。`scripts/check-archive-synced.sh` 当前不会报错，因为它只校验已经进入 `archive/` 的 delta spec，这两个目录正好落在门禁盲区里。

现在补做归档，把规范与实现对齐，并消除这个盲区里的滞留项。

## What Changes

- `source-mode-soft-wrap`：用 `openspec-sync-specs` 把 delta spec 的两条 Requirement 合并进 `openspec/specs/codemirror-source-editor/spec.md`，并在该文件的 `Agent Context` 补充软换行 Compartment 说明（与既有 readOnly / highlight Compartment 并列）。
- `source-mode-soft-wrap`：补做 `tasks.md` 4.3 的手工验证项，逐项记录验证结论与覆盖方式（单元测试覆盖的部分注明用例，需真实渲染才能观察的部分给出结论依据）；勾选 4.3、4.4 后归档。
- `bundle-chunk-optimization`：`tasks.md` 已全部勾选、`.openspec.yaml` 为 `skip_specs: true` 且无 delta spec，直接归档。
- 归档后运行 `npx openspec validate --all` 与 `bash scripts/check-archive-synced.sh` 确认全绿。
- 不修改 `scripts/check-archive-synced.sh` 的门禁逻辑：本次只需清掉盲区里的两个存量项，扩展门禁需要单独提案（例如把未归档 change 的 delta 与主规范比对），避免把门禁策略变更混进归档收尾。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. 本次是归档与规范同步的收尾动作：`codemirror-source-editor` 的两条 Requirement 描述的是**已经合入并已由单元测试覆盖**的现有行为，本次只是把既有 delta spec 补进主规范，不改变任何规范语义。因此 `.openspec.yaml` 设置 `skip_specs: true`。

> 注：`source-mode-soft-wrap` 自己的 delta spec 仍按 §4.4 的强制流程同步进主规范——那是被归档变更的 delta，不是本次提案引入的新 delta。

## Impact

- 规范：`openspec/specs/codemirror-source-editor/spec.md`（追加两条 Requirement + `Agent Context` 一段说明）。
- 变更档案：`openspec/changes/source-mode-soft-wrap/`、`openspec/changes/bundle-chunk-optimization/` 移入 `openspec/changes/archive/2026-10-22-<name>/`。
- 变更档案：本变更自身的 `tasks.md` / `proposal.md` / `design.md`。
- 无产品代码、无 API、无依赖、无构建配置、无 Rust 侧改动。
- 验收：`npx openspec validate --all`、`bash scripts/check-archive-synced.sh`、`npm test`、`npx tsc --noEmit`。
