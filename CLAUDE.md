# MarkFlow

Tauri v2 (Rust) + TypeScript + Vite 桌面 Markdown 编辑器。
编辑器引擎：ProseMirror (WYSIWYG) + CodeMirror (源码模式)。

## 构建与测试

```bash
npm run dev          # Vite 开发服务器
npm run build        # tsc + vite build
npm test             # vitest run
npm run tauri dev    # Tauri 桌面开发
npm run tauri build  # 生产构建
```

## OpenSpec 工作流

本项目的 spec 使用 OpenSpec 管理，所有规范文档在 `openspec/specs/`：

- `/opsx:explore` — 头脑风暴，探索方案后再动手
- `/opsx:propose <idea>` — 创建变更提案（生成 proposal/specs/design/tasks）
- `/opsx:apply` — 按 checklist 逐步实施
- `/opsx:archive` — 归档已完成变更，更新 main specs
- **[重要] 先分支，再 SDD**：执行 `/opsx:propose` 或 `/opsx:apply` 前，必须先创建分支（`git checkout -b type/issue-N-slug main`），禁止在 `main` 上直接修改代码（见 `.claude/rules/branch-first.md`）

CLI：`openspec new change <name>`、`openspec validate <change>`、`openspec archive <change>`

## 调试规则

- **先查运行日志再改代码**：`C:/Users/xian/AppData/Roaming/MarkFlow/logs`
- 布局/样式问题先检查 CSS
- 踩坑记录见 `.claude/memory/`
