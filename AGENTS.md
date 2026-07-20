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

## 分支命名

- Issue 处理第一步：创建 GitHub Issue 获取 issue 号
  - `gh issue create --title "type: 描述" --label "kind" --body "问题/需求说明"`
  - 记录返回的 issue 号（如 `#40`）
- 从 `main` 拉新分支，issue 号必须来自真实 issue
  - `git checkout -b type/issue-N-slug main`
- 禁止在 `main` 上修改代码：所有代码改动、`/opsx:propose`、`/opsx:apply` 都必须在分支上完成
- 仅修改 spec 文档本身（如 development-flow.md）可在 main 上操作，但仍需 PR 合入
- 分支命名：`type/issue-N-英文短横线描述`（如 `fix/issue-10-image-paste-filename`）

## Git 提交信息

### 格式

```
type: 简明中文描述

closes #N
```

- type 使用英文：`feat`, `fix`, `refactor`, `chore`, `ci`, `docs`, `test`, `perf`, `style`
- 描述使用中文，简洁说明改了什么和为什么
- 多个相关改动用 `+` 连接：`fix: 问题A + 问题B`
- 关联 issue 时在 body 中写 `closes #N`（可关联多个）
- 有 PR 号时附在标题末尾：`fix: 描述 (#4)`
- 不写英文描述，统一用中文
- 不加 scope 括号（如 `fix(editor):`），直接 `fix:`
- 一行写完，不写 body，除非变更特别复杂

### type 选择

| type | 用于 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改功能） |
| `chore` | 版本号、依赖、配置等杂务 |
| `ci` | CI/CD 流程 |
| `docs` | 文档 |
| `test` | 测试 |
| `perf` | 性能优化 |
| `style` | 代码格式（不影响逻辑） |

## OpenSpec 工作流

本项目的 spec 使用 OpenSpec 管理，所有规范文档在 `openspec/specs/`：

- `/opsx:explore` — 头脑风暴，探索方案后再动手
- `/opsx:propose <idea>` — 创建变更提案（生成 proposal/specs/design/tasks）
- `/opsx:apply` — 按 checklist 逐步实施
- `/opsx:archive` — 归档已完成变更，更新 main specs
- **先分支，再 SDD**：执行 `/opsx:propose` 或 `/opsx:apply` 前，必须先创建分支

CLI：`openspec new change <name>`、`openspec validate <change>`、`openspec archive <change>`

### 强制规则（不可省略）

1. **归档前必须先同步 spec**：执行 `/opsx:archive`（或 `openspec archive`）时，若 change 含 delta spec（`openspec/changes/<name>/specs/**`），**先**将增量规范合并到 `openspec/specs/` 主规范（`openspec-sync-specs`），**再**移动 change 目录到 `archive/`。禁止「只搬目录、不同步主规范」。

2. **合入 / 归档前必须派独立 agent 复核**：在 merge PR 或 archive 之前，**派出一个独立的 sub-agent** 做一轮不偏不倚的复核与验证（静态走查 + 跑测试 `npm test` / `npx tsc --noEmit`），再执行 merge/archive。主执行流容易漏掉复核，必须显式交给独立 agent 完成并回读结论。

## 调试规则

- **先查运行日志再改代码**：日志目录由 `app_config_dir().join("logs")` 动态决定（启动时打印 `log_dir=`），各平台默认位置见下表
- 布局/样式问题先检查 CSS
- 踩坑记录见 `.claude/memory/MEMORY.md`
