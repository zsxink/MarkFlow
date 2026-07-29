## Why

M3 阶段（Core-backed Source Mode）已基本实现，但在复核中发现大量技术债务：
Rust Core 存在测试设施泄漏、死代码、可见性过宽、expect/unreachable 等质量问题；
Tauri Backend 存在死代码、Mutex 不安全、代码重复；
TypeScript 前端存在错误处理不完善、大文件待拆分、测试覆盖不足。
与此同时，文档（stage docs 和 openspec/specs）与当前实现存在滞后和碎片化。
需要一次系统性清理，为后续开发奠定健康基础。

## What Changes

### Rust Core (markflow-core/)

- 测试基础设施：testing 模块改为 `#[cfg(feature = "testing")]` 条件编译、移除 blanket `#[allow(dead_code)]`、删除死代码函数
- 可见性封装：OriginalSnapshot 字段私有化、内部辅助函数改为 `pub(crate)`
- 错误处理改进：`expect()` 封装为 read/write cache 方法、`unreachable!()` 替换为安全 fallback
- 代码结构改进：ID 类型提取到 types.rs、scanner.rs 拆分、incremental.rs 改名 update.rs
- 测试覆盖：为 line_index.rs 和 text_buffer.rs 补充独立测试
- 文件与目录清理：重命名 benchmark 文件、删除空目录 fixtures/m3/
- CI 修复：添加 markflow-core 独立 cargo test + clippy 步骤

### Tauri Backend (src-tauri/)

- 死代码移除：删除 document_service.rs、ErrorDto、11 个未使用的 AppError 构造器、state.rs 死方法
- Mutex 安全修复：`lock().expect()` 和 `lock().unwrap()` 改为 `error::lock_mutex()?`
- 代码重复消除：normalize_lexical 提取到 paths.rs、5 个导出命令统一为 save_export、MockHost 提取到公共测试辅助
- 逻辑修复：resync_document 使用 `_confirmed_revision` 验证过期
- 测试覆盖：为 AppHost::compare_and_atomic_write 添加单元测试

### TypeScript 前端 (src/)

- 错误处理修复：contextMenu.ts/newFileDialog.ts 使用结构化错误报告、codemirror-languages.ts 添加日志
- 代码组织改进：exportTheme.ts 拆分、fileTree.core.ts 拆分、36 个测试文件目录整理、删除死代码 hideContextMenu()
- 类型安全改进：docxExport.ts 的 `any` 替换为具体类型

### 文档审查

- 更新 stage docs（technical-plan.md、product-plan.md、feature-migration-matrix.md、m3-core-backed-source-mode.md）
- 审查 openspec/specs 碎片化问题，决定 legacy 文档的处置

## Capabilities

### New Capabilities

- `core-code-quality`: Rust Core 代码质量清理——测试、可见性、错误处理、结构优化
- `backend-dead-code`: Tauri Backend 死代码移除与 Mutex 安全修复
- `frontend-error-handling`: TypeScript 前端错误处理完善与日志改进
- `ci-core-test`: CI 中添加 markflow-core 独立测试步骤
- `doc-spec-reconciliation`: 文档与 spec 的审查更新

### Modified Capabilities

- `core-bridge-protocol`: resync_document 使用 confirmed_revision 验证过期——协议语义澄清

## Impact

- `markflow-core/`：多个文件重构、重命名、拆分，需确保所有测试和 clippy 通过
- `src-tauri/`：删除一个模块、修改 Mutex 调用模式、提取公共函数
- `src/`：错误处理模式变更、文件拆分、测试文件移动
- `docs/`：stage docs 更新
- `.github/workflows/ci.yml`：添加新步骤
- 所有变更均为纯重构（不影响用户可见行为）
