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

**关键流程（不可跳过）：** 执行 `/opsx:propose` 或 `/opsx:apply` 前，必须先完成：
1. **创建 GitHub Issue**（`gh issue create`），获取 issue 编号 N
2. **拉分支**：`git checkout -b type/issue-N-slug main`
3. 然后才能开始修改代码
禁止在 `main` 上直接修改代码。这条写在 `.claude/rules/branch-first.md` 里。

分支名格式：`type/issue-N-简短描述`（例如 `feat/issue-12-homebrew-install`），参见 `.claude/rules/git-commit.md`。
