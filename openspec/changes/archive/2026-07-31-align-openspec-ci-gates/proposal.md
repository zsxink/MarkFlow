## Why

MarkFlow 的 OpenSpec 流程、开发流程文档与 CI 门禁之间存在执行歧义，导致实施时容易用局部验证替代 CI 等价验证，并在 PR 阶段才暴露 Rust workspace formatting、workspace clippy 或 Core clippy 失败。

这次变更收敛流程文档，把方案确定后的执行顺序、归档时机、独立复核和本地 CI 等价 gate 明确为不可省略的检查点。

## What Changes

- 明确标准流程：Issue → branch → `/opsx:propose` → `/opsx:apply` → 本地 CI 等价验证 → 独立 agent 复核 → sync/archive → push/PR/CI/merge。
- 明确 PR 前必须运行的关键本地验证命令，特别是 Rust workspace formatting、workspace clippy 与 Core clippy。
- 收敛 archive 顺序：feature 分支内完成 sync specs + archive，归档结果进入 PR；PR 合入后不再单独补 archive。
- 强化独立 agent 复核要求：archive 前与 merge 前都需要明确复核结论，不能由主执行流自我替代。
- 更新 `AGENTS.md` 与 `openspec/specs/development-flow.md`，使 agent 入口文档和详细流程文档一致。

## Capabilities

### New Capabilities

- `ci-rust-quality-gates`: 定义 Rust workspace formatting、workspace clippy 和 Core clippy 在 CI 与本地 PR 前验证中的要求。

### Modified Capabilities

- `issue-workflow`: 收敛自动/手动 Issue 工作流中的 verify、archive、PR 顺序。
- `archive-sync-gate`: 明确 archive 必须在 feature 分支内先 sync specs、再归档，并作为 PR 内容接受 CI 校验。

## Impact

- 文档：`AGENTS.md`、`openspec/specs/development-flow.md`。
- OpenSpec：新增 Rust CI 质量门禁 spec，更新 issue workflow 与 archive sync gate delta spec。
- 行为：不改运行时代码，不改 GitHub Actions，只把现有 CI 命令固化为本地执行流程要求。
