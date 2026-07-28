## 1. Phase A: 生产代码分层 — parse_index 子模块

- [ ] 1.1 创建 `parse_index/` 子模块目录
- [ ] 1.2 提取 `types.rs` — BlockId, LineRange, BlockKind, BlockNode, OutlineItem, ParseIndex, ScanOutcome, AffectedRanges
- [ ] 1.3 提取 `style_map.rs` — StyleMap, BulletMarker, OrderedMarker, FenceStyle, ListStyleSpan, QuoteStyleSpan, TableStyleSpan, TableAlignment, PipePadding
- [ ] 1.4 提取 `large_document_policy.rs` — DocumentSizeClass, DeferredWork, LargeDocumentPolicy
- [ ] 1.5 提取 `scanner.rs` — BlockScanner, LineInfo, collect_lines, count_leading_spaces, is_space
- [ ] 1.6 提取 `heading.rs` — heading_title
- [ ] 1.7 提取 `list.rs` — starts_like_list_marker, starts_task_checkbox
- [ ] 1.8 提取 `table.rs` — parse_table_delimiter, split_table_cells
- [ ] 1.9 提取 `incremental.rs` — ParseIndex::update_after_patch, affected_block_window, replacement_may_change_block_structure
- [ ] 1.10 编写 `mod.rs` 门面 — 组织 use 和 pub use，保持对外 re-export 兼容
- [ ] 1.11 删除原 `parse_index.rs`
- [ ] 1.12 编译验证 — `cargo build --manifest-path markflow-core/Cargo.toml`
- [ ] 1.13 `cargo clippy --manifest-path markflow-core/Cargo.toml -- -D warnings`

## 2. Phase B: 测试代码分层

- [ ] 2.1 创建 `tests/common/mod.rs` — 统一 open, fixture, patch_at helper
- [ ] 2.2 创建 `tests/lossless.rs` — 迁移 fixture 存在性和 byte-for-byte roundtrip 测试
- [ ] 2.3 创建 `tests/snapshot.rs` — 迁移 BOM/encoding/trailing newlines/UTF-8 reject 测试
- [ ] 2.4 创建 `tests/patch.rs` — 迁移 patch 相关测试（重叠、顺序无关、UTF-8 边界等）
- [ ] 2.5 创建 `tests/session.rs` — 迁移 session/transaction/revision 测试
- [ ] 2.6 创建 `tests/position_map.rs` — 迁移 offset 往返和边界诊断测试
- [ ] 2.7 创建 `tests/line_ending_map.rs` — 迁移 EOL 继承和 replacement 测试
- [ ] 2.8 创建 `tests/text_buffer.rs` — 迁移 logical text 合约测试
- [ ] 2.9 创建 `tests/parse_index.rs` — 迁移 M2 parse index 测试（block scanner、outline、StyleMap 等）
- [ ] 2.10 删除 `core_foundation.rs`、`m1_1_correctness.rs`
- [ ] 2.11 运行完整测试验证 — `cargo test --manifest-path markflow-core/Cargo.toml`

## 3. 最终验证

- [ ] 3.1 `cargo fmt --all --check`
- [ ] 3.2 `cargo test --manifest-path markflow-core/Cargo.toml`
- [ ] 3.3 `cargo clippy --manifest-path markflow-core/Cargo.toml -- -D warnings`
- [ ] 3.4 `cargo run --manifest-path markflow-core/Cargo.toml --release --example m2_parse_index_benchmark`
- [ ] 3.5 `npm run build`
- [ ] 3.6 `npm test`