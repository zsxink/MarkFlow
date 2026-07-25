## Why

打开末尾有换行符的 Markdown 文件时，ProseMirror 序列化输出不包含尾部换行符，导致脏检测误判为有改动，进而触发自动保存将尾部换行符吃掉了。这是一个功能性 bug：用户只打开文件看了眼，文件就被改写了。

## What Changes

- 新增 `documentState.trailingNewlines` 元数据字段，在打开文件时从原始内容捕获尾部换行符数量
- 修改 `getMarkdown()` 在输出时从元数据恢复尾部换行符
- 所有脏比对两侧统一剥离尾部换行符，保证比较一致性
- 不改变 ProseMirror Document Model，不涉及同步/异步 API 变更

## Capabilities

### New Capabilities

- `trailing-newlines-preservation`: 在 ProseMirror Document 与磁盘文件之间，通过元数据层保留尾部换行符，保证保存往返无损

### Modified Capabilities

无（本变更不改变任何已有规范的行为要求，仅修复内部数据流程）

## Impact

- `src/lib/editor.state.ts`: `documentState` 新增 `trailingNewlines` 字段
- `src/lib/editor.ts`: `setMarkdown` 捕获尾部换行符，`getMarkdown` 追加回去，`markDocumentPersisted` 统一 strip 后比较
- `src/lib/editor.state.test.ts`: 重置 `trailingNewlines` 字段
