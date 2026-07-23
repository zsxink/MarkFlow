---
name: "Codex Prompt"
description: 分析项目代码，自动生成 Codex 优化提示词并保存到 openspec/prompts/
category: Workflow
tags: [workflow, prompts, codex]
---

分析项目当前状态，自动发现问题并生成 Codex 可直接使用的优化提示词。

## 步骤

### 1. 确定分析方向

用 **AskUserQuestion** 询问用户要分析哪个方向：

| 选项 | 内容 |
|------|------|
| full-scan | 全面扫描（所有方向，生成多个提示词文件） |
| spec | Spec 文档质量审查 |
| test | 测试覆盖率缺口分析 |
| error | 错误处理问题扫描 |
| perf | 性能问题分析 |
| rust | Rust 后端代码质量 |
| a11y | 无障碍问题扫描 |
| deps | 依赖与 CI 配置审查 |
| custom | 用户自定义方向（开放式输入） |

### 2. 扫描项目代码

**使用 sub-agent 并行扫描**，每个方向派发独立的 sub-agent：

```
主 agent:
  → Agent("扫描 spec 文档", phase: 'scan')
  → Agent("扫描测试覆盖", phase: 'scan')
  → Agent("扫描错误处理", phase: 'scan')
  → ... 并行
  → 收集所有扫描结果
  → 汇总生成提示词
```

每个 sub-agent 负责一个方向的深度分析：

- **spec 方向**：扫描 `openspec/specs/` 下所有 .md，检查格式一致性、TBD 占位符、碎片化 spec、顶层 spec 重叠
- **test 方向**：对比 `src/**/*.test.ts` 与 `src/**/*.ts`，列出未覆盖的模块，按行数和重要性排序
- **error 方向**：grep bare catch、console.error、unwrap()/expect()、未处理的 Promise rejection
- **perf 方向**：检查 innerHTML 全量替换、大文件同步渲染、事件监听器泄漏、bundle 体积
- **rust 方向**：检查大文件（>300行）、unwrap/expect、clippy warnings、模块拆分机会
- **a11y 方向**：grep ARIA 属性使用，检查 role/aria-*/tabindex 覆盖率
- **deps 方向**：检查未使用依赖、CI 步骤完整性、覆盖率配置

### 3. 生成提示词文件

根据分析结果，按以下模板生成提示词：

```markdown
# MarkFlow {方向名称} — Codex 提示词

## ⚠️ 工作流程要求

**所有代码改动必须遵循 OpenSpec 工作流：**

1. **先创建分支**：从 main 拉新分支，命名 `type/issue-N-英文短横线描述`（issue 号必须来自真实 GitHub Issue）
2. **先 propose 再 apply**：执行 `/opsx:propose` 创建变更提案，再执行 `/opsx:apply` 按 checklist 逐步实施
3. **禁止在 main 上修改代码**：所有改动必须在分支上完成
4. **完成后归档**：任务完成后执行 `/opsx:archive` 归档变更，更新 main specs
5. **提交并推送**：归档后 commit 所有变更，push 到远程分支
6. **创建 PR 合入**：创建 Pull Request，标题格式 `type: 简明中文描述 (#N)`，等待 review 通过后合入 main
7. **提交规范**：commit message 使用 `type: 简明中文描述` 格式，body 中写 `closes #N`

## 项目背景

{项目技术栈和架构简述}

## 当前问题

{扫描发现的具体问题，带文件路径和行号}

## 提示词

```
{Codex 可直接使用的提示词，包含具体文件、行号、修改方案}
```
```

### 4. 保存文件

将生成的提示词保存到 `openspec/prompts/{方向}.md`。如果文件已存在，用 **AskUserQuestion** 询问是覆盖还是追加。

### 5. 更新索引

更新 `openspec/prompts/README.md` 的文件索引表，添加新生成的提示词条目。

### 6. 输出摘要

向用户报告：
- 扫描发现了多少个问题
- 生成的提示词文件路径
- 提示词中包含多少个具体任务
- 建议的执行优先级

## 注意事项

- 提示词必须包含具体文件路径和行号，不能只写泛泛的建议
- 每个任务要有明确的验收标准（运行什么命令确认通过）
- 提示词要足够详细，Codex 无需额外上下文就能执行
- 文件命名使用 kebab-case，与现有文件风格一致
