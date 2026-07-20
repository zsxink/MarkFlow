# MarkFlow 开发流程规范

> 版本：1.1.0 ｜ 状态：已发布 ｜ 更新日期：2026-07-04
> 融合 Spec-Driven Development (SDD) 与 GitHub 协作流程

---

## 1. 流程总览

MarkFlow 的端到端开发流程：

```
GitHub Issue (#N)
    → git branch (type/#N-slug)
    → SDD: /opsx:propose → /opsx:apply
    → git commit + push
    → GitHub PR (closes #N)
    → PR Review (self-review + CI)
    → Squash merge to main
    → SDD: /opsx:archive
    → Tag release (v* → CI build + release)
```

### SDD 概念 ↔ GitHub 概念映射

| SDD 概念 | GitHub 映射 | 说明 |
|----------|-------------|------|
| Issue | GitHub Issue (#N) | 需求入口，驱动变更 |
| change 目录 | feature 分支 | `openspec/changes/<name>/` |
| proposal/specs/design/tasks | PR 描述素材 | 审查者可读的上下文 |
| delta specs → main specs | merge diff | squash merge 时同步 |
| archive | 合入后归档 | 审计记录 |

---

## 2. Issue 规范

### 2.1 Issue 类型与 Label

| Label | 颜色 | 用途 | 对应 type |
|-------|------|------|-----------|
| `feat` | 🟢 green | 新功能 | `feat` |
| `bug` | 🔴 red | 缺陷修复 | `fix` |
| `chore` | 🟡 yellow | 依赖、配置、重构、文档 | `chore` |
| `refactor` | 🔵 blue | 代码重构（不改功能） | `refactor` |
| `docs` | ⚪ gray | 文档相关 | `docs` |
| `perf` | 🟣 purple | 性能优化 | `perf` |

### 2.2 Issue 描述要求

Issue 描述应包含：

- **标题**：`<type>: <简短中文描述>`
- **背景**：为什么需要这个变更
- **目标**：期望达成的结果
- **验收标准**：可验证的条件列表

### 2.3 Issue Template

详见 `.github/ISSUE_TEMPLATE/` 目录中的模板文件。

---

## 3. 分支规范

### 3.1 分支命名

```
<type>/<#issue>-<英文短横线描述>
```

示例：`feat/#42-image-export`、`fix/#12-line-number-bug`、`chore/#15-spec-update`

### 3.2 分支生命周期

1. 从 `main` 创建
2. 在分支上完成 SDD 循环和编码
3. 合并到 `main` 后删除分支

### 3.3 硬性规则：先分支，再编码

> **禁止在 `main` 分支上直接执行 `propose` 或 `apply`。**

1. **Issue → 分支**：收到 Issue 或开始任何变更前，第一步必须从 `main` 创建新分支
2. **分支之后才提议**：在分支上执行 `/opsx:propose`，不允许在 `main` 上创建 change 目录
3. **分支之后才编码**：在分支上执行 `/opsx:apply`，代码改动必须发生在分支上
4. **验证**：执行 `git branch --show-current` 确认不在 `main` 上

**例外**：仅修改 spec 文档本身（如更新 development-flow.md）可在 `main` 上直接操作，但后续仍需通过 PR 合入。

---

## 4. SDD 开发循环

> **前置条件：已在 feature 分支上（`git checkout -b <type>/<#issue>-<描述> main`）**

在 feature 分支上执行：

### 4.1 Propose

```bash
/opsx:propose <change-name>
```

生成四个工件：

| 工件 | 内容 | 依赖 |
|------|------|------|
| `proposal.md` | 变更动机、范围、影响 | - |
| `specs/<capability>/spec.md` | 增量规范（ADDED/MODIFIED/REMOVED） | proposal |
| `design.md` | 技术设计、决策、风险 | proposal |
| `tasks.md` | 实施 checklist | specs + design |

### 4.2 Apply

```bash
/opsx:apply
```

按 tasks.md 的 checklist 逐步实施。可以分多次会话完成，下次 `apply` 自动恢复。

### 4.3 Apply 中的规范

- **单次提交原则**：按逻辑分组提交，不强制一个 task 一个 commit
- **提交消息**：遵循 `.claude/rules/git-commit.md` 规范
- **测试优先**：修复 bug 应先写测试再修代码

### 4.4 Archive

在 PR 合并到 main 后执行：

```bash
/opsx:archive
```

将 change 目录移至 `openspec/changes/archive/`，增量 spec 合并到 main specs。

> **强制**：archive 若含 delta spec，**先** `openspec-sync-specs` 合并到主规范，**再**移动目录。禁止「只搬目录不同步」。
> **强制**：archive 前必须先派独立 agent 完成复核（见 §6.2）。

---

## 5. 提交规范

参见 `.claude/rules/git-commit.md`。核心规则：

- **格式**：`<type>: <中文描述>`
- **type**：`feat` | `fix` | `refactor` | `chore` | `ci` | `docs` | `test` | `perf` | `style`
- **关联 issue**：正文写 `closes #N`（可多个：`closes #12, closes #13`）
- **一行标题**，不写 body 除非变更特别复杂

### PR Squash Commit 消息

Squash merge 时，commit message 应：

```
<type>: <中文描述> (#PR)

closes #N
```

如果 PR 包含多个逻辑变更，用 `+` 连接：`fix: 问题A + 问题B (#5)`

---

## 6. PR 规范

### 6.1 PR 模板

详见 `.github/PULL_REQUEST_TEMPLATE.md`。

### 6.2 PR Checklist（自审）

合并前确认：

- [ ] Issue 编号已关联（PR 标题或 body 中）
- [ ] 分支已推送到远程
- [ ] 变更已自测（手动运行验证）
- [ ] 构建通过（`npm run build`）
- [ ] 测试通过（`npm test`）
- [ ] 独立 agent 复核完成（见下方「强制复核」）
- [ ] 提交消息遵循规范（squash 后）
- [ ] 无死代码、无调试日志、无意外文件变更

> **强制复核（不可省略）**：merge PR 或 archive 之前，必须**派出一个独立的 sub-agent** 做不偏不倚的复核与验证（静态走查 + 跑 `npm test` / `npx tsc --noEmit`），主执行流不可自我豁免。复核结论需回读确认后再 merge/archive。

### 6.3 Review 规则

- 重大项目变更需要至少 1 人 review
- bug fix 和 chore 可以自审后合并
- reviewer 关注：逻辑正确性、边界情况、安全、性能

---

## 7. 合并规范

- **策略**：Squash merge（保持 main 历史整洁）
- **关联 Issue**：squash commit 必须包含 `closes #N`
- **删除分支**：merge 后自动删除远程分支

---

## 8. 发布规范

### 8.1 版本号

遵循 SemVer（语义化版本）：

| 版本 | 说明 |
|------|------|
| `major` | 不兼容的 API 或架构变更 |
| `minor` | 新功能（向下兼容） |
| `patch` | Bug 修复（向下兼容） |

当前版本：`0.0.4`（v1 前的开发版本，minor 表示新功能）

### 8.2 发布流程

1. 确认 main 上的所有变更已归档（`/opsx:archive`）
2. 打 tag：`git tag v<版本号>`
3. 推送 tag：`git push origin v<版本号>`
4. GitHub Actions 自动构建 + 创建 draft release（详见 `.github/workflows/release.yml`）

### 8.3 Release Notes

GitHub Release 自动生成（`generate_release_notes: true`），手动补充：

- 简明描述本次发布的主要变更
- 列出所有 closed issues

---

## 9. 完整流程示例

**场景**：修复行号显示 bug（issue #12）

```
1. 创建 Issue #12：「fix: 行号显示不准确」
   - 标题：fix: 行号显示不准确
   - 背景：markflow/src/lib/editor.ts 中 getLineCount() 实现...

2. 创建分支：fix/#12-line-number-bug

3. SDD 循环：
   $ /opsx:propose fix-line-number
   → openspec/changes/fix-line-number/{proposal,specs,design,tasks}
   $ /opsx:apply → 修复代码

4. 提交 + 推送：
   $ git add -A && git commit -m "fix: 行号显示不准确"
   $ git push -u origin fix/#12-line-number-bug

5. 创建 PR (#XX)：「fix: 行号显示不准确」
   - 关联 Issue #12
   - 自审 checklist 全部通过

6. Squash merge → main
   - commit message: "fix: 行号显示不准确 (#XX)\n\ncloses #12"

7. 归档：
   $ /opsx:archive
   → openspec/changes/archive/2026-07-02-fix-line-number/

8. 发布（可选）：
   $ git tag v0.0.5 && git push origin v0.0.5
```

---

## 10. 附录

### 10.1 相关文档

| 文档 | 位置 |
|------|------|
| 提交规范 | `.claude/rules/git-commit.md` |
| GitHub Issue 模板 | `.github/ISSUE_TEMPLATE/` |
| GitHub PR 模板 | `.github/PULL_REQUEST_TEMPLATE.md` |
| 发布工作流 | `.github/workflows/release.yml` |

### 10.2 流程速查

```bash
# 1. 创建分支
git checkout -b type/#N-slug main

# 2. SDD 提案
/opsx:propose change-name

# 3. SDD 实施
/opsx:apply

# 4. 提交
git add -A
git commit -m "type: 描述"
git push -u origin type/#N-slug

# 5. 创建 PR（GitHub 界面）

# 6. Squash merge（GitHub 界面）

# 7. 切回 main 后归档
git checkout main && git pull
/opsx:archive

# 8. 发布
git tag v0.0.x && git push origin v0.0.x
```
