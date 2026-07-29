# MarkFlow M3 完成度复核 + 文档审查 — Codex 提示词

## ⚠️ 工作流程要求

**所有代码改动必须遵循 OpenSpec 工作流：**

1. **先创建分支**：从 main 拉新分支，命名 `refactor/issue-N-core-m3-review`（issue 号来自真实 GitHub Issue）
2. **先 propose 再 apply**：执行 `/opsx:propose` 创建变更提案，再执行 `/opsx:apply` 按 checklist 逐步实施
3. **禁止在 main 上修改代码**：所有改动必须在分支上完成
4. **完成后归档**：任务完成后执行 `/opsx:archive` 归档变更，更新 main specs
5. **提交并推送**：归档后 commit 所有变更，push 到远程分支
6. **创建 PR 合入**：创建 Pull Request，标题格式 `refactor: M3 完成度复核 + 文档审查 + 架构清理 (#N)`，等待 review 通过后合入 main
7. **提交规范**：commit message 使用 `type: 简明中文描述` 格式，body 中写 `closes #N`

## 项目背景

MarkFlow 是 Tauri v2 (Rust) + TypeScript + Vite 桌面 Markdown 编辑器。核心引擎 `markflow-core` (Rust crate) 提供了 Markdown 文档的 open/edit/save/patch/parse 全生命周期管理。当前正处于 Core 重构的 M3 阶段（Core-backed Source Mode），目标是让 Source Mode 率先接入 Core session，保存内容只来自 Core confirmed snapshot。

项目架构分层：
- `markflow-core/` — 纯 Rust 文档内核（document session, patch, parse index, text buffer）
- `src-tauri/crates/runtime/` — Rust runtime session 编排层
- `src-tauri/src/commands/` — Tauri IPC 命令处理器
- `src/lib/` — TypeScript 前端逻辑
- `src/components/` — TypeScript UI 组件

## 当前问题

### 一、已完成的 Stages 复核发现的问题

#### 1.1 Rust Core 代码质量（markflow-core/）

**FINDING 1.1.1: 测试基础设施泄漏到公共 API**
- 文件: `markflow-core/src/testing/mod.rs` (全部5行)
- 问题: `pub mod testing` 无条件导出，`markflow_core::testing::open_fixture_bytes` 出现在公共 API 中
- 修复: 改为 `#[cfg(feature = "testing")]` 条件编译

**FINDING 1.1.2: 测试 common 模块使用 blanket `#![allow(dead_code)]`**
- 文件: `markflow-core/tests/common/mod.rs:1`
- 问题: 顶层全局抑制死代码警告，使真正的死代码不可检测
- 修复: 移除 blanket 标注，改用逐个 `#[allow(dead_code)]`

**FINDING 1.1.3: `block_kinds` 函数在 `lossless.rs` 中死代码**
- 文件: `markflow-core/tests/lossless.rs:11-21`
- 问题: 函数定义且标注 `#[allow(dead_code)]`，实际未使用；同一函数在 `parse_index.rs:10-19` 有活动副本
- 修复: 删除 `lossless.rs` 中的死副本；如有需要移入 `tests/common/mod.rs`

**FINDING 1.1.4: `scanner.rs` 文件过大（651行）**
- 文件: `markflow-core/src/document/parse_index/scanner.rs`
- 问题: 超过300行阈值 2倍以上，包含了 BlockScanner 结构体、构造器、scan 分发循环、所有 block-type 扫描方法、检测辅助函数、LineInfo 类型和工具函数
- 修复建议: 将检测辅助函数（heading, fence_start, is_thematic_break, is_link_reference, is_image_block, is_blockquote, list_start, table_alignment_after）提取到对应文件；将 LineInfo 和 collect_lines/count_leading_spaces/is_space 提取到 `lines.rs`

**FINDING 1.1.5: production 代码中存在 expect() 调用（共10处）**
- `markflow-core/src/document/session.rs:160,219,236,305` — parse_index_cache RwLock，4处 expect("parse index cache lock poisoned")
- `markflow-core/src/document/parse_index/scanner.rs:198,233,261,308` — 4处 "checked by caller"
- `markflow-core/src/document/text_buffer.rs:194,226` — 2处 "valid UTF-8 char"
- 修复建议: session.rs 的 4 处提取为 `fn read_cache(&self)` 和 `fn write_cache(&self)` 封装；scanner.rs 的 4 处加入 debug_assert 前置检查

**FINDING 1.1.6: `session.rs` 边界偏大（323行）**
- 文件: `markflow-core/src/document/session.rs`
- 修复建议: 将 ID 类型（SessionId, DocumentId, Revision, TransactionId, ByteOffset, Utf16Offset, SourceByteOffset, SourceOffsetError, SourceRange）提取到 `src/document/types.rs`

**FINDING 1.1.7: OriginalSnapshot 所有字段是 pub 的（无封装）**
- 文件: `markflow-core/src/document/snapshot.rs:23-31`
- 修复: 私有化字段，暴露只读 getter

**FINDING 1.1.8: scanner.rs 中有 `unreachable!()` 调用**
- 文件: `markflow-core/src/document/parse_index/scanner.rs:618`（`list_start` 方法内）
- 修复: 用安全 fallback 替换或添加明确注释说明不变式

**FINDING 1.1.9: parser internals 可见性过宽 —— 内部类型应为 `pub(crate)` 而非 `pub`**
- 文件: `markflow-core/src/document/parse_index/scanner.rs` 中的 `collect_lines`, `count_leading_spaces`, `is_space`；`heading.rs` 中的 `heading_title`；`list.rs` 中的 `starts_task_checkbox`, `starts_like_list_marker`；`table.rs` 中的 `parse_table_delimiter`, `split_table_cells`；`incremental.rs` 中的 `SYNC_REPARSE_CONTEXT_BYTES`, `SYNC_REPARSE_BUDGET_BYTES`
- 修复: 将所有内部辅助改为 `pub(crate)` 或私有

**FINDING 1.1.10: TextBuffer 部分方法是 `pub` 但应为 `pub(crate)`**
- 文件: `markflow-core/src/document/text_buffer.rs`
- `validate_range` 和 `is_char_boundary` 是内部验证逻辑，应改为 `pub(crate)`

**FINDING 1.1.11: line_index.rs 没有独立测试文件**
- 文件: `markflow-core/src/document/line_index.rs`（112行，11个方法）
- `LineIndex::find_line_end` 和 `line_col_for_byte` 有非平凡逻辑但仅被间接测试

**FINDING 1.1.12: text_buffer.rs 测试覆盖不充分**
- 文件: `markflow-core/tests/text_buffer.rs`（仅16行、1个测试）；源文件 `text_buffer.rs` 有 253行、11个方法
- `replace`, `apply_changes`, `validate_range`, `chunks` 方法仅通过 session 集成测试覆盖

**FINDING 1.1.13: CI 未运行 markflow-core 的 cargo test**
- 文件: `.github/workflows/ci.yml:76` — 仅 `working-directory: src-tauri` 运行 `cargo test`
- `markflow-core/` 没有独立 CI 步骤

**FINDING 1.1.14: Benchmark 文件名使用内部阶段号，不知所云**
- 文件: `markflow-core/examples/m1_1_benchmark.rs` — `m1_1` 是内部阶段代号，读者看不出这是 open/patch/save 耗时测试
- 文件: `markflow-core/examples/m2_parse_index_benchmark.rs` — `m2` 同理
- 修复: 重命名为描述性名称
- 附加: `examples/lossless/` 和 `examples/m3/` 目录为空，应删除

**FINDING 1.1.15: fixtures/ 目录结构混乱，m3/ 子目录完全孤立**
- `fixtures/m3/` 中 9 个文件，**零代码引用**，完全孤立的死亡目录
- 其中有 4 个文件（crlf.md / frontmatter.md / html-comment.md / mixed-eol.md）与 `fixtures/lossless/` 同名但内容不同——都是 lossless 的简化版，没有独特场景
- 2 个文件（bom.md / unicode.md）命名风格与 lossless（utf8-bom.md / unicode-offsets.md）不一致
- 3 个 filler 大文件（1mb.md / 10mb.md / 50mb.md）无任何代码引用
- 修复: 删除 `fixtures/m3/`，将 filler 大文件移到 `fixtures/size/`

#### 1.2 Tauri Backend 代码问题（src-tauri/）

**FINDING 1.2.1: DocumentService 是死代码（92行，从未被调用）**
- 文件: `src-tauri/crates/runtime/src/document_service.rs`（整个文件）
- `core_bridge.rs:583-643` 的 `reload_document` 函数重复了相同业务逻辑
- 修复: 删除 `document_service.rs` 或将 `core_bridge.rs` 改为调用它

**FINDING 1.2.2: FRONTEND_TXN_MAP 锁使用 expect() 可 panic**
- 文件: `src-tauri/src/commands/core_bridge.rs:59`
- `FRONTEND_TXN_MAP.lock().expect("Frontend txn map poisoned")` — 应改为 `error::lock_mutex()?`

**FINDING 1.2.3: fs/ignore.rs 中 unwrap() 有 poisoned mutex 风险**
- 文件: `src-tauri/src/fs/ignore.rs:41`
- `snapshot.lock().unwrap()` — 应改为 `error::lock_mutex()` 模式

**FINDING 1.2.4: files_image.rs 文件过大（1153行）**
- 文件: `src-tauri/src/commands/files_image.rs`
- 修复: 拆分为 `images/validate.rs`, `images/pending.rs`, `images/remote.rs`

**FINDING 1.2.5: normalize_lexical 在两个文件中重复定义**
- `src-tauri/src/commands/files.rs:441-453` 和 `src-tauri/src/commands/files_image.rs:72-84`
- 修复: 提取到 `src-tauri/src/paths.rs`

**FINDING 1.2.6: AppHost（runtime_host.rs）无测试覆盖**
- 文件: `src-tauri/src/runtime_host.rs`（整个文件）
- `compare_and_atomic_write` 是最关键的持久化路径，无专用测试

**FINDING 1.2.7: 5个导出命令是几乎相同的模板代码**
- 文件: `src-tauri/src/commands/files.rs:293-402`
- `save_mermaid_svg_export`, `save_mermaid_png_export`, `save_plantuml_svg_export`, `save_plantuml_png_export`, `save_image_export`
- 修复: 统一为一个 `save_export` 命令加 `kind` 枚举

**FINDING 1.2.8: MockHost 在两个地方定义（单元测试和集成测试）**
- `src-tauri/crates/runtime/src/save.rs:182-234` 和 `src-tauri/crates/runtime/tests/save_integration.rs:22-70`
- 修复: 提取到 `tests/common/mod.rs`

**FINDING 1.2.9: 11个 AppError 构造器是死代码**
- 文件: `src-tauri/src/error.rs:160-224`
- `lock_poisoned`, `watcher_start_failed`, `internal`, `save_flush_timeout`, `save_in_progress`, `reload_dirty`, `invalid_range`, `unsupported_encoding`, `pending_queue_full`, `cancelled`, `protocol_version_unsupported`
- 修复: 删除未使用的构造器，或将 `core_bridge.rs` 中的调用切换到使用它们

**FINDING 1.2.10: state.rs 中两个方法是死代码**
- `src-tauri/src/state.rs:67`（consume_close_permission）, `:75`（cleanup_close_permission）
- 关闭权限生命周期在 `lib.rs` 中以内联方式处理

**FINDING 1.2.11: resync_document 的 `_confirmed_revision` 参数未使用**
- 文件: `src-tauri/src/commands/core_bridge.rs:484`
- 前端发送了 revision 但后端在 resync 时没有用它来验证过期 — 潜在的逻辑缺口

**FINDING 1.2.12: ErrorDto 声明了但从未使用**
- 文件: `src-tauri/src/commands/core_bridge.rs:186-192`

#### 1.3 TypeScript 前端代码问题（src/）

**FINDING 1.3.1: 测试文件与生产文件混放在同一目录（共 36 个测试文件）**
- `src/lib/` 中 23 个测试文件和 37 个源文件混放
- `src/components/` 中 12 个测试文件和 25 个源文件混放
- 修复: 将测试文件移到 `__tests__/` 子目录或顶级 `tests/` 镜像结构

**FINDING 1.3.2: 43% 的源文件没有对应测试（31/72 无测试）**
- lib/ 无测试: `codemirror-highlight-limit.ts`, `editor.complexity.ts`, `editor.image.bubble.ts`, `editor.image.resolver.ts`, `editor.init.ts`, `editor.source.ts`, `editor.sourcePatcher.ts`, `editor.stats.ts`, `editor.ts`, `error.ts`, `exportSnapshot.ts`, `logger.ts`, `mermaid-lazy.ts`, `mermaid.ts`, `plantuml.ts`, `theme.ts`, `urlDecorationPlugin.ts`
- components/ 无测试: `degradationBar.ts`, `fileTree.dragdrop.ts`, `fileTree.inline.ts`, `fileTree.ts`, `imageContextMenu.ts`, `linkDialog.ts`, `mermaidContextMenu.ts`, `newFileDialog.ts`, `outline.ts`, `plantumlContextMenu.ts`, `sidebar.ts`, `statusbar.ts`, `toast.ts`, `unsavedDialog.ts`
- P2: 优先为关键文件（coreSession.ts, SourceSyncController.ts, editor.source.ts, sidebar.ts）添加测试

**FINDING 1.3.3: 大文件过多（300+ 行，部分 600+）**
- `src/lib/SourceSyncController.ts` — 21.6KB, 606行 — 状态机、批处理、背压、重试逻辑复杂
- `src/lib/exportTheme.ts` — 18.7KB, 624行 — 混合了接口、CSS 生成、DOCX 样式、字体内联，至少应拆为 3 个文件
- `src/components/fileTree.core.ts` — 770行 — 最大文件，应拆分为树结构管理、事件处理、ARIA 功能
- `src/lib/editor.extensions.ts` — 17.6KB
- `src/lib/coreSession.ts` — 18KB, 558行 — 单例状态 + 公共 API + 脏状态检查
- `src/lib/imageUtils.ts` — 19.8KB, 536行

**FINDING 1.3.4: 错误处理不完善**
- `src/components/contextMenu.ts:178,185` — 向用户暴露原始 `e` 对象 (`showToast(打开失败: ${e})`)
- `src/components/newFileDialog.ts:67,84,121` — 同上，无日志记录
- `src/lib/codemirror-languages.ts:39` — 静默吞掉错误 (`.catch(() => null)`)

**FINDING 1.3.5: lib/ 逆向依赖 components/ — 7 个 lib 文件导入 components**
- `coreSession.ts → toast`, `editor.ts → toast + degradationBar`, `editor.extensions.ts → mermaidContextMenu + plantumlContextMenu`, `editor.image.bubble.ts → imageContextMenu`, `documentExport.ts → toast`, `pdfExport.ts → toast`, `docxExport.ts → toast`
- 修复建议: 使用回调/事件模式（如 `error.ts` 的 `setToastReporter`），而不是直接导入 UI 组件

**FINDING 1.3.6: `exportTheme.ts` 使用 7 处 `any` 类型**
- 文件: `src/lib/docxExport.ts` — 多处 `as any`, `any[]` 破坏了类型安全

**FINDING 1.3.7: `coreSession.ts` 单例模式防碍测试**
- 模块级可变状态 (`let currentSession`) + 生成计数器使测试不能安全并行

**FINDING 1.3.8: 重复常量定义**
- `coreSession.ts:37-40` (`MAX_PENDING_PATCHES=50`, `MAX_PENDING_BYTES=1MB`) 与 `SourceSyncController.ts:57-60` 值相同但独立定义

**FINDING 1.3.9: `hideContextMenu()` 是空函数（死代码）**
- `src/components/contextMenu.ts:57-58` — 导出但函数体为空，无调用方

### 二、文档审查发现的问题

#### 2.1 stage docs 问题

**FINDING 2.1.1: technical-plan.md 标为"方案已校准"但 M3 已实施，存在滞后**
- 文件: `docs/markflow-core-stages/technical-plan.md`（995行）
- 部分架构描述（如建议的 workspace 结构和 cargo 布局）与当前实现不完全一致
- 需要审查并更新为 M3 实施后的状态

**FINDING 2.1.2: product-plan.md 标为"方案已校准"状态**
- 文件: `docs/markflow-core-stages/product-plan.md`
- 与当前产品状态有部分出入，需更新

**FINDING 2.1.3: feature-migration-matrix.md 中的 M3 条目模糊**
- 文件: `docs/markflow-core-stages/feature-migration-matrix.md`
- 多处使用"测试与验证中"——需要精确化哪些已验证、哪些未完成

**FINDING 2.1.4: M3 文档（m3-core-backed-source-mode.md）缺少具体的验收指标**
- 文件: `docs/markflow-core-stages/m3-core-backed-source-mode.md`（34KB）
- 范围边界清晰但缺少"完成标准"的可验证检查清单

#### 2.2 openspec/specs 问题

**FINDING 2.2.1: architecture.md 和 technical-design.md 标为 legacy**
- `openspec/specs/architecture.md` — "Legacy notice: 本文记录 Core 重构前的当前实现架构"
- `openspec/specs/technical-design.md` — "Legacy notice: 本文记录 Core 重构前的当前实现技术设计"
- 需要决定是否保留为历史参考、更新，或删除引用

**FINDING 2.2.2: core-restructure/spec.md 是否存在？需要检查与 stage docs 的重复**
- 存在 `openspec/specs/core-restructure/spec.md`
- 存在 `openspec/specs/core-backed-source-mode/spec.md`
- 存在 `openspec/specs/runtime-document-service/spec.md`
- 需要审查这些规格是否与 `docs/markflow-core-stages/` 重叠

**FINDING 2.2.3: 规格碎片化**
- Core 重构相关规格分布在：`core-backed-source-mode/spec.md`, `core-bridge-protocol/spec.md`, `core-restructure/spec.md`, `runtime-document-service/spec.md`, `source-lifecycle-guard/spec.md`, `source-patch-adapter/spec.md`, `source-sync-controller/spec.md`, `save-integrity/spec.md`, `markflow-runtime/spec.md`, `markflow-core-foundation/spec.md`
- 10+ 个规格，边界可能重叠或交叉引用不完整

## 提示词

下面的提示词可直接提交给 Codex（或 Claude Code）作为 goal：

```
你是一个专家软件工程师，负责对 MarkFlow 项目进行 M3 完成度复核和代码清理。

## 背景

MarkFlow 是一个 Tauri v2 (Rust) 桌面 Markdown 编辑器，核心引擎 `markflow-core` 正在经历从 ProseMirror
到 Rust 原生的重构。M3 阶段（Core-backed Source Mode）已基本实现但你发现有大量技术债务需要清理。

## 任务 1：Rust Core 代码清理（markflow-core/）

请按以下顺序修复所有问题，每个步骤完成后运行 `cd markflow-core && cargo test` 和 `cargo clippy`：

### 1.1 测试基础设施清理
- [ ] [P0] 将 `markflow-core/src/testing/mod.rs` 改为 `#[cfg(feature = "testing")]` 门控
- [ ] [P0] 移除 `markflow-core/tests/common/mod.rs:1` 的 `#![allow(dead_code)]`，改用逐个标注
- [ ] [P1] 删除 `markflow-core/tests/lossless.rs:11-21` 的 `block_kinds` 死代码函数
- [ ] [P1] 确认 `markflow-core/tests/parse_index.rs:10-19` 的 `block_kinds` 仍在用

### 1.2 可见性封装
- [ ] [P0] `markflow-core/src/document/snapshot.rs:23-31` — OriginalSnapshot 字段改为私有 + getter
- [ ] [P1] scanner.rs/heading.rs/list.rs/table.rs/incremental.rs — 所有内部辅助改为 `pub(crate)`
- [ ] [P1] `text_buffer.rs` — `validate_range` 和 `is_char_boundary` 改为 `pub(crate)`
- [ ] [P2] 考虑将细粒度格式类型（`ListStyleSpan`, `PipePadding` 等）移到次级路径

### 1.3 错误处理改进
- [ ] [P1] 将 `session.rs:160,219,236,305` 的 4 处 `expect()` 封装为 `fn read_cache()` / `fn write_cache()`
- [ ] [P1] scanner.rs:198,233,261,308 的 4 处 `expect("checked by caller")` 添加 debug_assert 前置
- [ ] [P1] scanner.rs:618 的 `unreachable!()` 替换为安全 fallback

### 1.4 代码结构改进
- [ ] [P1] 将 `session.rs`（323行）中的 ID 类型提取到 `src/document/types.rs`
- [ ] [P1] 将 `scanner.rs`（651行）拆分为：扫描分发逻辑（~350行）+ detection helpers 放入对应文件 + LineInfo 提取到 lines.rs
- [ ] [P2] `incremental.rs` 重命名为 `update.rs` 更清晰反映用途

### 1.5 测试覆盖改进
- [ ] [P1] 为 `line_index.rs` 创建 `tests/line_index.rs`，覆盖 `find_line_end`、`line_col_for_byte`
- [ ] [P1] 扩展 `tests/text_buffer.rs`（当前仅 16 行），覆盖 `replace`、`apply_changes`、`validate_range`、`chunks`

### 1.6 文件名与目录清理
- [ ] [P0] 重命名 `examples/m1_1_benchmark.rs` → `examples/bench_session_open_patch_save.rs`
- [ ] [P0] 重命名 `examples/m2_parse_index_benchmark.rs` → `examples/bench_parse_index_update.rs`
- [ ] [P1] 更新所有 `Cargo.toml` 中对旧文件名的引用（如有 `[[example]]` 声明）
- [ ] [P1] 删除空目录 `examples/lossless/` 和 `examples/m3/`

### 1.7 fixtures 目录统一
- [ ] [P0] 创建 `fixtures/size/` 目录，将 `fixtures/m3/1mb-filler.md`、`10mb-filler.md`、`50mb-filler.md` 移入
- [ ] [P0] 删除 `fixtures/m3/` 目录（所有场景已在 `fixtures/lossless/` 覆盖，无独特场景丢失）
- [ ] [P1] 检查 `fixtures/size/` 下的 filler 文件是否需要被 benchmark 引用（benchmark 当前使用 `generated_markdown()` 自生数据而不是读文件，暂时无引用不变）

### 1.8 CI 修复
- [ ] [P0] 在 `.github/workflows/ci.yml` 中添加 markflow-core 的独立 `cargo test` 步骤
- [ ] [P1] 为 markflow-core 添加 `cargo clippy` 步骤

### 验收标准（任务 1）
- `cd markflow-core && cargo test` 全部通过
- `cd markflow-core && cargo clippy --all-targets -- -D warnings` 无警告
- CI 中 markflow-core 有独立的 cargo test 步骤
- `cargo doc --no-deps` 文档不包含 `markflow_core::testing`
- `OriginalSnapshot` 字段不可变（通过 getter 访问）
- `line_index.rs` 有至少 3 个新测试
- `text_buffer.rs` 扩展至至少 4 个测试
- `examples/` 下文件名描述性: `bench_session_open_patch_save.rs` 和 `bench_parse_index_update.rs`
- `fixtures/` 下只有 `lossless/` 和 `size/` 两个子目录，无 `m3/`

## 任务 2：Tauri Backend 代码清理（src-tauri/）

### 2.1 死代码移除
- [ ] [P0] 删除 `src-tauri/crates/runtime/src/document_service.rs`（92行死代码）和 `src-tauri/crates/runtime/src/lib.rs` 中的导出
- [ ] [P1] 删除 `src-tauri/src/commands/core_bridge.rs:186-192` 的 `ErrorDto`
- [ ] [P2] 删除 `src-tauri/src/error.rs:160-224` 的 11 个死代码构造器方法
- [ ] [P2] 删除 `src-tauri/src/state.rs:67,75` 的 `consume_close_permission` / `cleanup_close_permission`

### 2.2 Mutex 安全修复
- [ ] [P0] 将 `src-tauri/src/commands/core_bridge.rs:59` 的 `FRONTEND_TXN_MAP.lock().expect()` 改为 `error::lock_mutex()?`
- [ ] [P1] 将 `src-tauri/src/fs/ignore.rs:41` 的 `snapshot.lock().unwrap()` 改为 `error::lock_mutex()` 模式

### 2.3 代码重复消除
- [ ] [P1] 将 `normalize_lexical` 提取到 `src-tauri/src/paths.rs`（见 files.rs:441-453 和 files_image.rs:72-84）
- [ ] [P2] 将 5 个导出命令（save_mermaid_svg/png/plantuml_svg/png/image_export）统一为 `save_export` + kind 枚举
- [ ] [P2] 将 MockHost 提取到 `src-tauri/crates/runtime/tests/common/mod.rs`

### 2.4 测试覆盖改进
- [ ] [P1] 为 `runtime_host.rs` 的 `AppHost::compare_and_atomic_write` 添加单元测试

### 2.5 逻辑修复
- [ ] [P1] 修复 `core_bridge.rs:484` 的 `resync_document` — 使用 `_confirmed_revision` 参数验证过期情况

### 验收标准（任务 2）
- `cd src-tauri && cargo test` 全部通过
- `cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings` 无警告
- `cargo build` 成功
- 无 "dead_code" 允许标注（除确实合法的测试辅助外）
- document_service.rs 完全删除或已连接到调用方

## 任务 3：TypeScript 前端代码清理（src/）

### 3.1 错误处理修复
- [ ] [P1] `src/components/contextMenu.ts:178,185` — 将 `showToast(打开失败: ${e})` 改为 `reportUserActionError` + 结构化消息
- [ ] [P1] `src/components/newFileDialog.ts:67,84,121` — 添加 `logException` 后再展示用户消息
- [ ] [P1] `src/lib/codemirror-languages.ts:39` — 静默 `.catch(() => null)` 添加 `logDebug` 记录

### 3.2 测试覆盖改进
- [ ] [P2] 为关键文件添加基础测试：`coreSession.ts`, `SourceSyncController.ts`, `editor.ts`, `editor.source.ts`, `sidebar.ts`
- [ ] [P2] 验证所有现有测试是否仍通过

### 3.3 代码组织改进（二级清理）
- [ ] [P2] 将 `exportTheme.ts`（624行）拆分为 `exportTheme.types.ts`, `exportTheme.css.ts`, `exportTheme.docx.ts`
- [ ] [P2] 将 `fileTree.core.ts`（770行）拆分为管理 + 事件处理 + ARIA
- [ ] [P2] 将 36 个测试文件移到 `__tests__/` 子目录（可选：使用 Vitest 配置映射新路径）
- [ ] [P2] 删除 `src/components/contextMenu.ts:57-58` 的空 `hideContextMenu()` 函数

### 3.4 类型安全改进
- [ ] [P2] `src/lib/docxExport.ts` — 将 7 处 `any` 替换为具体类型（至少 `children: any[]` → `children: DocxChild[]`）
- [ ] [P2] `src/lib/editor.image.bubble.ts` — 为 `view` 和 `node` 参数使用 `EditorView` / `Node` 类型

### 验收标准（任务 3）
- `npm test` 全部通过
- `npm run build` 成功（tsc 无错误）
- 无未经日志记录的静默 catch 块
- `exportTheme.ts` 拆分为至少 2 个源文件

## 提交要求
1. 按上述顺序逐步修复
2. 每个步骤完成后运行对应的测试命令
3. 最终提交一个 PR，标题格式 `refactor: M3 完成度复核 + 文档审查 + 架构清理`
4. 提交前确保 `markflow-core/src/testing/` 已条件编译门控
```
