## MODIFIED Requirements

### Requirement: DOCX 文件生成
系统 SHALL 使用 OOXML 标准生成 `.docx` 文件，文件 MUST 是有效的 ZIP/OOXML 格式（以 `PK` 头开始，包含 `[Content_Types].xml` 和 `word/document.xml`）。在 WebView 环境中 SHALL 使用 `Packer.toArrayBuffer()` 生成文件，不得使用 `Packer.toBuffer()`（该 API 仅适用于 Node.js，在浏览器环境抛出 `nodebuffer is not supported` 错误）。

#### Scenario: 生成有效 DOCX 文件
- **WHEN** 用户选择 Word (.docx) 导出
- **THEN** 系统 SHALL 使用 `Packer.toArrayBuffer()` 生成文件
- **AND** 生成的 `Uint8Array` SHALL 以 `PK` 头开始
- **AND** 文件 SHALL 包含 `[Content_Types].xml` 和 `word/document.xml`

#### Scenario: DOCX 在 Word 中打开
- **WHEN** 用户在 Microsoft Word 中打开导出的 DOCX 文件
- **THEN** 文件 SHALL 不显示修复警告
- **AND** 内容 SHALL 正确显示

#### Scenario: DOCX 在 WebView 环境生成（新增）
- **WHEN** 系统在浏览器 WebView 环境中调用 `Packer.toArrayBuffer()`
- **THEN** SHALL 正常返回 `ArrayBuffer`，不抛出 `nodebuffer is not supported` 错误
- **AND** SHALL 通过 `save_binary_export` 命令保存为文件

### Requirement: DOCX 样式定义
系统 SHALL 使用 `ExportTheme`（通过 `exportThemeToDocxStyles()` 转换）定义 DOCX 样式，确保与编辑器主题一致。不再使用硬编码的 Times New Roman 12pt 等固定样式。

#### Scenario: 页面和字体样式
- **WHEN** 生成 DOCX 文件
- **THEN** 系统 SHALL 从 ExportTheme 获取字体栈（latin + eastAsia）、字号、行高、段落间距
- **AND** 页面大小 SHALL 为 A4
- **AND** 字体 SHALL 与编辑器当前主题一致

#### Scenario: 代码块样式
- **WHEN** 文档包含代码块
- **THEN** DOCX SHALL 使用 ExportTheme 中的代码块样式（等宽字体、背景色、内边距）

#### Scenario: 表格样式
- **WHEN** 文档包含表格
- **THEN** DOCX SHALL 使用 ExportTheme 中的表格样式（边框、单元格内边距、表头背景色）

#### Scenario: 标题样式
- **WHEN** 文档包含 H1–H6 标题
- **THEN** DOCX SHALL 使用 ExportTheme 中的标题层级样式（字号、颜色、间距）

## ADDED Requirements

### Requirement: DOCX 使用统一主题令牌
系统 SHALL 从 ExportTheme 生成所有 Word 样式，禁止在 `createDocxFromHtml()` 或 `docxExport.ts` 中硬编码任何样式值。

#### Scenario: 主题切换影响 DOCX
- **WHEN** 用户在 dark 主题下导出 DOCX
- **THEN** 生成的 Word 文档 SHALL 使用 dark 主题的颜色和字体
- **AND** 不得包含 light 主题的硬编码颜色值

### Requirement: DOCX 真实 Packer 测试
系统 SHALL 提供在浏览器兼容环境（jsdom 或 happy-dom）中运行的真实 `Packer.toArrayBuffer()` 测试，不再仅 mock 生成器函数。

#### Scenario: 真实 Packer 生成测试
- **WHEN** 运行 DOCX 导出测试
- **THEN** 测试 SHALL 调用真实的 `Packer.toArrayBuffer()` 生成 DOCX
- **AND** SHALL 解包验证 ZIP 结构、`[Content_Types].xml`、`word/document.xml` 存在
- **AND** SHALL 验证文件以 `PK` 头开始
