## Context

MarkFlow 使用 Claude Code 作为开发助手，现有 `.claude/commands/opsx/` 系列命令（propose、apply、archive、explore、sync）覆盖了 SDD 开发循环的各个阶段。当前端到端流程需要手动依次调用多个命令。

一个 `/markflow-issue <issue号>` 命令将 7 个阶段（fetch issue → branch → propose → apply → verify → archive → PR merge）封装为单一入口。主要复杂在于：apply（编码）和 verify（审查验证）是沉重环节，需要在主会话之外通过 sub agent 隔离执行；verify 失败后的修复循环需要状态管理。

### 现有可复用资源

- `.claude/commands/opsx/propose.md` — propose 阶段的实现步骤
- `.claude/commands/opsx/apply.md` — apply 阶段的实现步骤
- `.claude/commands/opsx/archive.md` — archive 阶段的实现步骤
- `.claude/skills/openspec-apply-change/SKILL.md` — apply sub agent 的派遣指令
- `.claude/skills/openspec-archive-change/SKILL.md` — archive sub agent 的派遣指令
- `gh` CLI — GitHub API 客户端（已验证可用）
- OpenSpec CLI — 规范开发工具（已验证可用）

## Goals / Non-Goals

**Goals:**

- 一个命令文件自包含所有 7 阶段编排逻辑
- Sub agent 隔离执行沉重环节（apply、verify）
- 自动修复循环最多 3 轮
- 输出的执行过程对用户可见（每个阶段状态行）
- 错误时暂停等待用户决策

**Non-Goals:**

- 不修改现有 opsx 命令文件内容（markflow-issue 引用而不是复刻它们）
- 不支持多个 Issue 并行处理
- 不支持 store 模式
- 不修改 TypeScript/Rust 生产代码

## Decisions

### 1. 文件格式：单文件 Markdown Command

沿用 `.claude/commands/opsx/` 系列的 YAML frontmatter + Markdown body 格式。单文件足够容纳流程编排说明，不需要拆分为目录结构。

### 2. Sub Agent 派遣方式

使用 `Agent` 工具（`general-purpose` 类型）派遣 apply 和 verify sub agent：

- **Apply Agent**：在创建的分支上，按 `openspec instructions apply` 输出逐步实现 tasks.md。遵循 `openspec-apply-change` skill 定义的步骤。
- **Verify Agent**：执行 `git diff origin/main` 走查 + `npx tsc --noEmit` + `npm run build` + `npm test`。
- 两个 agent **串行执行**：apply 完成后才启动 verify（因为 verify 需要检查 apply 的结果）。
- 修复循环：主会话读取 verify 失败日志，再派遣 apply agent 去修复，然后重新 verify。

### 3. 参数推导逻辑

从 GitHub Issue 的 labels 数组匹配 type：

| Label | type |
|-------|------|
| `bug` | `fix` |
| `feat` | `feat` |
| `refactor` | `refactor` |
| `chore` | `chore` |
| `docs` | `docs` |
| `perf` | `perf` |
| 无匹配 | `chore` |

change name 从 title 的 `<type>: ` 前缀后截取，kebab-case 化，最长 40 字符。

### 4. 分支已存在的处理

`git checkout -b` 失败时，错误消息会提示分支已存在。此时暂停询问用户：复用已有分支（`git checkout <branch>`）还是创建新分支（用 `-retry-N` 后缀）。

### 5. Propose 阶段内嵌执行

propose 阶段直接在主会话中执行（因为写 design 需要读代码库理解架构），不派遣 sub agent。参照 `opsx:propose` skill 的步骤手动执行。

### 6. 远程认证与权限

- `gh` 需已认证（`gh auth status` 检查），否则暂停提示登录
- Push 到远程需要写权限——push 失败时暂停提示

## Risks / Trade-offs

- **[Sub Agent 上下文限制]** Apply 或 Verify sub agent 可能因任务过大而中途耗尽上下文 → 拆分成多个较小的派遣，每个完成一部分 task
- **[修复循环死锁]** 某些问题（如设计缺陷）不是修补代码能解决的，3 轮自动修复后会无限重试 → 3 轮后强制暂停，不等自动修复
- **[命令文件膨胀]** 7 阶段编排在一个文件中可能导致 400+ 行 → 保持阶段描述简洁，原子操作指向 skill diff（如 `遵循 openspec-apply-change skill`），不重复 skill 内容
- **[git merge 冲突]** `gh pr merge --squash` 可能在 main 有并行变更时失败 → 失败后暂停，提示手动解决冲突
