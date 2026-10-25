# Design

## Context

- WYSIWYG 由 Tiptap/ProseMirror 渲染，标题输出 `<h1>`~`<h6>`，节点自带 level 属性，但无需 JS 介入即可从标签名推导级别。
- 编辑器侧样式集中在 `src/styles/editor.css`（`.ProseMirror` 前缀）；导出主题由 `src/export/theme/css.ts` 生成，两者同用 h1~h6 选择器但作用域隔离。
- 编辑器容器 `.editor-container` 左右 padding 48px（`editor.css:10`），标记（约 18px 文字 + 10px 间距）空间充足。
- `h1` 现有样式：`font-size: 1.875em`（18px 基准 = 33.75px）、`padding-bottom: 0.3em`（≈10.1px）+ 底边线；垂直居中需补偿该 padding。
- 三主题 token（`--muted` 等）定义于 `src/styles/variables.css`，浅色 `#767676` / 深色 `#71717A` / 护眼 `#8B7355`。
- 交互原型与规范（`openspec/ui-design/index.html`、`SPEC.md`）已按确认设计先行更新，随本分支合入。

## Goals / Non-Goals

**Goals:**

- 纯 CSS 实现（零 TS/Rust/依赖改动），默认显示
- 标记完全隔离于文档模型、选区、剪贴板、round-trip 与导出产物
- 三主题自动适配（仅用设计 token）

**Non-Goals:**

- 设置开关（本期明确不做，留待后续 issue）
- 源码模式任何改动
- 大纲面板、状态栏等其他标题层级指示

## Decisions

1. **CSS 伪元素 + 按标签枚举 content**（`.ProseMirror h1::before { content: "H1" }` … h6），不用 `attr(data-level)`：
   标签名即级别真相，无需为节点补 data 属性，改动面最小。备选 `attr()` 需要编辑器初始化时写入属性，多一层维护。
2. **绝对定位到左侧留白**：标题 `position: relative`，`::before` 设 `right: calc(100% + 10px)`、`top: 50%`、`transform: translateY(-50%)`。标题文字从原位起排，版式零影响——这是用户确认的关键交互（区别于 Typora 内联方案）。标记选择器收窄为 `.ProseMirror > h1~h6`（文档直接子级）：引用块/列表项内的嵌套标题左侧没有留白，固定 10px 偏移会压在引用边线或项目符号上，故嵌套标题不显示标记。
3. **h1 垂直居中补偿**：`top: calc(50% - 5px)`（补偿 0.3em padding-bottom 的一半，1.875em×18px×0.15 ≈ 5px），保证标记对齐文字行而非整个盒子。
4. **字号统一 12px、无衬线字体栈**：不随标题字号缩放——与行号的视觉约定一致，避免 h1 标记过大、h6 标记过小。
5. **样式作用域仅编辑器侧**：只写入 `src/styles/editor.css`（`.ProseMirror` 前缀），导出主题生成器 `src/export/theme/css.ts` 零改动，从源头保证导出无标记。

## Risks / Trade-offs

- [左侧留白不足时标记溢出容器] → 容器 padding 48px > 所需 ~28px；若未来容器 padding 收窄，需同步调整标记间距（在 editor.css 相邻处注释说明）。
- [多行标题标记相对整块居中而非首行] → 单行标题（绝大多数）精确居中；多行标题整块居中仍可对应，若反馈不佳后续一行 CSS 可改为首行对齐。
- [伪元素样式对导出不可见依赖「伪元素不在 DOM」这一事实] → 以既有 docx/theme 测试 + 手工导出核验兜底（见 tasks）。
- [默认常显对偏好极简的用户是噪音] → 本期接受（用户确认）；后续如需开关，Settings 字段按 TS/Rust 双侧同步约定补充。

## Migration Plan

单文件 CSS 增量，随分支合入即生效；回滚 = revert 该段样式。无数据迁移。

## Open Questions

（无 —— 视觉方案已在原型确认）
