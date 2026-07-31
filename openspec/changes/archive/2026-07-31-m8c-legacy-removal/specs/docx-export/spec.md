## MODIFIED Requirements

### Requirement: DOCX 语义映射
系统 SHALL 将 Export IR blocks 和 assets 映射为 DOCX 语义结构，而非直接嵌入浏览器 HTML、读取 ProseMirror 节点树或克隆实时编辑器 DOM。

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

#### Scenario: DOCX 不读取实时 DOM
- **WHEN** 用户选择 Word (.docx) 导出
- **THEN** DOCX adapter SHALL consume Export IR or structures derived from Export IR
- **AND** MUST NOT read ProseMirror nodes, live editor DOM, or HTML snapshot as document truth
