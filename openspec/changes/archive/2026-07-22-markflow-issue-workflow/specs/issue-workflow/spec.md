## ADDED Requirements

### Requirement: 一键自动化流水线入口
系统 SHALL 提供一个 `/markflow-issue <issue号>` 命令，接收一个 GitHub Issue 数字编号作为参数，自动执行端到端工作流。

#### Scenario: 正常流程 — 从 Issue 到 PR merge
- **WHEN** 用户输入 `/markflow-issue <N>`（N 为有效 GitHub Issue 号）
- **THEN** 系统依次执行：拉取 Issue 数据 → 创建分支 → propose → apply → verify → archive → PR merge

#### Scenario: 无效参数
- **WHEN** 用户输入 `/markflow-issue `（无参数）或 `/markflow-issue abc`（非数字）
- **THEN** 系统输出错误提示"请提供有效的 GitHub Issue 号"

---

### Requirement: 从 GitHub Issue 自动推导参数
系统 SHALL 自动从 Issue 数据推导分支名、change name 和 type。

#### Scenario: 从 labels 推导 type
- **WHEN** Issue 包含 label `bug`
- **THEN** type 推导为 `fix`
- **WHEN** Issue 包含 label `feat`
- **THEN** type 推导为 `feat`
- **WHEN** Issue 包含 label `refactor`
- **THEN** type 推导为 `refactor`
- **WHEN** Issue 不匹配任何已知 label
- **THEN** type 默认使用 `chore`

#### Scenario: 从 title 推导 change name
- **WHEN** Issue title 为 `feat: 加个啥功能`
- **THEN** changeName 为去掉 `<type>:` 前缀后的 kebab-case 形式，最长 40 字符

#### Scenario: 从 title 和 type 推导分支名
- **WHEN** type 为 `fix`，Issue 号为 `42`
- **THEN** branchName 格式为 `fix/issue-42-<kebab-title>`

---

### Requirement: Sub Agent 隔离执行
系统 SHALL 使用独立 sub agent 执行 apply（编码实施）和 verify（审查验证）两个阶段。

#### Scenario: Apply 阶段派遣
- **WHEN** propose 阶段完成且所有 applyRequires artifacts 为 `done`
- **THEN** 系统派遣一个 sub agent，在分支上按 `openspec instructions apply` 逐步实现 tasks.md 中的任务

#### Scenario: Verify 阶段派遣
- **WHEN** apply 阶段完成
- **THEN** 系统派遣一个独立的 sub agent 执行代码走查 + TypeScript 检查 + 构建 + 测试

---

### Requirement: 修复循环
系统 SHALL 在 verify 失败时自动修复，最多 3 轮。

#### Scenario: 自动修复
- **WHEN** verify 检测到错误
- **THEN** 系统将错误详情反馈给 apply agent 修复，修复完成后重新执行 verify

#### Scenario: 修复循环耗尽
- **WHEN** 3 轮修复后仍存在验证失败
- **THEN** 系统暂停流水线，展示错误摘要，等待用户决策

---

### Requirement: 自动 Archive
系统 SHALL 在 verify 通过后自动执行 OpenSpec archive。

#### Scenario: Archive 操作
- **WHEN** verify 通过
- **THEN** 系统在主会话中执行 archive 流程（sync delta specs + 移入 archive 目录）

---

### Requirement: 自动 PR 创建与合并
系统 SHALL 在 archive 完成后自动创建 GitHub PR 并 squash merge 到 main。

#### Scenario: Push + PR + Merge
- **WHEN** archive 完成
- **THEN** 系统推送分支到远程，创建 PR（title 复用 Issue 标题 + `(#N)`，body 含 `closes #N`），squash merge 到 main，删除远程分支

#### Scenario: Push 或 Merge 失败
- **WHEN** git push 或 gh pr merge 失败
- **THEN** 系统暂停流水线，展示错误详情，等待用户决策
