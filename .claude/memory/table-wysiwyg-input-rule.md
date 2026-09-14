---
name: table-wysiwyg-input-rule
description: MarkdownSafeTable 表格输入规则（Enter 转表格）的关键实现陷阱——InputRule 匹配文本只含当前段落、位置计算与空续段处理
metadata:
  type: project
---

# GFM 表格「输入即表格」InputRule 实现陷阱

`MarkdownSafeTable.addInputRules()` 把「表头+分隔行+数据行+回车」转成表格节点。实现中三个大坑：

**1. InputRule 匹配文本只含当前 textblock。** `run$1` 用 `getTextContentFromNodes($from) + text` 做匹配，而真实 Enter 已把每行切成独立段落，所以正则在 Enter 时只能匹配到**最后一行**（`handleKeyDown` 触发 `text="\n"`）。必须在 handler 里**向后遍历兄弟段落**重新拼装完整序列——不能在单段落里匹配多行。

**2. 兄弟遍历必须先 `resolve(start)`（非 `start-1`）。** 段落 node start 是一个 doc 位置；`resolve(start)` 落在节点边界（parentOffset 0），`$at.parent` 是 doc、`index()` 是当前块的子索引,才能取 `child(index-1)`。`resolve(start-1)` 会落进**前一段落内部**（一个 textblock），`parent.isTextblock` 直接 break——这是最初「只收集到 1 块」的根因。

**3. 忽略因子选择：`$r.before($r.depth)`（node start）而非 `$r.start()`（content start）。** 表头段落 content start=1 但 node start=0；用 content start 会在表格前留下杂段落。`tableEnd = lastBlock.start + lastBlock.node.nodeSize` 恰好等于 `doc.content.size` 时替换干净。

**4. 触发时机：只在 `$r.depth === 1` + 光标在段落末尾 + trailing `\n` 匹配时转。** 其余情况返回 null——避免在表格内、列表里、或正在输入的 `|` 段落中间误触发。文本节点必须用 `schema.text(cellText)` 创建（`NodeType.create` 拒绝构造 text 节点）。

关键验证：真实 Enter 会创建空续段，所以「3 行输入 + 3 次 Enter」在第 3 次 Enter 时就能转（不是第 4 次）。

关联：[[troubleshooting-tiptap-markdown-serializer]]（同一表格序列化管线的其他坑）、[[roadmap-enhancement-katex-table-frontmatter]]。