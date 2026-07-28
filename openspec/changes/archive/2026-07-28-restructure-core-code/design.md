## Context

当前 `markflow-core/src/document/parse_index.rs` 是一个 1104 行的单文件，混合了以下职责：

- 公共数据类型（BlockId, LineRange, BlockKind, BlockNode, ParseIndex 等）
- Style 捕获类型（BulletMarker, OrderedMarker, FenceStyle, StyleMap 等）
- Large document policy（DocumentSizeClass, LargeDocumentPolicy）
- Block scanner 主循环（BlockScanner）
- 独立的 scan helper（heading, list, table, fence 等识别规则）
- Incremental stale 标记（update_after_patch, affected_block_window）
- 自由函数（collect_lines, heading_title 等）

测试方面：有 3 个集成测试文件（core_foundation.rs 304 行、m1_1_correctness.rs 459 行、m2_parse_index.rs 535 行），包含重复的 test helper 定义。

## Goals / Non-Goals

**Goals:**
- 将 parse_index.rs 按职责拆分为 8 个子模块
- 保持 `document::parse_index` 对外 re-export 完全兼容
- 将集成测试从里程碑命名迁移为模块分层命名
- 统一 test helpers 到 `tests/common/mod.rs`
- 删除空的旧里程碑测试文件

**Non-Goals:**
- 不改变任何生产代码行为（纯重构）
- 不引入 M3+ 新功能语义
- 不改变 Benchmark 结构
- 不改变 DocumentSession 公共 API

## Decisions

### Decision 1: parse_index.rs → parse_index/ 子模块目录

**选择：** 创建 `parse_index/` 目录，原文件拆分为 8 个文件。

布局：
```
markflow-core/src/document/parse_index/
  mod.rs      — 门面，re-export 公共类型 + 暴露 scan 入口
  types.rs    — 公共数据类型
  style_map.rs — 风格捕获类型
  large_document_policy.rs — 大文件策略
  scanner.rs  — BlockScanner 主流程
  heading.rs  — heading 识别规则
  list.rs     — list marker 识别规则
  table.rs    — GFM table 识别规则
  incremental.rs — 增量 stale 标记
```

**理由：** 每个文件 100-250 行，职责清晰可审查。mod.rs 仅 30 行左右，作为最小门面。

### Decision 2: BlockScanner 实现保留在 scanner.rs

**选择：** BlockScanner 的扫描主循环 + 所有辅助方法（包括 heading/list/table/fence/blockquote 等的 inline 判断）集中到 scanner.rs，但对理解庞杂的复杂方法（heading, list, table）抽离 standalone 函数到对应的子模块。

**理由：** scanner.rs 约 560 行，在单一职责范围内。heading/list/table 相关的独立函数（如 `heading_title`、`starts_like_list_marker`、`parse_table_delimiter`）则是纯计算逻辑，不依赖 scanner 状态，适合放进子模块。

### Decision 3: ParseIndex::update_after_patch 随 ParseIndex 进 types.rs

**选择：** `ParseIndex` 的 `scan`、`scan_with_line_ending`、`scan_with_document_bytes` 是构造函数，放在 types.rs 的 impl 块。`update_after_patch` 和 `affected_block_window` 放在 incremental.rs。

**理由：** `scan` 是初始化方法，与 ParseIndex 类型定义共处一处可读性好。增量逻辑独立成模块，方便 M3 真正实现增量替换。

### Decision 4: BlockKind::requires_conservative_reparse 保留在 types.rs

**选择：** 这是一个 BlockKind 的方法，留在 types.rs 的 `impl BlockKind` 块。

### Decision 5: 测试 helper 统一

**选择：** 创建 `tests/common/mod.rs`，包含：
- `open(bytes)` — 创建 DocumentSession
- `fixture(name)` — 读取 fixture 文件
- `patch_at(...)` / `change(...)` — 创建 TextPatch/TextChange

迁移后删除各个测试文件中重复的 `open`/`fixture`/`patch_at` 定义。

**替代方案考虑：** 放到 `src/testing/mod.rs`。被拒绝的原因是这些 helper 包含 fixture path、测试组织细节等，不应作为 crate 公共测试 API。

### Decision 6: 测试文件命名

新测试文件：
- `session.rs` — session 创建、revision 校验、transaction 幂等
- `snapshot.rs` — BOM、encoding、trailing newlines、invalid UTF-8
- `lossless.rs` — fixture 存在性、byte-for-byte roundtrip
- `patch.rs` — TextChange 重叠检测、patch 顺序无关、UTF-8 边界
- `position_map.rs` — 各种 offset 往返验证
- `line_ending_map.rs` — LF/CRLF 继承、mixed EOL、replacement
- `text_buffer.rs` — from_logical_text 合约
- `parse_index.rs` — block scanner、outline、StyleMap、large document policy、incremental

## Risks / Trade-offs

- **[Risk] Public API 破坏** → 子模块通过 mod.rs 的 `pub use` 保持与原文件完全一致的 re-export，已通过 document/mod.rs 验证
- **[Risk] 测试迁移遗漏** → 迁移后确认没有测试被静默删除，逐一核对测试函数名
- **[Risk] Phase A 和 Phase B 同时变动导致 diff 过大** → Phase A（生产代码）和 Phase B（测试）分 commit 提交
- **[Risk] Bug 在拆分过程中暴露** → 任何行为改变都要求单独补最小测试并在 PR 描述中列出；不是 M2.1 目标的 bug fix 应开新 issue