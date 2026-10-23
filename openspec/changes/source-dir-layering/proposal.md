# Proposal

## Why

`src/` 与 `src-tauri/src/` 只按文件类型粗分目录，生产代码与测试代码平铺混杂，抽象层级不一致（编辑器引擎、导出、渲染、基础设施、纯工具同在 `src/lib/`），并已出现分层倒置（`src/lib/` 12 处 import `src/components/`）与跨模块直连（`fileTree.core → sidebar`）。文件数量增长后定位成本与评审成本持续上升，而 `docs/archive/cleanup-plan/code-standards.md` 的分层建议仍挂在归档目录、无门禁，无法阻止下一次腐化。

## What Changes

- **前端按层重组**：`src/` 拆为 `types/`、`utils/`、`infra/`、`editor/`、`render/`、`export/`、`ui/`、`main.ts`；`lib/` 与 `components/` 按职责逐文件迁移并删除，`editor/`、`render/`、`export/` 各自提供 barrel/facade。
- **测试代码与生产代码分离**：`src/**/*.test.ts` 迁到镜像目录 `src/**/__tests__/`，仅测试使用的 fixture/helper（`wysiwyg-roundtrip.fixtures.ts`）进 `src/__fixtures__/`，`src/` 根下的 `main.autosave.test.ts` 一并归位；`vitest.config.ts`、`tsconfig.json` 的 include 同步更新。
- **消除分层倒置**：`editor/`、`render/`、`export/` 不再 import `ui/`；toast、右键菜单、frontmatter 面板、降级条、会话确认等 UI 能力改为**回调注入端口**（`infra/ui-ports.ts` + 启动时装配），沿用 `lib/error.ts` 的 `setToastReporter` 与 `createMermaidCodeBlockExtension(..., callbacks)` 先例。
- **消除跨模块直连与循环**：`openFileInEditor` 改为注入的打开文档端口，`fileTree` 不再 import `sidebar`；`sidebar.fileops ↔ sidebar.conflict` 的互引经 `ui/document-transition.ts` 中转解除。
- **随迁移按职责拆分超行文件**：`editor.extensions.ts`（808 行）、`fileTree.core.ts`（782）、`exportTheme.ts`（624）、`imageUtils.ts`（569）、`editor.ts`（552）、`settings.ts`（543）等按职责拆到 ≤500 行目标。
- **后端按子域分层 + 测试外置**：`src-tauri/src/` 抽出 `net/`（`http.rs` 拆分）、`fs/` 扩充（`atomic.rs`、`paths.rs`），`commands/` 按子域拆（`files/`、`images/`、`export/`、`settings/`）；13 个内联 `#[cfg(test)] mod tests` 迁到 `src-tauri/src/**/tests/*.rs` 子模块文件，生产文件不再含测试代码；`menu.rs`（1377 行）与 `files_image.rs`（1266 行）拆分。
- **规范转正 + 门禁**：`docs/archive/cleanup-plan/code-standards.md` 升级为 `openspec/specs/code-standards/spec.md`，目录分层写入 `openspec/specs/architecture.md`；新增 `scripts/check-layering.mjs`（分层白名单 + 循环依赖 + 测试与生产分离 + 文件行数上限）并接入 CI 与 `AGENTS.md` 自检清单。
- **BREAKING（内部 API）**：`src/lib/*` 与 `src/components/*` 的模块路径全部变更；`editor/`、`render/`、`export/` 需经 barrel 导入。无外部行为变更、无对外 API 变更。

## Capabilities

### New Capabilities

- `code-standards`: 代码级硬性规范（文件行数、命名、注释、错误处理、去重、安全、文档分级、允许/禁止的设计模式），作为唯一权威源取代归档目录的建议稿。
- `source-layering`: 前端与后端源码的分层目录结构、每个目录的职责边界、允许的依赖方向、测试与生产代码分离要求，以及这些约束的自动化门禁。

### Modified Capabilities

- `type-system`: 跨模块共享类型的落点与导入要求随分层目录更新（`src/types/` 保持，但消费方路径与「只经 barrel 取编辑器/渲染/导出类型」的约束补齐）。
- `error-handling`: 补充「UI 能力通过注入端口上报，基础设施层不得反向 import UI 层」的要求。

## Impact

- **前端代码**：`src/lib/`（62 生产文件）、`src/components/`（28 生产文件）、`src/utils/`、`src/types/`、`src/main.ts` 全量重排；71 + 13 + 2 个测试文件迁移。
- **后端代码**：`src-tauri/src/` 全部模块重排，13 个文件的 `#[cfg(test)]` 段外置；`menu.rs`、`http.rs`、`files.rs`、`files_image.rs`、`export.rs` 按职责拆分。
- **配置**：`vitest.config.ts`（include）、`tsconfig.json`（include/exclude）、`vite.config.ts`（alias 如有）、e2e 引用。
- **CI**：`.github/workflows/ci.yml` 增加分层/行数/测试分离校验步骤；新增 `scripts/check-layering.mjs`。
- **规范**：新增 `openspec/specs/code-standards/`、`openspec/specs/source-layering/`；更新参考文档 `openspec/specs/architecture.md` 的项目结构一节（非行为规范，不产生 delta）、`INDEX.md` 路由表；`docs/archive/cleanup-plan/code-standards.md` 的权威地位移交给正式 spec。
- **文档**：`AGENTS.md` 增加新增代码自检清单；`openspec/specs/INDEX.md` 路由表路径更新。
- **风险**：迁移期路径引用量大，靠 `npx tsc --noEmit` + `npm test` + 分层脚本逐批校验；行为零变更。
