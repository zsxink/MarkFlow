# wysiwyg-heading-level-marker Specification

## Purpose

WYSIWYG 编辑模式下，在顶层标题左侧留白显示小号级别标记（`H1`~`H6`），让用户一眼分辨标题层级；标记为纯呈现元素，不进入文档内容、选区、剪贴板与导出产物。

## Requirements

### Requirement: 标题级别标记显示

WYSIWYG 模式下，顶层标题（ProseMirror 文档的直接子级元素 h1~h6）MUST 在标题文字左侧留白显示对应级别标记（`H1`~`H6`）：小号次要文字色（12px 基准、`--muted`）、与标题行垂直居中，且 MUST NOT 占用正文版式宽度（绝对定位，标题文字位置与无标记时一致）。嵌套标题（位于引用块或列表项内的标题）不显示左侧留白标记。标记 MUST 默认显示，无需任何开启操作；本期 MUST NOT 提供设置开关。

#### Scenario: 六级标题各有标记

- **WHEN** WYSIWYG 文档包含 h1 至 h6 标题
- **THEN** 各标题左侧留白分别显示 `H1`、`H2`、`H3`、`H4`、`H5`、`H6` 标记

#### Scenario: 嵌套标题不显示留白标记

- **WHEN** 标题位于引用块或列表项内（如 `> # 标题`、`- # 标题`）
- **THEN** 不显示左侧留白级别标记，避免与引用边线或列表项目符号重叠

#### Scenario: 不占正文版式宽度

- **WHEN** 标记显示
- **THEN** 标题文字的换行位置与水平位置和无标记时一致（正文版式不变）

#### Scenario: 多行标题垂直居中

- **WHEN** 标题文字换行为多行
- **THEN** 标记相对标题块垂直居中，不与首行或末行错位到难以对应

#### Scenario: 三主题可读

- **WHEN** 编辑器处于浅色、深色或护眼主题
- **THEN** 标记使用该主题的次要文字色，与背景对比可读，无硬编码颜色

### Requirement: 标记不进入内容与选区

标记 MUST 以不进入文档模型的呈现方式实现，并 MUST 设置 `pointer-events: none` 与 `user-select: none`。标记内容 MUST NOT 出现在文本选区、复制/剪贴板内容或 Markdown 序列化 round-trip 产物中，MUST NOT 影响光标定位。

#### Scenario: 选区不含标记

- **WHEN** 用户从标题文字拖选到其他文本
- **THEN** 选中文本不含 `H1` 等标记字样

#### Scenario: 复制与 round-trip 不受影响

- **WHEN** 复制含标题的选区，或对文档执行 Markdown 序列化
- **THEN** 产物与无标记实现时逐字节一致

#### Scenario: 光标定位不受影响

- **WHEN** 用户点击标题左侧留白（标记所在区域）
- **THEN** 标记不接收指针事件，光标行为与无标记时一致

### Requirement: 源码模式与导出隔离

源码模式 MUST NOT 显示级别标记。标记样式 MUST 仅存在于编辑器侧样式，MUST NOT 进入导出主题 CSS；HTML/PDF/DOCX 导出产物 MUST NOT 包含标记文本或样式。

#### Scenario: 源码模式无标记

- **WHEN** 用户切换到源码模式
- **THEN** 编辑区不出现 `H1`~`H6` 级别标记（源码本身保留 `#` 原始标记）

#### Scenario: 导出产物无标记

- **WHEN** 对文档执行 HTML、PDF 或 DOCX 导出
- **THEN** 导出产物不包含标记文本，也不包含标记样式规则
