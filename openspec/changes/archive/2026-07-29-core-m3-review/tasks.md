## 1. Rust Core 代码质量清理 (markflow-core/)

### 1.1 测试基础设施清理

- [x] 1.1.1 [P0] 将 `markflow-core/src/testing/mod.rs` 改为 `#[cfg(feature = "testing")]` 门控
- [x] 1.1.2 [P0] 移除 `markflow-core/tests/common/mod.rs:1` 的 `#![allow(dead_code)]`，改用逐个标注
- [x] 1.1.3 [P1] 删除 `markflow-core/tests/lossless.rs:11-21` 的 `block_kinds` 死代码函数
- [x] 1.1.4 [P1] 确认 `markflow-core/tests/parse_index.rs:10-19` 的 `block_kinds` 仍在用

### 1.2 可见性封装

- [x] 1.2.1 [P0] `snapshot.rs` — OriginalSnapshot 字段改为私有 + getter
- [x] 1.2.2 [P1] scanner.rs/heading.rs/list.rs/table.rs/incremental.rs — 内部辅助改为 `pub(crate)`
- [x] 1.2.3 [P1] `text_buffer.rs` — `validate_range` 和 `is_char_boundary` 改为 `pub(crate)`

### 1.3 错误处理改进

- [x] 1.3.1 [P1] session.rs 的 4 处 `expect()` 封装为 `fn read_cache()` / `fn write_cache()`
- [x] 1.3.2 [P1] scanner.rs 的 4 处 `expect("checked by caller")` 添加 debug_assert 前置
- [x] 1.3.3 [P1] scanner.rs:618 的 `unreachable!()` 替换为安全 fallback

### 1.4 代码结构改进

- [x] 1.4.1 [P1] 将 session.rs（323行）中的 ID 类型提取到 `src/document/types.rs`
- [x] 1.4.2 [P2] `incremental.rs` 重命名为 `update.rs`

### 1.5 测试覆盖改进

- [x] 1.5.1 [P1] 为 `line_index.rs` 创建 `tests/line_index.rs`，覆盖 `find_line_end`、`line_col_for_byte`
- [x] 1.5.2 [P1] 扩展 `tests/text_buffer.rs`（当前仅 16 行），覆盖 `replace`、`apply_changes`、`validate_range`、`chunks`

### 1.6 文件名与目录清理

- [x] 1.6.1 [P0] 重命名 `examples/m1_1_benchmark.rs` → `examples/bench_session_open_patch_save.rs`
- [x] 1.6.2 [P0] 重命名 `examples/m2_parse_index_benchmark.rs` → `examples/bench_parse_index_update.rs`
- [x] 1.6.3 [P1] 更新所有 `Cargo.toml` 中对旧文件名的引用（如有 `[[example]]` 声明）
- [x] 1.6.4 [P1] 删除空目录 `examples/lossless/` 和 `examples/m3/`

### 1.7 fixtures 目录统一

- [x] 1.7.1 [P0] 创建 `fixtures/size/` 目录，将 `fixtures/m3/1mb-filler.md`、`10mb-filler.md`、`50mb-filler.md` 移入
- [x] 1.7.2 [P0] 删除 `fixtures/m3/` 目录
- [x] 1.7.3 [P1] 确认 fixtures/size/ 下的 filler 文件不需要被 benchmark 引用

### 1.8 CI 修复

- [x] 1.8.1 [P0] 在 `.github/workflows/ci.yml` 中添加 markflow-core 的独立 `cargo test` 步骤
- [x] 1.8.2 [P1] 为 markflow-core 添加 `cargo clippy` 步骤

## 2. Tauri Backend 代码清理 (src-tauri/)

### 2.1 死代码移除

- [x] 2.1.1 [P0] 删除 `src-tauri/crates/runtime/src/document_service.rs` 和 `lib.rs` 中的导出
- [x] 2.1.2 [P1] 删除 `core_bridge.rs:186-192` 的 `ErrorDto`
- [x] 2.1.3 [P2] 删除 `src-tauri/src/error.rs:160-224` 的 11 个死代码构造器方法
- [x] 2.1.4 [P2] 删除 `src-tauri/src/state.rs:67,75` 的 `consume_close_permission` / `cleanup_close_permission`

### 2.2 Mutex 安全修复

- [x] 2.2.1 [P0] `core_bridge.rs:59` — `FRONTEND_TXN_MAP.lock().expect()` 改为 `error::lock_mutex()?`
- [x] 2.2.2 [P1] `fs/ignore.rs:41` — `snapshot.lock().unwrap()` 改为 `error::lock_mutex()`

### 2.3 代码重复消除

- [x] 2.3.1 [P1] 将 `normalize_lexical` 提取到 `src-tauri/src/paths.rs`
- [x] 2.3.2 [P2] 将 MockHost 提取到 `src-tauri/crates/runtime/tests/common/mod.rs`

### 2.4 测试覆盖改进

- [x] 2.4.1 [P1] 为 `runtime_host.rs` 的 `AppHost::compare_and_atomic_write` 添加单元测试

### 2.5 逻辑修复

- [x] 2.5.1 [P1] 修复 `core_bridge.rs:484` 的 `resync_document` — 使用 `_confirmed_revision` 参数验证过期

## 3. TypeScript 前端代码清理 (src/)

### 3.1 错误处理修复

- [x] 3.1.1 [P1] `contextMenu.ts:178,185` — 将 `showToast(打开失败: ${e})` 改为结构化错误报告
- [x] 3.1.2 [P1] `newFileDialog.ts:67,84,121` — 添加 `logException` 后再展示用户消息
- [x] 3.1.3 [P1] `codemirror-languages.ts:39` — 静默 `.catch(() => null)` 添加 `logDebug` 记录

### 3.2 测试覆盖改进

- [x] 3.2.1 [P2] 验证所有现有测试是否仍通过

### 3.3 代码组织改进

- [x] 3.3.1 [P2] 删除 `contextMenu.ts:57-58` 的空 `hideContextMenu()` 函数

## 4. 文档审查

### 4.1 Stage docs 更新

- [x] 4.1.1 [P1] 更新 `docs/markflow-core-stages/technical-plan.md` 为 M3 实施后状态
- [x] 4.1.2 [P1] 更新 `docs/markflow-core-stages/product-plan.md` 状态标记已确认准确
- [x] 4.1.3 [P1] 更新 `docs/markflow-core-stages/feature-migration-matrix.md` 精确化 M3 条目
- [x] 4.1.4 [P1] 在 `docs/markflow-core-stages/m3-core-backed-source-mode.md` 添加验收检查清单
- [x] 4.1.5 [P1] 添加 `markflow-core/fixtures/README.md` 记录目录用途

### 4.2 Spec 碎片化审查

- [x] 4.2.1 [P2] 审查 legacy specs（architecture.md, technical-design.md）状态并标记
- [x] 4.2.2 [P2] 审查 spec 碎片化范围并记录评估结果

## 5. 最终验证

- [x] 5.1 运行 `cd markflow-core && cargo test` 全部通过（12 passed）
- [x] 5.2 运行 `cd markflow-core && cargo clippy --all-targets -- -D warnings` 无警告
- [x] 5.3 运行 `cd src-tauri && cargo test` 全部通过（123 passed）
- [x] 5.4 运行 `cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings` 无警告
- [x] 5.5 运行 `npm test` 全部通过（36 files, 401 passed）
- [x] 5.6 运行 `npm run build` 成功（tsc 无错误）
