# R3A：Task 与 Code Fence Widgets

## 目标

先用同步、低副作用 widget 验证统一 StructuredWidget contract。

## 范围

- OpenSpec tasks：`8.1`、`8.7-8.8`，以及 `8.12` 的 Task/Code 部分。
- 主要区域：widget protocol、Core task/code commands、focus 与 keyboard adapter。

## 统一 Contract

- identity：session、document、revision、block id、source range。
- lifecycle：mount、update、focus、commit、cancel、reveal source、destroy。
- draft 不是 document truth；commit 只通过 Core command。
- stale revision 丢弃，不隐式迁移 draft。
- keyboard-only、accessible name、focus return、exact source fallback。

## 实现

1. Task checkbox toggle、Undo、focus、marker case/spacing preservation。
2. Code content 保持在 CodeMirror document。
3. Code language selector 走 Core command，highlight lazy load。
4. 保留 fence char/length/indent/info/EOL/trailing newline。
5. 定义 Enter/Escape/arrow 的 deterministic exit。

## 验收

- edit/commit/cancel/Undo/reveal/keyboard/fallback 全通过。
- Task marker 和 code trivia 未编辑范围 byte-preserving。
- widget 销毁后不响应 late event。
- 人工执行 `M-R3-01`、`M-R3-02`。

## 回滚

Task/Code 分别按 block 回退 exact source。

## 前后依赖

- 前置：[R2B](./r2b-live-preview.md)
- 后续：[R3B](./r3b-table-image-widgets.md)

