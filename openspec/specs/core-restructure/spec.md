# core-restructure Specification

## Purpose
TBD - created by archiving change restructure-core-code. Update Purpose after archive.
## Requirements
### Requirement: ParseIndex 按职责拆分

生产代码 SHALL 将 `parse_index.rs` 拆分为 `parse_index/` 子模块目录，包含 `types.rs`、`style_map.rs`、`large_document_policy.rs`、`scanner.rs`、`heading.rs`、`list.rs`、`table.rs`、`incremental.rs`。

#### Scenario: 子模块对各类型分类正确
- **WHEN** 检查 `types.rs`
- **THEN** 它包含 BlockId, LineRange, BlockKind, BlockNode, OutlineItem, ParseIndex, ScanOutcome, AffectedRanges

#### Scenario: style_map 仅包含风格捕获类型
- **WHEN** 检查 `style_map.rs`
- **THEN** 它包含 StyleMap, BulletMarker, OrderedMarker, OrderedDelimiter, FenceStyle, FenceMarker, ListStyleSpan, QuoteStyleSpan, TableStyleSpan, TableAlignment, PipePadding

#### Scenario: large_document_policy 仅包含策略类型
- **WHEN** 检查 `large_document_policy.rs`
- **THEN** 它包含 DocumentSizeClass, DeferredWork, LargeDocumentPolicy，不依赖 scanner

#### Scenario: scanner 包含 BlockScanner 主流程
- **WHEN** 检查 `scanner.rs`
- **THEN** 它包含 BlockScanner, LineInfo, collect_lines

#### Scenario: heading/list/table 模块包含独立辅助函数
- **WHEN** 检查 `heading.rs`
- **THEN** 它包含 heading_title, count_leading_spaces 等 heading 相关函数
- **WHEN** 检查 `list.rs`
- **THEN** 它包含 starts_like_list_marker, starts_task_checkbox 等 list 相关函数
- **WHEN** 检查 `table.rs`
- **THEN** 它包含 parse_table_delimiter, split_table_cells 等 table 相关函数

#### Scenario: incremental 包含增量更新逻辑
- **WHEN** 检查 `incremental.rs`
- **THEN** 它包含 ParseIndex::update_after_patch, affected_block_window, replacement_may_change_block_structure

### Requirement: public API 完全兼容

拆分后 `document::parse_index` 的 re-export MUST 与原文件完全一致。

#### Scenario: re-export 完整覆盖
- **WHEN** 编译整个 crate
- **THEN** 不产生未使用导入或缺失导入错误

#### Scenario: 调用方不需修改
- **WHEN** 编译所有依赖 parse_index 的 crate（包括 tauri commands、tests）
- **THEN** 不产生编译错误

### Requirement: 集成测试模块化

Core integration tests SHALL 按模块分层命名，删除旧的里程碑命名测试文件。

#### Scenario: 新测试文件结构
- **WHEN** 检查 `tests/` 目录
- **THEN** 包含 `session.rs`、`snapshot.rs`、`lossless.rs`、`patch.rs`、`position_map.rs`、`line_ending_map.rs`、`text_buffer.rs`、`parse_index.rs`

#### Scenario: 旧里程碑文件已删除
- **WHEN** 检查 `tests/` 目录
- **THEN** 不存在 `core_foundation.rs`、`m1_1_correctness.rs`

#### Scenario: 测试 helper 已统一
- **WHEN** 检查 `tests/common/mod.rs`
- **THEN** 包含 `open(bytes)`、`fixture(name)`、`patch_at(...)` 或等价的统一 helper
- **WHEN** 检查各测试文件
- **THEN** 不再存在重复的 `open`/`fixture`/`patch_at` 定义

#### Scenario: 所有已有测试覆盖保留
- **WHEN** 运行 `cargo test --manifest-path markflow-core/Cargo.toml`
- **THEN** 通过的测试数量不少于重构前总数
- **AND** 每个原测试函数名在新结构中可追踪

### Requirement: 验证命令全部通过

重构后 SHALL 通过以下验证。

#### Scenario: cargo fmt
- **WHEN** 运行 `cargo fmt --all --check`
- **THEN** 退出码为 0

#### Scenario: cargo clippy
- **WHEN** 运行 `cargo clippy --manifest-path markflow-core/Cargo.toml -- -D warnings`
- **THEN** 退出码为 0

#### Scenario: cargo test
- **WHEN** 运行 `cargo test --manifest-path markflow-core/Cargo.toml`
- **THEN** 所有测试通过

#### Scenario: benchmark 可运行
- **WHEN** 运行 `cargo run --manifest-path markflow-core/Cargo.toml --release --example m2_parse_index_benchmark`
- **THEN** 程序正常输出测量结果且不 panic

#### Scenario: npm build
- **WHEN** 运行 `npm run build`
- **THEN** 构建成功退出码为 0

#### Scenario: npm test
- **WHEN** 运行 `npm test`
- **THEN** 所有测试通过

