## Why

当前开发流程需要手动依次执行多个命令（`/opsx:propose` → `/opsx:apply` → 自审 → `/opsx:archive` → `gh pr create`），端到端从 Issue 到 PR merge 需 7+ 轮交互。一个自动化命令封装整个流程，将沉重环节委托 sub agent 执行，减少用户在流水线上的重复操作。

## What Changes

- 新增 `.claude/commands/markflow-issue` 命令文件，接受一个 GitHub Issue 号作为参数
- 命令自动执行 7 阶段流水线：拉取 Issue → 创建分支 → propose → apply（sub agent）→ verify（sub agent）→ archive → PR merge
- 引入修复循环机制：verify 失败时自动回到 apply 修复（最多 3 轮），修复不了则暂停等待用户决策
- 无需修改任何现有代码文件，仅新增命令文件和其依赖的 design spec

## Capabilities

### New Capabilities

- `issue-workflow`: 端到端 Issue 自动化处理命令。接受一个 Issue 号，自动完成分支创建、propose、sub-agent 驱动的编码与审查、archive、PR 创建与合并。

### Modified Capabilities

- `development-flow`: 更新开发流程文档，将手动 7 步流程中可选的手动执行路径指向 `/markflow-issue` 自动化命令

## Impact

- 新增 `.claude/commands/markflow-issue` 命令文件（约 300-500 行 markdown）
- 更新 `openspec/specs/development-flow.md` 增加快速路径指引
- 依赖 `gh` CLI（已安装）和 OpenSpec CLI（已安装）
- 不需要修改任何 TypeScript/Rust 代码
