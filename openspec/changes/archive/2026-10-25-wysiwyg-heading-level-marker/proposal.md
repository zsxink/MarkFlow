# Proposal

## Why

WYSIWYG 模式下各级标题字号接近（h4~h6 与正文仅差 0~10%），用户难以一眼分辨当前标题层级，文档结构感知差（issue #409）。参考 Typora「显示标题级别」：在标题左侧留白以小号浅色字显示 `H1`~`H6` 标记。交互原型（`openspec/ui-design/`）中已确认方案 A（灰字、左侧留白、垂直居中）。

## What Changes

- WYSIWYG 编辑区（`.ProseMirror`）的顶层标题（文档直接子级 h1~h6）左侧留白显示对应级别标记（`H1`~`H6`）；引用块/列表项内的嵌套标题不显示标记，避免与引用边线或项目符号重叠：
  - 小号灰字（12px、`--muted`、无衬线），与标题行垂直居中，绝对定位在版心之外、不占正文版式宽度
  - 默认显示；**本期不提供设置开关**（与 issue #409 验收标准第 4 条的偏离已由用户确认，开关留待后续按需补充）
- 标记用纯 CSS 伪元素实现：不进入 ProseMirror 文档模型、文本选区、剪贴板与序列化 round-trip；`pointer-events: none` + `user-select: none`
- 样式仅存在于编辑器侧 CSS（`src/styles/editor.css`），不进入导出主题（`src/export/theme/css.ts`）；源码模式不显示标记
- 同步 `openspec/ui-design/` 原型与规范（已按确认设计先行更新）

## Capabilities

### New Capabilities

- `wysiwyg-heading-level-marker`: WYSIWYG 标题级别标记的显示规则、选区/剪贴板/round-trip 隔离、源码模式与导出隔离

### Modified Capabilities

（无 —— 现有 round-trip、导出类 spec 的需求不变，本能力以场景约束不得破坏它们）

## Impact

- **代码**：仅 `src/styles/editor.css` 新增一段编辑器侧样式；另加一条防回归样式契约测试（`src/__tests__/heading-marker-styles.test.ts`，直读 CSS 断言关键规则）；无 TS/Rust 业务改动、无新依赖、无设置字段
- **导出**：HTML/PDF/DOCX 导出路径读 DOM 与导出主题 CSS，伪元素不在 DOM 中，产物不受影响（tasks 中以既有测试核验）
- **原型/规范**：`openspec/ui-design/index.html` 与 `SPEC.md`（工作区已更新，随本分支合入）
- **风险**：编辑器容器 `.editor-container` 左右 padding 48px，标记约占 28px，空间充足
