---
name: tiptap-load-undo-stack
description: 打开文件后一次 Cmd+Z 会回滚整个加载导致误判「文件已被修改」——setContent 进撤销栈，需 addToHistory:false
metadata: 
  node_type: memory
  type: project
  originSessionId: 677acb1c-05f9-4ebe-bc2b-20de716fc677
  modified: 2026-09-14T09:27:45.472Z
---

# Tiptap 加载事务进入撤销栈 → 首次撤销回滚整个文档

打开文件后**不做任何编辑**却提示「文件已被修改 / 未保存」的根因之一：`parseTipTapMarkdown`（`editor.markdown.adapter.ts`）里 `editor.commands.setContent(content, { contentType:'markdown' })` 产生的 `docChanged` 事务没有任何 meta，被 `StarterKit` 自带的 `UndoRedo`（`prosemirror-history`）记进撤销栈。于是打开后按一次 `Cmd+Z`，文档 JSON 从完整内容退回加载前的一个空段落，`getMarkdown()` 返回 `""`，reconcile 边界给出 `conflict:'semantic-mismatch'` → `dirty=true` + `reconcileError` → 各种「文件已被修改/未保存/保存被阻止」提示。

**Why:** 加载/准入/admission 校验全部是程序化事务（`withProgrammaticUpdate` 只挡 dirty 判定，不挡撤销栈）。

**How to apply:**
- 修复：`parseTipTapMarkdown` 里临时包装 `editor.view.dispatch`，对所有 `docChanged` 事务注入 `tr.setMeta('addToHistory', false)`，`finally` 恢复。
- 只对**真实 view** 包装（`editor.view` 存在才包装）；mock/harness 编辑器（`editorDouble` 无 `view`）走原路径，否则会抛 `markdown-parse-failed` 破坏一堆既有测试。
- 验证陷阱：用**完整生产扩展栈**（StarterKit + Placeholder + 表格 + Opaque + `createMarkdownExtension()` + tablePlugin）才会复现；只放 `StarterKit`+markdown 会让 `contentType:'markdown'` 解析路径不同，undo 行为不一致导致误判。
- 测试文件 `src/lib/editor.markdown.adapter.undo.test.ts`：加载后 `undo()` 文档保持；真实编辑插入+undo 只回退该编辑、不回退加载。

关联：[[troubleshooting-tiptap-markdown-serializer]]、[[table-wysiwyg-interaction]]。