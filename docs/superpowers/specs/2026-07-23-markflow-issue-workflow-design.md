# MarkFlow Issue 自动工作流命令设计

> 版本：1.0.0 ｜ 状态：已发布 ｜ 更新日期：2026-07-23
> 
> 为 MarkFlow 新增一个 `/markflow-issue <issue号>` 命令，一键完成从 GitHub Issue 到 PR merge 的端到端自动化流程。

---

## 1. 动机

当前 MarkFlow 的开发流程（development-flow.md）定义了完整的 SDD + GitHub 协作流程：

```
Issue → branch → propose → apply → review → archive → PR → merge
```

但用户需要手动依次执行多个命令 (`/opsx:propose` → `/opsx:apply` → 自审 → `/opsx:archive` → `gh pr create`)。这个命令将整个流程封装为单一入口，按需分派 sub agent 处理沉重环节，出错时自动修复优先。

---

## 2. 整体架构

### 2.1 流水线总览

```
┌──────────────────────────────────────────────────────────────┐
│      /markflow-issue <N>  —  主会话依次编排                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ① Fetch Issue                  gh issue view N --json       │
│     → 解析 title / labels / body                              │
│                                                              │
│  ② Create Branch               git checkout -b branch main   │
│                                                              │
│  ③ Propose                     openspec new change + artifacts│
│     → 主会话生成 proposal / design / specs / tasks            │
│                                                              │
│  ④ Apply ── Sub Agent ──      实现 tasks.md checklist         │
│     → 按 openspec instructions apply 逐步实施                  │
│                                                              │
│  ⑤ Verify ── Sub Agent ──     code review + build + test     │
│     → git diff / tsc / npm run build / npm test               │
│     ↓ 失败 → ④ 修复循环 (max 3 rounds)                       │
│     ↓ 通过 → 继续                                             │
│                                                              │
│  ⑥ Archive                    openspec archive                │
│     → sync specs + 移入 archive 目录                           │
│                                                              │
│  ⑦ Push + PR                  gh pr create + merge --squash  │
│     → 推送到远程 → 创建 PR → squash merge 到 main → 删除分支  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 执行模型

| 环节 | 执行者 | 说明 |
|------|--------|------|
| ① Fetch Issue | 主会话 | 轻量数据拉取 |
| ② Create Branch | 主会话 | 轻量 git 操作 |
| ③ Propose | 主会话 | 需要读取代码库写 design，主会话更适合 |
| ④ Apply | Sub Agent | 沉重编码工作，隔离执行 |
| ⑤ Verify | Sub Agent | 独立的审查视角，与 apply 隔离 |
| ⑥ Archive | 主会话 | 轻量文件操作 + spec 同步 |
| ⑦ PR + Merge | 主会话 | 轻量 gh cli 操作 |

### 2.3 故障处理策略

- **Apply 内部错误**：Sub Agent 自行尝试修复后继续，完全阻塞时报告中止
- **Verify 失败**：失败详情反馈给 Apply Agent 修复 → 重新 Verify，最多 3 轮
- **修复循环耗尽**：暂停流程，展示错误摘要，等待用户决策（继续 / 中止 / 手动介入）
- **异常分支**（已有分支、已有 change）：检测后提示用户，不自动覆盖

---

## 3. 命令定义

### 3.1 文件位置

`.claude/commands/markflow-issue`

> 注意：`opsx` 系列命令使用目录结构（`.claude/commands/opsx/apply.md` 等），但本命令是单一入口，直接用文件即可。如果未来需要拆分多个子命令再改为目录。

### 3.2 Frontmatter

```yaml
---
name: "markflow-issue"
description: "End-to-end issue workflow: branch → propose → apply → verify → archive → PR → merge"
category: Workflow
tags: [workflow, automation, experimental]
---
```

### 3.3 输入

```
/markflow-issue <issue号>
```

- `<issue号>`：GitHub Issue 数字编号（如 `42`）
- 验证：必须是正整数

---

## 4. 各阶段详细设计

### 4.1 阶段 ① — Fetch Issue

**目标**：从 GitHub 拉取 Issue 数据，推导分支名、change name、type。

**命令**：
```bash
gh issue view <N> --json title,body,labels
```

**输出**：
```json
{
  "title": "fix: 行号显示不准确",
  "body": "背景：当前行号计算...\n验收标准...",
  "labels": [{ "name": "bug" }]
}
```

**参数推导**：

| 参数 | 推导逻辑 |
|------|----------|
| `type` | 从 labels 匹配：`bug`→`fix`, `feat`→`feat`, `refactor`→`refactor`, `chore`→`chore`, `docs`→`docs`, `perf`→`perf`；默认 `chore` |
| `changeName` | 从 title 截取：去掉 `<type>:` 前缀 → kebab-case → 最大 40 字符 |
| `branchName` | `{type}/issue-{N}-{kebab-title}` |

**kebab-case 转换规则**：
- 中文 → 拼音或英文短语（从 title 提取关键词）
- 非字母数字和横线 → 横线
- 连续的横线 → 单横线
- 去掉首尾横线

**示例**：`"fix: 行号显示不准确"` → `changeName="fix-line-number"`, `branchName="fix/issue-42-line-number"`

**前置检查**：
- 确认 `git status --porcelain` 为空，否则提示先提交或 stash 本地修改
- 确认 `main` 已 `git pull`（如有远程冲突，暂停处理）

---

### 4.2 阶段 ② — Create Branch

**目标**：创建 feature 分支。

```bash
git checkout main && git pull
# 如果分支已存在，询问复用还是跳过
git checkout -b <branchName> main
```

---

### 4.3 阶段 ③ — Propose

**目标**：创建 OpenSpec change 并生成所有 artifacts。

**步骤**：
1. `openspec new change "<changeName>"`（如果已存在则提示复用/重命名）
2. 按 `openspec status` 的 artifact 依赖顺序依次生成：
   - **proposal.md**：基于 Issue title（作为动机）和 body（作为背景和验收标准）
   - **specs/.../spec.md**：增量规范（从 body 中的验收标准推导需求）
   - **design.md**：读取代码库理解架构后写技术设计
   - **tasks.md**：从 proposal/specs/design 生成实施 checklist
3. **校验**：确认所有 `applyRequires` artifacts 状态为 `done`

**注意**：此阶段在主会话中执行，因为 design 写得好需要我对代码库的理解。

---

### 4.4 阶段 ④ — Apply（Sub Agent）

**目标**：由独立 sub agent 实现 tasks.md 中的所有任务。

**派遣上下文**：
- change name, change root 路径
- tasks.md 内容（checklist）
- 分支名称
- 已完成的 artifacts 路径（供参考的 proposal/design/specs）
- 指令：按 `openspec instructions apply` 输出逐步实施
- 遵循现有的 `openspec-apply-change` skill

**Sub Agent 回复协议**（必须包含）：
```
## Apply Result
- Tasks completed: N/M
- Summary:
  - task 1: ✓ <简述>
  - task 2: ✓ <简述>
  - task N: ⚠️ <阻塞原因>（如有）
- Blocked: yes/no
- Block reason: <如阻塞>
```

---

### 4.5 阶段 ⑤ — Verify（Sub Agent）

**目标**：独立的审查和功能验证。

**派遣上下文**：
- Change 后的所有文件（`git diff origin/main`）
- 分支名称
- 指令：执行以下检查并报告结果

**检查项**：

| 检查 | 命令 | 修复指引 |
|------|------|----------|
| 代码走查 | `git diff origin/main --stat` + 关键文件变动 | 提代码问题 |
| TypeScript | `npx tsc --noEmit` | 修复类型错误 |
| 构建 | `npm run build` | 修复构建错误 |
| 测试 | `npm test` | 修复测试失败（先看失败原因再改） |

**Sub Agent 回复协议**：

```json
{
  "passed": true | false,
  "checks": {
    "code_review": { "status": "pass"|"fail", "issues": ["..."] },
    "typescript":  { "status": "pass"|"fail", "output": "..." },
    "build":       { "status": "pass"|"fail", "output": "..." },
    "test":        { "status": "pass"|"fail", "output": "..." }
  },
  "summary": "..."  // 一句话结论
}
```

---

### 4.6 修复循环

**条件**：Verify 阶段 `passed === false` 且还有重试次数。

**流程**：
1. 主会话读取 Verify 的失败详情
2. 向 Apply Agent 发送修复指令（包含失败详情和日志）
3. Apply Agent 修复代码
4. 再次运行 Verify Agent
5. 最多 3 轮

**3 轮后仍未通过**：暂停流程，向用户展示：
```
## 修复循环耗尽

经过 3 轮修复仍未通过验证：

- TypeScript: <错误摘要>
- Build: <错误摘要>
- Test: <错误摘要>

请决定：
1. 手动介入修复后继续
2. 中止流程（分支和变更保留）
3. 忽略验证强制继续
```

---

### 4.7 阶段 ⑥ — Archive

**目标**：归档已完成 change。

**流程**（与 `openspec-archive-change` skill 一致）：
1. `openspec status --change "<changeName>" --json` 获取状态
2. 如有 delta specs，先执行 `openspec sync-specs` 同步到主 spec
3. 将 change 目录移入 `openspec/changes/archive/`

---

### 4.8 阶段 ⑦ — Push + PR + Merge

**目标**：推送到远程、创建 PR、自动 squash merge。

```bash
# 1. Push
git push origin <branchName>

# 2. PR
gh pr create \
  --title "<type>: <title> (#N)" \
  --body "closes #N" \
  --base main \
  --label "<label-name>"

# 3. Merge
gh pr merge <branchName> --squash --delete-branch
```

**PR 标题**：复用 Issue 标题，追加 `(#N)`。
**PR body**：至少包含 `closes #N`。

---

## 5. 错误与边界情况处理

| 情况 | 处理方式 |
|------|----------|
| Issue 不存在 | 报错并停止 |
| 工作目录有未提交修改 | 提示先 commit 或 stash，不自动操作 |
| 分支已存在 | 询问复用还是创建新分支（加 `-retry-N` 后缀） |
| change 已存在 | 询问复用还是换个 name |
| main 已 ahead/behind remote | 先 pull，冲突则暂停 |
| gh 未认证 | 提示运行 `gh auth login`，暂停 |
| push 被拒（远程冲突） | 提示手动处理，暂停 |
| PR merge 冲突 | 提示手动解决，暂停 |

---

## 6. 输出格式

每个阶段结束时输出简短的状态行。流程结束时输出完整摘要：

```
## ✅ Issue #42 处理完成

**Issue**: fix: 行号显示不准确
**Branch**: fix/issue-42-line-number
**Change**: fix-line-number
**PR**: #<pr-number> (squash merged → main)

### 流程摘要
- [x] Fetch Issue
- [x] Create Branch
- [x] Propose (4 artifacts)
- [x] Apply (6/6 tasks)
- [x] Verify (review ✓, tsc ✓, build ✓, test ✓)
- [x] Archive
- [x] Push + PR + Merge

**耗时**: <N> 轮对话
```

---

## 7. 未涵盖的需求 / 未来扩展

- 暂不支持 store 模式（`openspec store list --store <id>`）
- 暂不支持多个 Issue 并行处理
- 暂不支持详细的 Release Notes 自动生成（gh release create）
