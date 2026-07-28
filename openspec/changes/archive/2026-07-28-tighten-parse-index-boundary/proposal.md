## Why

M2.1（#200 / PR #202）完成了 `markflow-core` 生产代码与 integration tests 的分层重组。复盘时发现两个削弱长期维护边界的问题：

1. `parse_index/types.rs` 仍然反向依赖 `scanner::BlockScanner`，并在类型模块里实现 `ParseIndex::scan*` 扫描入口，与"类型定义不应依赖 scanner 实现"的分层原则不一致。
2. integration test helper 拆到 `tests/common/mod.rs` 后，因每个 test crate 独立编译，产生 unused imports / dead_code warnings，导致 `cargo clippy --tests -- -D warnings` 无法通过。

这两个问题不改变产品行为，但若不修复，M2.1 的分层收益会被逐步侵蚀。

## What Changes

1. 从 `parse_index/types.rs` 移除对 `scanner::BlockScanner` 的依赖，将 `ParseIndex::scan*` 实现移到 `parse_index/mod.rs`（门面层），由门面层连接 scanner/policy/incremental 子模块。
2. 清理 integration test 中的 unused imports 和 dead_code，使 `cargo test` 无 lint 噪音、`cargo clippy --tests -- -D warnings` 通过。
3. 变更为纯重构：不改变 parse index 识别语义、不改变 public API、不改变行为。

## Capabilities

### New Capabilities

- 无（纯重构，不引入新能力）

### Modified Capabilities

- `markflow-core-foundation`：模块内部依赖方向收紧——`types.rs` 不再依赖 scanner，scan 入口由 `mod.rs` 门面层承担。

## Impact

- **Affected code**: `markflow-core/src/document/parse_index/types.rs`、`mod.rs`、`tests/common/mod.rs` 及各个 integration test 文件。
- **No API changes**: public API 不变，`ParseIndex::scan` / `scan_with_line_ending` / `scan_with_document_bytes` 仍可用。
- **No behavior changes**: 纯重构，无行为差异。
- **Cargo commands**: 需验证 `cargo clippy --tests -- -D warnings` 通过。
