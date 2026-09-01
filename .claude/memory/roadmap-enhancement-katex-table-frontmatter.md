---
name: roadmap-enhancement-katex-table-frontmatter
description: 路线图讨论中确定的"增强"方向主攻集合
metadata:
  type: project
---

2026-08-30 路线图讨论，增强方向确定主攻三样（已定档）：
1. **KaTeX 数学公式** — 行内 `$..$` 与块级 `$$..$$`。**复用现有 Mermaid/PlantUML 惰性渲染架构**（静态图块 + 双击回源码编辑），不侵入 Tiptap 内核。markdown-it 解析需配套 `markdown-it-texmath` 类插件。
2. **表格增强** — GFM 表格 **WYSIWYG 内实时编辑**（点选/Tab 导航单元格、增删行列、对齐，对标 Typora）。成本中高，需 Tiptap node 扩展。
3. **frontmatter 编辑** — YAML frontmatter **语法高亮 + 可视化编辑面板**（字段表单/增删字段，实时同步 YAML）。M0 spike 已验证 FrontMatter 仅限安全 top-level scalar 编辑。

**How to apply:** 后续对"增强"方向提具体方案时，优先围绕这三项展开；用户未选中的方向（沉浸写作三模式、左右分屏、仅源码表格）暂缓，除非用户重新提出。相关：[[roadmap-direction-ignore-refactor]]