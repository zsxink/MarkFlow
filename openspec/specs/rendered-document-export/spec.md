## Purpose

定义将当前 WYSIWYG 文档以 PDF、Word 和 HTML 格式导出的行为与约束。

## Requirements

### Requirement: Export format entry point
系统 SHALL 在现有工具栏或菜单中提供“导出”入口，列出 PDF、Word 和 HTML 三种格式，并对当前文档执行用户选择的导出操作。

#### Scenario: 用户选择一种导出格式
- **WHEN** 用户从“导出”入口选择 PDF、Word 或 HTML
- **THEN** 系统 SHALL 开始对应格式的导出流程

### Requirement: Rendered HTML export source
系统 SHALL 以当前 WYSIWYG 编辑器的渲染 HTML 为三种导出的共同内容来源，并保留其中已渲染的图片、图表和必要的样式。

#### Scenario: 文档含渲染内容
- **WHEN** 用户导出含图片、图表或格式化文本的当前文档
- **THEN** HTML 与 Word 导出 SHALL 包含当前渲染结果及其必要内联样式

### Requirement: HTML file export
系统 SHALL 通过原生保存对话框选择目标路径，并用现有文件写入能力将完整 HTML 文档写入用户选定的 `.html` 文件。

#### Scenario: HTML 导出成功
- **WHEN** 用户确认 HTML 导出的保存路径
- **THEN** 系统 SHALL 以当前文档名或 `untitled` 作为默认文件名并使用 `.html` 扩展名写入完整 HTML 内容

#### Scenario: 用户取消 HTML 保存
- **WHEN** 用户关闭或取消 HTML 导出的保存对话框
- **THEN** 系统 SHALL 不写入任何文件且不显示错误

#### Scenario: HTML 写入失败
- **WHEN** 已选择的 HTML 目标路径无法写入
- **THEN** 系统 SHALL 显示用户可理解的导出失败提示且不得报告导出成功

### Requirement: Word-compatible file export
系统 SHALL 将当前渲染 HTML 包装为带有 Word 所需命名空间与 MIME 元信息的 Word-compatible HTML，并通过原生保存对话框写入 `.doc` 文件；该实现 MUST NOT 引入新的运行时依赖。

#### Scenario: Word 导出成功
- **WHEN** 用户确认 Word 导出的保存路径
- **THEN** 系统 SHALL 以当前文档名或 `untitled` 作为默认文件名并使用 `.doc` 扩展名写入可由 Word 打开的包装 HTML

#### Scenario: 用户取消 Word 保存
- **WHEN** 用户关闭或取消 Word 导出的保存对话框
- **THEN** 系统 SHALL 不写入任何文件且不显示错误

#### Scenario: Word 写入失败
- **WHEN** 已选择的 Word 目标路径无法写入
- **THEN** 系统 SHALL 显示用户可理解的导出失败提示且不得报告导出成功

### Requirement: Browser-print PDF export
系统 SHALL 使用浏览器打印流程承载当前渲染 HTML 以供用户另存为 PDF，并应用专用打印样式；实现 MUST NOT 引入 jsPDF、pdf-lib 或其他 PDF 生成依赖。

#### Scenario: 触发 PDF 导出
- **WHEN** 用户选择 PDF 导出
- **THEN** 系统 SHALL 打开包含渲染文档与打印样式的打印流程并触发浏览器打印

#### Scenario: PDF 打印流程不可用
- **WHEN** 浏览器无法创建或打印导出文档
- **THEN** 系统 SHALL 显示用户可理解的导出失败提示
