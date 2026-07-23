---
name: "Codex Optimize"
description: 从提示词集中选取优化方向，走完 OpenSpec 全流程（propose → apply → archive → PR）
category: Workflow
tags: [workflow, optimize, openspec]
---

从 `openspec/prompts/` 提示词集中选取一个优化方向，按 OpenSpec 工作流完整执行。

## 步骤

### 1. 选取优化方向

列出 `openspec/prompts/` 下除 README.md 外的所有 .md 文件，用 **AskUserQuestion** 让用户选择要执行的方向：

| 文件 | 内容 |
|------|------|
| spec-review.md | Spec 文档审查与整理 |
| test-coverage.md | 测试覆盖率提升 |
| error-handling.md | 错误处理统一 |
| performance.md | 性能优化 |
| rust-refactor.md | Rust 后端重构 |
| accessibility.md | 无障碍改进 |
| dependency-ci.md | 依赖清理与 CI 增强 |

### 2. 读取提示词

读取用户选择的提示词文件，理解其中的问题描述和具体任务。

### 3. 创建 GitHub Issue

```bash
gh issue create --title "type: 描述" --label "kind" --body "问题说明"
```

记录返回的 issue 号（如 `#40`）。

### 4. 创建分支

从 main 拉新分支，命名格式 `type/issue-N-英文短横线描述`：

```bash
git checkout -b type/issue-N-slug main
```

### 5. 执行 OpenSpec 流程

按提示词中的任务逐步执行：

```bash
# 创建变更提案
/opsx:propose <change-name>

# 按 checklist 实施
/opsx:apply

# 实施完成后归档
/opsx:archive
```

### 5.1 使用 Sub-Agent 开发与验证

**⚠️ 核心原则：主 agent 负责调度，sub-agent 负责干活和验收。**

#### 开发阶段 — 用 sub-agent 实施

- 提示词中的每个独立 task，派发给一个 sub-agent 执行
- sub-agent 拿到任务后独立完成代码修改，完成后向主 agent 返回结果
- 多个独立 task 的 sub-agent **并行运行**（使用 Agent 工具同时发起）
- 每个 sub-agent 只负责一个明确的子任务，不要让一个 sub-agent 做太多事

示例调度：
```
主 agent:
  → Agent(task-A, isolation: worktree)  # 并行
  → Agent(task-B, isolation: worktree)  # 并行
  → 等待两个都完成
  → 合并结果
```

#### 验证阶段 — 用 sub-agent 复核

每个 task 完成后，**必须**派发独立的验证 sub-agent：

1. **正确性验证**：读取修改后的代码，检查逻辑是否正确、是否符合项目规范
2. **测试验证**：运行 `npm test` / `cargo test` / `cargo clippy` 确认通过
3. **一致性验证**：检查修改是否与项目其他部分冲突（import 路径、类型签名、API 契约）

验证 sub-agent 的 prompt 模板：
```
审查 {sub-agent名} 刚刚完成的代码修改：
1. 读取所有被修改的文件，检查逻辑正确性
2. 确认符合项目 CLAUDE.md 中的规范（提交格式、分支命名、代码风格）
3. 运行相关测试确认无回归
4. 如果发现问题，列出具体文件和行号
5. 输出 PASS 或 FAIL + 原因
```

**如果验证 FAIL**：将问题反馈给原 sub-agent 修复，修复后再次验证，直到 PASS。

### 6. 提交并推送

```bash
git add -A
git commit -m "type: 简明中文描述

closes #N"
git push -u origin type/issue-N-slug
```

### 7. 创建 PR 并合入

```bash
gh pr create --title "type: 简明中文描述 (#N)" --body "closes #N"
```

等待 CI 通过、review 通过后合入 main。

## 注意事项

- **禁止在 main 上修改代码**：所有改动必须在分支上完成
- **提交规范**：commit message 使用 `type: 简明中文描述` 格式
- **type 可选**：feat / fix / refactor / chore / ci / docs / test / perf / style
- **每个提示词可能包含多个 sub-task**：可以拆分为多个 commit，每个 sub-task 一个 commit
- 如果提示词中要求运行测试，确保在 commit 前所有测试通过
