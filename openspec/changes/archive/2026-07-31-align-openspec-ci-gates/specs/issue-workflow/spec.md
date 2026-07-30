## ADDED Requirements

### Requirement: CI-equivalent verify before archive and PR
The Issue workflow SHALL run CI-equivalent verification after apply completes and before archive, push, PR creation, or merge. Verification SHALL include the commands that correspond to the affected areas and SHALL always include OpenSpec validation for OpenSpec-managed changes.

#### Scenario: OpenSpec-managed change is verified before archive
- **WHEN** `/opsx:apply` completes for an OpenSpec-managed change
- **THEN** the workflow SHALL run local verification before `/opsx:archive`
- **THEN** the workflow SHALL include `npm test`, `npx tsc --noEmit`, and `npm run validate:openspec` unless the change is explicitly docs-only and the skipped commands are recorded

#### Scenario: Rust-affecting change is verified before PR
- **WHEN** a change modifies Rust code or Rust tests
- **THEN** the workflow SHALL run the Rust test and clippy/formatting gates matching CI before PR creation

## MODIFIED Requirements

### Requirement: 一键自动化流水线入口
系统 SHALL 提供一个 `/markflow-issue <issue号>` 命令，接收一个 GitHub Issue 数字编号作为参数，自动执行端到端工作流。

#### Scenario: 正常流程 — 从 Issue 到 PR merge
- **WHEN** 用户输入 `/markflow-issue <N>`（N 为有效 GitHub Issue 号）
- **THEN** 系统依次执行：拉取 Issue 数据 → 创建分支 → propose → apply → CI 等价 verify → 独立 agent 复核 → sync specs → archive → push → PR → 等待 CI 通过 → squash merge

#### Scenario: 无效参数
- **WHEN** 用户输入 `/markflow-issue `（无参数）或 `/markflow-issue abc`（非数字）
- **THEN** 系统输出错误提示"请提供有效的 GitHub Issue 号"

### Requirement: 自动 Archive
系统 SHALL 在 verify 通过且独立 agent 复核完成后自动执行 OpenSpec archive。若 change 含 delta specs，系统 SHALL 先同步 delta specs 到主规范，再归档 change 目录。归档结果 SHALL 随 feature 分支进入 PR。

#### Scenario: Archive 操作
- **WHEN** verify 通过且独立 agent 复核完成
- **THEN** 系统在主会话中执行 archive 流程（sync delta specs + 移入 archive 目录）
- **THEN** 系统运行 `npm run validate:openspec` 与 `bash scripts/check-archive-synced.sh`

### Requirement: 自动 PR 创建与合并
系统 SHALL 在 archive 完成并通过归档后验证后自动创建 GitHub PR。系统 SHALL 等待 GitHub CI 通过后再 squash merge 到 main。

#### Scenario: Push + PR + Merge
- **WHEN** archive 完成且归档后验证通过
- **THEN** 系统推送分支到远程，创建 PR（title 复用 Issue 标题 + `(#N)`，body 含 `closes #N`）
- **THEN** 系统等待 PR CI 全部通过后 squash merge 到 main，删除远程分支

#### Scenario: Push 或 Merge 失败
- **WHEN** git push、PR CI 或 gh pr merge 失败
- **THEN** 系统暂停流水线，展示错误详情，等待用户决策
