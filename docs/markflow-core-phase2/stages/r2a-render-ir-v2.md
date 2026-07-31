# R2A：Concrete Syntax 与 Render IR v2

## 目标

提供 lossless、revision-bound、viewport-aware 的生产语义模型。

## 范围

- OpenSpec tasks：`6.1-6.9`。
- 主要区域：`markflow-core` parser/source map、StyleMap、Render IR、Bridge DTO、benchmarks。

## IR v2 Contract

- schema/protocol version；
- binding/session/document/revision/request/source hash/viewport；
- stable block id 与 parent/children；
- source/content/marker ranges；
- semantic tokens 与 StyleMap；
- widget/fallback descriptor；
- invalidated ranges、size class、diagnostics。

## 实现批次

1. block tree：paragraph、heading、break、quote、nested list/task、fence。
2. inline：strong、emphasis、strike、code、link/autolink/reference/image。
3. descriptors：table、FrontMatter、image、diagram、comment、raw HTML、unknown。
4. stable identity、局部 invalidation、v1/v2 negotiation、unsupported fallback。
5. UTF-16、emoji、malformed、revision mismatch 和 payload benchmark。

## 验收

- 所有 range 可映射回精确 source。
- 未编辑 trivia/StyleMap 不丢失。
- boundary-changing edit 扩大 reparse 但不产生错误旧节点。
- v1/v2 不兼容时明确回退 Source。
- payload、serialization、cancel、projection latency 达到 A7 budget。
- 人工执行 `M-R2-01`、`M-R2-02`。

## 回滚

按 schema negotiation 回到 IR v1 或 exact Source；不得把 v2 DTO 部分应用到 v1 文档。

## 前后依赖

- 前置：[R0B](./r0b-parser-bridge-spike.md)、[R1B](./r1b-command-history.md)
- 后续：[R2B](./r2b-live-preview.md)

