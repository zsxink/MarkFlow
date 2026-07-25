## Context

ProseMirror 的 Document Model 是语义树（paragraph、heading 等），不是文本缓冲区。它的 markdown serializer（`prosemirror-markdown`）基于 `flushClose` 机制：每个 block 渲染完后调用 `closeBlock` 标记待关闭，实际的换行符追加发生在下一个 block 的 `write()` 调用时。文档末尾的最后一个 block 后面没有 `write()` 调用，所以永远不会触发尾部换行输出。

MarkFlow 现有的脏检测比对逻辑是：
- 打开文件时，原始内容存入 `lastPersistedMarkdown`
- PM 序列化输出（不含尾部换行）与 `lastPersistedMarkdown`（含尾部换行）比较 → 不等 → dirty

这导致用户仅打开文件就被标记为 dirty，自动保存进一步使文件丢失尾部换行符。

## Goals / Non-Goals

**Goals:**
- 打开文件后不做任何编辑，脏状态应为 false
- 保存时恢复文件原有的尾部换行符数量
- 不改动 ProseMirror Document Model

**Non-Goals:**
- 不实现完整的 lossless Markdown 编辑（行尾空格、列表符号风格等不在本次范围内）
- 不改动 `tiptap-markdown` 或 `prosemirror-markdown` 库代码

## Decisions

1. **元数据方案而非序列器修补**
   - 方案 A（已选）：在 `documentState` 中存 `trailingNewlines` 计数，`setMarkdown` 时捕获，`getMarkdown` 时追加
   - 方案 B：hack `flushClose` 触发尾部换行 —— 需要动 node_modules，不可维护
   - 方案 C：在 ProseMirror doc 末尾插空 paragraph 来触发 flushClose —— 引入无用节点
   - **理由**：元数据方案最轻量，改动集中在 3 个函数内，不影响 PM schema

2. **脏比对统一 strip 尾部换行**
   - `lastPersistedMarkdown` 始终存无尾部换行的版本
   - 所有比较点的两侧各自 strip，保证一致性
   - 这样无论是 PM 序列器输出（无尾部换行）还是 CM6 内容（可能有尾部换行），比较都是公平的

## Risks / Trade-offs

- [风险] 用户如果在 source mode 手动键入了尾部换行，`getMarkdown` 会直接使用 CM6 原文而非元数据 —— 这是预期行为，元数据只在 CM6 内容不含尾部换行时作为后备
- [风险] 切换模式时（WYSIWYG↔source），`trailingNewlines` 不会更新 —— 这也是预期行为，元数据代表文件打开时的原始状态，用户主动编辑的内容自动被 CM6 或 PM 保留
