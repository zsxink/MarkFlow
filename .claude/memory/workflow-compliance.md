---
name: workflow-compliance
description: 必须遵守分支/PR/commit 规范，不能直接改 main
metadata:
  type: feedback
---

Issue #12 的 Homebrew 功能实现时，我直接在 main 上修改并推送，跳过了「拉分支 → PR → 合并」的流程，尽管 `.claude/rules/git-commit.md` 就在上下文里。

**Why:** 惯性思维——把任务当「直接干活」而非「按流程执行」。默认自己记得的流程就是对的，没有停下来查规则再动手。

**How to apply:** 接到任务后、动手前，先查三条：
1. 项目规则（CLAUDE.md、.claude/rules/）有没有规定这个步骤怎么做
2. 当前改动该走什么分支流程
3. 完成方式是直接推还是 PR

**关键流程（不可跳过）：** 任何改动前，必须先完成：
1. **创建 GitHub Issue**（`gh issue create`），获取 issue 编号 N
2. **拉分支**：`git checkout -b type/issue-N-slug main`
3. 然后才能开始修改代码

禁止在 `main` 上直接修改代码（`.claude/rules/branch-first.md`）。

**commit message 注意**：仅当 commit 确实解决了该 issue 时才用 `closes #N`（关闭效果在推送到 main 时生效）。设计文档、关联引用等应使用 `关联 #N` 或 `refs #N`。

分支名格式：`type/issue-N-简短描述`（例如 `feat/issue-12-homebrew-install`），参见 `.claude/rules/git-commit.md`。

**openspec 归档必须提交**：`/opsx:archive` 会把 `openspec/changes/<name>/` 移到 `openspec/changes/archive/YYYY-MM-DD-<name>/`，这些文件是 change 的完整记录（proposal/design/specs/tasks），属于交付物，必须提交到 git。归档完成后立即检查 `git status`，如有未提交的归档文件，创建分支、提交、PR、合并。
