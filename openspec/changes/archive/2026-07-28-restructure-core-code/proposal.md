## Why

M2 已新增 `parse_index.rs`、`m2_parse_index.rs`、benchmark example 等模块，当前 `parse_index.rs` 已成长为一个包含数据结构、block scanner、style scanner、large document policy、incremental stale 标记、parser 辅助逻辑的超长文件。Core integration tests 仍按里程碑文件组织，这种结构适合阶段验收但不适合长期维护。M2.1 应在不改变功能行为的前提下，将生产代码和测试代码一起整理成稳定分层结构。

## What Changes

- **生产代码分层**：将 `markflow-core/src/document/parse_index.rs` 拆分为子模块目录 `parse_index/`，包含 types、style_map、scanner、heading、list、table、large_document_policy、incremental 等独立子模块
- **模块门面**：`parse_index/mod.rs` 作为门面 re-export 公共 API，保持对外调用方不受影响
- **测试代码迁移**：将 Core integration tests 从里程碑命名 (`core_foundation.rs`、`m1_1_correctness.rs`、`m2_parse_index.rs`) 迁移为模块分层命名
- **测试 helper 统一**：新建 `tests/common/mod.rs` 减少重复样板
- **不引入 M3+ 新功能**：纯重构，不改变行为
- **删除旧里程碑测试文件**：迁移后删除空的旧文件

## Capabilities

### New Capabilities

- `core-restructure`: markflow-core 生产代码与测试代码的纯分层重构

### Modified Capabilities

（无 spec 级行为变更——本变更纯属架构重构，不改变任何可观测行为）

## Impact

- **核心模块**：`markflow-core/src/document/parse_index.rs` 拆分为子模块目录
- **测试结构**：Core integration tests 从里程碑命名迁移为模块分层命名
- **公开 API**：对外保持兼容，public API 不发生不必要破坏
- **无新增依赖**：纯代码重组