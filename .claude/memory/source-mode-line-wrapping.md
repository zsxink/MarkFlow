---
name: source-mode-line-wrapping
description: 源码模式自动换行需求——用户补充的图床/优化讨论中的横向点
metadata:
  type: project
---

2026-08-30 路线图讨论（图床环节）用户补充：**源码模式下，如果编辑器设置里开启了自动换行（软换行），源码编辑应支持自动换行**（用户原话："源码模式下,如果编辑器的设置了自动换行这需要支持自动换行"）。

**背景判断:** 当前源码模式基于 CodeMirror 6。CodeMirror 的软换行由 `EditorView.lineWrapping` 扩展控制，若不开启则长行横向滚动。用户希望当设置里"自动换行"开启时，源码模式也跟随软换行（而非横向滚动）。

**How to apply:** 归入"优化/修复"候选清单。落地时需先确认 MarkFlow 设置面板里"自动换行"项当前作用范围（是否只影响 WYSIWYG/导出视图），再把它映射到 CodeMirror 的 `lineWrapping` 扩展（开启则 `EditorView.lineWrapping`，关闭则移除），保持与设置状态同步。相关：[[roadmap-optimization-boundary]]