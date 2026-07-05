---
name: tiptap-markdown-serializer-limits
description: tiptap-markdown 序列化器的缺陷与 defense-in-depth 策略
metadata:
  type: reference
---

## tiptap-markdown 序列化器的已知限制

tiptap-markdown v0.8.10 的 `MarkdownSerializer` 在 `MarkdownSerializer.serialize()` 中遍历 ProseMirror doc 的所有子节点，为每个节点类型查找对应的 `toMarkdown` 序列化函数。

### HTMLNode fallback 的陷阱

- 当 `html: false`（MarkFlow 当前配置），无专用序列化器的节点会输出 `[nodeName]` 占位符，静默丢失内容
- 所有 schema 节点类型默认使用 HTMLNode 序列化器，再被有 `storage.markdown.serialize` 的扩展覆盖
- `tableRow`/`tableCell`/`tableHeader` 没有独立序列化器（由 Table 序列化器内部处理），但如果 Table 的 `isMarkdownSerializable()` 返回 false，整个表格退化为 HTML fallback

### 防御策略

1. **`extractDocAsFallback(doc)`** — 在 `switchToSource()` 中作为兜底，用 `doc.forEach()` 手动提取全部内容的 textContent，不依赖 tiptap-markdown 序列化器
2. **`checkSerializationIntegrity(docText, markdown)`** — 纯函数，比较 doc textContent 行数与序列化输出的行数，当输出行数 < doc 行数的 20% 时判定截断
3. **`logException` + `showToast` 告警** — 序列化异常时通知用户

**How to apply:** 如果遇到新的序列化截断场景，优先检查：
1. 该节点类型是否有对应的 tiptap-markdown 扩展（`extensions/index.js`）
2. 该扩展的 `storage.markdown.serialize` 是否被正确配置
3. 如果不是已知节点类型，需要在 `extractDocAsFallback()` 中添加对应的处理分支
