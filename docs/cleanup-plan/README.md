# MarkFlow 代码清理与重构方案

> 分析日期：2026-08-31
> 范围：全仓库（前端 TS、Rust 后端、docs、openspec、构建产物、依赖）
> 状态：方案草案，供 review 后按 issue/branch 流程逐个落地

本目录是 MarkFlow 全仓库「清理 + 重构 + 代码规范」的总入口。目标：
- **清掉**已过期/失效/无用/重复的文档、代码、产物、依赖
- **重构**单文件超行（>500~900 行）与存在严重耦合/重复的模块
- **补**一套全仓库统一的代码规范（文件行数、命名、错误处理、分层等）

> 强制流程提醒：任何代码改动必须先 `gh issue create` 拿 issue 号、拉分支，禁止直接在 main 上改（见 `AGENTS.md` / `CLAUDE.md`）。本方案仅输出建议，落地时逐条开 issue。

---

## 目录

| 文档 | 内容 |
|------|------|
| [`analysis.md`](./analysis.md) | 全量盘点：哪些文档/代码过期失效、哪些要清理、哪些要重构（附 file:line 证据） |
| [`code-standards.md`](./code-standards.md) | 新增的代码规范：文件行数、分层、命名、错误处理、安全、去重、提交 |
| [`priority.md`](./priority.md) | 按「收益/成本」排出的落地优先级与建议 issue 拆解 |

---

## 一句话结论

1. **文档层**：`docs/markflow-core-stages/`（M0–M8 大重构方案）已在 `docs/next-phase-roadmap.md` 中被明确「关闭并放弃」，但自身仍写着「方案已校准，待实施」——**已过期、具误导性**，应标记废弃或归档。另有两份过期性能基线（bundle/file-tree）与一份 git 跟踪的重复 openspec change。
2. **代码层**：7 个 TS 文件 >400 行、4 个 Rust 文件 >600 行；存在多处逐字重复（mermaid/plantuml 右键菜单族 ~95% 相同、`blobToBase64` ×4、`normalize_lexical` ×2、原子写 ×5）与真循环依赖（`sidebar.fileops ↔ sidebar.conflict`）。
3. **规范层**：目前 `AGENTS.md` / `CLAUDE.md` 只规范了 git 流程，**没有代码级规范**（行数、分层、命名、错误处理）。需新增 `code-standards.md`。
