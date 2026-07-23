## ADDED Requirements

### Requirement: ExportTheme 数据模型
系统 SHALL 定义 `ExportTheme` 接口作为三种导出格式（HTML/PDF/DOCX）的唯一样式来源。ExportTheme SHALL 包含：页面尺寸、内容宽度、页边距、字体栈（latin + eastAsia）、正文字号、行高、颜色（含 light/dark/sepia 主题变体）、标题层级样式（H1–H6）、代码块样式、引用样式、列表样式、表格样式、图片规则。

#### Scenario: 主题切换时 ExportTheme 同步更新
- **WHEN** 用户切换编辑器主题（light/dark/sepia）
- **THEN** ExportTheme 的颜色变体 SHALL 随之切换
- **AND** HTML/PDF/DOCX 导出 SHALL 使用切换后的颜色

#### Scenario: ExportTheme 覆盖所有内容样式
- **WHEN** 系统生成 ExportTheme
- **THEN** ExportTheme SHALL 包含编辑器 `.ProseMirror ...` 选择器下所有内容样式的等价定义
- **AND** 不得有任何格式继续硬编码样式值

### Requirement: ExportTheme 到 CSS 转换
系统 SHALL 提供 `exportThemeToCss(theme: ExportTheme)` 函数，将 ExportTheme 转换为可内联的 CSS 文本，包含 CSS variables 声明和 `.ProseMirror` 内容选择器规则。

#### Scenario: 生成包含 CSS variables 的 CSS
- **WHEN** 调用 `exportThemeToCss(theme)`
- **THEN** 输出 SHALL 包含 `:root { --font-body: ...; --font-size: ...; ... }` 声明
- **AND** 输出 SHALL 包含 `.ProseMirror { font-family: var(--font-body); font-size: var(--font-size); ... }` 规则

#### Scenario: 生成打印专用 CSS
- **WHEN** 调用 `exportThemeToCss(theme, { print: true })`
- **THEN** 输出 SHALL 额外包含 `@page` 规则、分页规则和 `print-color-adjust: exact`

### Requirement: ExportTheme 到 Word styles 转换
系统 SHALL 提供 `exportThemeToDocxStyles(theme: ExportTheme)` 函数，将 ExportTheme 转换为 `docx` 库的 IStylesOptions，包含段落样式、字符样式和表格样式。

#### Scenario: 生成 Word 正文样式
- **WHEN** 调用 `exportThemeToDocxStyles(theme)`
- **THEN** 输出 SHALL 包含 Normal 样式，字体为 theme.latin.font + theme.eastAsia.font，字号为 theme.body.fontSize
- **AND** 段落间距和行距 SHALL 与 theme.body 一致

#### Scenario: 生成 Word 标题样式
- **WHEN** 调用 `exportThemeToDocxStyles(theme)`
- **THEN** 输出 SHALL 包含 Heading 1–6 样式，字号和颜色 SHALL 与 theme.headings 对应层级一致

### Requirement: 编辑器主题到 ExportTheme 映射
系统 SHALL 从编辑器当前 CSS variables 和 `data-theme` 属性自动构建 ExportTheme 实例，确保导出主题与编辑器视觉一致。

#### Scenario: 从 light 主题构建 ExportTheme
- **WHEN** 编辑器 `data-theme="light"` 且 CSS variables 为默认值
- **THEN** ExportTheme SHALL 使用 light 主题的颜色值（正文色 #1f2937、背景色 #ffffff 等）

#### Scenario: 从 dark 主题构建 ExportTheme
- **WHEN** 编辑器 `data-theme="dark"`
- **THEN** ExportTheme SHALL 使用 dark 主题的颜色值（正文色 #e5e7eb、背景色 #1a1a2e 等）
