# R0B：Parser 与 Bridge 可行性 Spike

## 目标

在 Render IR、投影和单一 surface 扩建前，消除 parser/source-map 与真实 Tauri IPC 两个根风险。

## 范围

- OpenSpec tasks：`2.1-2.9`。
- 主要区域：`markflow-core` spike/fixture/benchmark、`src/lib/coreBridge.ts`、
  `src-tauri/src/commands/core_bridge.rs`、desktop contract harness。

## Parser 实现

1. 用同一 fixture 比较 `markdown-rs`、`pulldown-cmark`、tree-sitter Markdown 和现有 ParseIndex。
2. 输出 block/inline kind、source/content/marker ranges、trivia、unknown、diagnostics、
   耗时、峰值内存和二进制增量。
3. 用 immutable source slice 验证所有 range，随机 Unicode boundary 做 property test。
4. 分别测 full parse、局部编辑后 reparse 和 viewport query。
5. lossless/range 任一失败即淘汰；性能与生态只在合格 candidate 中比较。
6. ADR 明确“语义 parser + concrete source map”或“existing ParseIndex 补强”的边界。

## Bridge 实现

1. 从真实 Tauri dispatcher 调用全部 Core commands，不直接调用 Rust function，不 mock `invoke`。
2. 覆盖 camelCase top-level args、nested DTO、optional/null、protocol version 和 stable error。
3. 覆盖 render、patch、flush、resync、save、reload、close、export、command、Undo/Redo。
4. 覆盖取消、重复 transaction、A/B session、窗口关闭后的 stale response。

## 自动验收

- unchanged source byte-for-byte。
- CJK/emoji/nested/malformed ranges 对应精确 source。
- 所有真实 invoke 无 missing argument。
- render/flush/save/close 真实桌面日志无协议错误。
- Parser ADR A1 与 Bridge ADR A2 通过。

## 人工验收

执行 `M-R0-04` 至 `M-R0-06`。

## 退出与回滚

- No-Go：所有 candidate 均无法提供 lossless range 时，停止 R2A，先设计独立 token/source-map。
- 回滚：spike 依赖不进入产品 binary；Bridge contract fix 可独立保留。

## 前后依赖

- 前置：[R0A](./r0a-baseline-governance.md)
- 后续：[R0C](./r0c-projection-correctness.md)、[R2A](./r2a-render-ir-v2.md)

