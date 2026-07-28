## Context

M2.1 对 `markflow-core/src/document/parse_index` 进行了模块化重组，拆分为 `types`、`scanner`、`incremental`、`style_map`、`large_document_policy`、`list`、`table`、`heading` 等子模块。但重组不完全：

1. `types.rs` 仍引用 `super::scanner::BlockScanner`，并在该文件中实现了 `ParseIndex::scan*` 入口方法——这违背了"类型定义不应依赖 scanner 实现"的分层原则。
2. integration test 各文件独立编译为 crate，导致 `tests/common/mod.rs` 中的 helper 在不同 crate 中出现 dead_code warnings，且各测试文件存在从 M2.1 迁移遗留的 unused imports。

## Goals / Non-Goals

**Goals:**
- 从 `parse_index/types.rs` 移除对 `scanner::BlockScanner` 的依赖，将 `ParseIndex::scan*` 移到 `mod.rs` 门面层。
- 清理所有 test 文件中的 unused imports，消除 `cargo clippy --tests -- -D warnings` 的失败原因。
- 保持 public API 不变。

**Non-Goals:**
- 不改 parse index 识别语义。
- 不改 `DocumentSession::parse_index()` cache 行为。
- 不扩大 public API。
- 不涉及 M3+ 新功能。

## Decisions

### Decision 1: 将 `ParseIndex::scan*` 移到 `mod.rs`

- `mod.rs` 作为模块门面，负责连接 scanner/policy/incremental 子模块，最适合承载 scan 入口。
- `incremental.rs` 已在该文件中实现 `ParseIndex::update_after_patch`，遵循相同模式。
- 移走后 `types.rs` 不再需要 `use super::scanner::BlockScanner` 和 `use crate::document::LineEndingKind`。

### Decision 2: 对 `tests/common/mod.rs` 使用 `#![allow(dead_code)]`

- Rust integration test 每个文件是独立 crate，`mod common;` 导致 common 被多次编译。同一个 helper 在部分 test crate 中未被使用时会触发 dead_code。
- 拆成更细粒度的子模块会增加维护成本，且 common 中的 helper 本身就是 test-only DSL。
- `#![allow(dead_code)]` 是 Rust 社区标准解法（类似 `#[cfg(test)]` 模式），不会掩盖生产代码问题。

### Decision 3: 逐文件清理 unused imports

- 删除各 test 文件中从 `markflow_core` 未使用的导入。
- 删除 `lossless.rs` 中未使用的 `patch_at` 导入。

## Risks / Trade-offs

- **[Low] `mod.rs` 职责略增**：门面层承担更多连接职责是合理的设计。`incremental.rs` 已在此模式工作。
- **[None] 无行为变化风险**：纯代码移动 + 删除无用导入，不涉及逻辑修改。
- **[None] 无 public API 破坏**：`ParseIndex::scan*` 方法签名不变，仍然通过 `pub use types::ParseIndex` 导出。
