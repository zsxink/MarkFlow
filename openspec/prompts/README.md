# 自动生成的 Codex 提示词索引

本目录由 `openspec-sync-specs` 管理，每个 `.md` 文件是可直接提交给 Codex 的 goal 提示词。

> **使用流程：** 每个提示词文件头部包含 OpenSpec 工作流要求。
> 将文件内容复制为 Codex goal，Codex 将按提示词中的 checklist 逐步实施。

## 提示词列表

| 文件 | 范围 | 优先级 | 发现问题数 | 包含任务数 |
|------|------|--------|-----------|-----------|
| [m3-completion-review.md](m3-completion-review.md) | Rust Core 代码清理 + Tauri 后端清理 + TypeScript 前端清理 | P0/P1 | ~40 | ~30+ |
| [docs-review.md](docs-review.md) | Stage docs 状态更新 + OpenSpec spec 清理 + 文档一致性检查 | P0/P1 | ~15 | ~25+ |

## 使用方法

1. 创建一个 GitHub Issue 记录整体任务
2. 创建分支 `type/issue-N-短横线描述`
3. 将对应 `.md` 文件的提示词部分作为 Codex goal
4. 按提示词中的 checklist 逐步执行
5. 验收完成后提交 PR 合入 main
