## 1. 元数据字段定义

- [x] 1.1 在 `editor.state.ts` 的 `documentState` 中新增 `trailingNewlines: 0` 字段
- [x] 1.2 在 `editor.state.test.ts` 的 `beforeEach` 中重置 `trailingNewlines = 0`

## 2. 捕获与恢复逻辑

- [x] 2.1 在 `editor.ts` 中实现 `stripTrailingNewlines()` 工具函数
- [x] 2.2 在 `setMarkdown()` 中从原始内容捕获尾部换行符数量并剥离后传给 ProseMirror
- [x] 2.3 在 `getMarkdown()` 中从元数据恢复尾部换行符（分别处理 source mode 和 WYSIWYG mode）

## 3. 脏检测修正

- [x] 3.1 在 `markDocumentPersisted()` 中统一 strip 尾部换行符后存储
- [x] 3.2 所有脏比对的两侧各自 strip 尾部换行符，保持一致性
