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
   - **归档后验证**：同步并归档后，运行 `npx openspec validate --all` 与 `bash scripts/check-archive-synced.sh`，确认主规范合法且 delta 已落地（CI 同款 gate）。

2. **合入 / 归档前必须派独立 agent 复核**：在 merge PR 或 archive 之前，**派出一个独立的 sub-agent** 做一轮不偏不倚的复核与验证（静态走查 + 跑测试 `npm test` / `npx tsc --noEmit`），再执行 merge/archive。主执行流容易漏掉复核，必须显式交给独立 agent 完成并回读结论。

## 新增代码自检清单

新增或搬迁代码前对照 [`openspec/specs/source-layering/spec.md`](openspec/specs/source-layering/spec.md)
与 [`openspec/specs/code-standards/spec.md`](openspec/specs/code-standards/spec.md)，逐项确认：

- **分层落点**：文件属于 `types` / `utils` / `infra` / `editor`·`render`·`export` / `ui` / `main` 哪一层？依赖只能指向左侧：`types ← utils ← infra ← editor/render/export ← ui ← main`。
- **不反向依赖**：`infra`/`utils`/`types` 不得 import `ui`；`editor`/`render`/`export` 需要用户可见能力（提示、对话框、右键菜单、面板刷新、降级条）时走 `src/infra/ui-ports.ts` 的注入端口，不得 import `ui`。
- **只经 barrel**：`ui`/`main` 只能从 `editor/index.ts`、`render/index.ts`、`export/index.ts` 取能力，不直连内部实现文件；模块内部文件不跨模块穿越。
- **无深穿 import**：相对 import 不得出现三层及以上向上穿越（`../../../`）。
- **状态单真相**：同一概念只保留一套 accessor，由消费方直接导入定义，不靠 UI 组件中转再导出。
- **依赖注入优先**：模块协作走参数/回调/端口，不新增模块级可变全局状态。
- **纯函数下沉**：无副作用逻辑放 `src/utils/`，且不得 import DOM/Tauri API。
- **文件行数**：目标 ≤500 行，硬上限 900 行；超 400 行进入观察区，超限按职责拆分而非按行数硬切。
- **测试位置**：测试放镜像的 `src/**/__tests__/`，仅测试用的 fixture/helper 放 `src/__fixtures__/`；Rust 单元测试放同目录 `tests.rs`，生产文件只留 `#[cfg(test)] mod tests;`。
- **命名与注释**：TS 文件小写短横线，Rust 文件/函数 `snake_case`；注释只解释「为什么」；不 `export` 仅本文件使用的符号。
- **不掩盖死代码**：不用 `#[allow(dead_code)]` 等属性掩盖未使用符号，删除或真正接入调用链。

提交前跑 `node scripts/check-layering.mjs`（分层/行数/测试分离门禁，CI 同款）。

## 调试规则

- **先查运行日志再改代码**：日志目录由 `app_config_dir().join("logs")` 动态决定（启动时打印 `log_dir=`），各平台默认位置见下表
- 布局/样式问题先检查 CSS
- 踩坑记录见 `.claude/memory/MEMORY.md`
