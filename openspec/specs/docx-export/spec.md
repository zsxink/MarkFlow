# docx-export Specification

## Purpose
定义 DOCX 导出的 OOXML 格式要求、语义映射规则、样式定义和导出入口。

## Requirements

### Requirement: DOCX 文件生成
系统 SHALL 使用 OOXML 标准生成 `.docx` 文件，文件 MUST 是有效的 ZIP/OOXML 格式（以 `PK` 头开始，包含 `[Content_Types].xml` 和 `word/document.xml`）。

#### Scenario: 生成有效 DOCX 文件
- **WHEN** 用户选择 Word (.docx) 导出
- **THEN** 系统 SHALL 生成以 `PK` 头开始的 ZIP/OOXML 文件
- **AND** 文件 SHALL 包含 `[Content_Types].xml` 和 `word/document.xml`

#### Scenario: DOCX 在 Word 中打开
- **WHEN** 用户在 Microsoft Word 中打开导出的 DOCX 文件
- **THEN** 文件 SHALL 不显示修复警告
- **AND** 内容 SHALL 正确显示

### Requirement: DOCX 语义映射
系统 SHALL 将 ProseMirror 节点树映射为 DOCX 语义结构，而非直接嵌入浏览器 HTML。

#### Scenario: 段落映射
- **WHEN** 文档包含普通段落文本
- **THEN** DOCX SHALL 使用 Word 段落样式，保留字体、字号和行距

#### Scenario: 标题映射
- **WHEN** 文档包含 H1–H6 标题
- **THEN** DOCX SHALL 使用对应的 Word 标题样式（Heading 1–6）

#### Scenario: 文本标记映射
- **WHEN** 文档包含加粗、斜体、删除线、行内代码、链接
- **THEN** DOCX SHALL 使用对应的 Word 字符格式（Bold/Italic/Strikethrough/Code/ Hyperlink）

#### Scenario: 列表映射
- **WHEN** 文档包含有序列表、无序列表或任务列表
- **THEN** DOCX SHALL 使用 Word 列表编号/项目符号格式
- **AND** 任务列表 SHALL 使用复选框字符

#### Scenario: 引用和代码块映射
- **WHEN** 文档包含块引用或代码块
- **THEN** DOCX SHALL 使用 Word 样式（引用用缩进+斜体，代码块用等宽字体+背景色）

#### Scenario: 表格映射
- **WHEN** 文档包含表格
- **THEN** DOCX SHALL 使用 Word 表格，保留边框和单元格对齐

#### Scenario: 图片映射
- **WHEN** 文档包含图片
- **THEN** DOCX SHALL 在文档中嵌入图片，保留宽高比和位置

### Requirement: DOCX 样式定义
系统 SHALL 在 DOCX 中定义显式 Word 样式，确保跨平台排版一致性。

#### Scenario: 页面和字体样式
- **WHEN** 生成 DOCX 文件
- **THEN** 系统 SHALL 定义页面大小（A4）、边距、中英文字体、字号、段落间距

#### Scenario: 代码块样式
- **WHEN** 文档包含代码块
- **THEN** DOCX SHALL 使用等宽字体、浅色背景色、适当内边距

#### Scenario: 表格样式
- **WHEN** 文档包含表格
- **THEN** DOCX SHALL 设置表格边框、单元格内边距、表头背景色

### Requirement: DOCX 导出入口
系统 SHALL 在导出菜单中提供 "Word (.docx)" 选项，默认文件名为 `{文档名}.docx`。

#### Scenario: 选择 DOCX 导出
- **WHEN** 用户从导出菜单中选择 "Word (.docx)"
- **THEN** 系统 SHALL 打开原生保存对话框，默认文件名为 `{文档名}.docx`

#### Scenario: 用户取消 DOCX 保存
- **WHEN** 用户关闭或取消 DOCX 保存对话框
- **THEN** 系统 SHALL 不写入任何文件且不显示错误

#### Scenario: DOCX 写入失败
- **WHEN** 已选择的 DOCX 目标路径无法写入
- **THEN** 系统 SHALL 显示用户可理解的导出失败提示且不得报告导出成功

### Requirement: DOCX 图片和图表支持
系统 SHALL 在 DOCX 中嵌入图片和图表（Mermaid/PlantUML 转 PNG），保留 alt 文本。

#### Scenario: 图片嵌入
- **WHEN** 文档包含图片
- **THEN** DOCX SHALL 在 `word/media/` 中嵌入图片文件
- **AND** 在文档中引用该图片，保留宽高比

#### Scenario: 图表转 PNG
- **WHEN** 文档包含 Mermaid 或 PlantUML 图表
- **THEN** 系统 SHALL 将 SVG 渲染为 Canvas 并导出为 PNG
- **AND** 在 DOCX 中嵌入该 PNG 图片
