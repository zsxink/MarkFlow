## ADDED Requirements

### Requirement: 导出快照
系统 SHALL 在导出前从编辑器 DOM 克隆创建只读导出快照，所有导出预处理操作（图片转换、编辑器标记清理）均在克隆上执行，不得修改编辑器实时 DOM。

#### Scenario: 克隆导出快照
- **WHEN** 用户触发任何格式的导出
- **THEN** 系统 SHALL 从编辑器 `renderedRoot` 克隆 DOM 子树
- **AND** 所有预处理操作在克隆 DOM 上执行

#### Scenario: 编辑器 DOM 不受影响
- **WHEN** 导出流程包含图片转换或标记清理
- **THEN** 编辑器的实时 DOM SHALL 保持不变
- **AND** 文档的 dirty 状态 SHALL 不变

#### Scenario: 清理编辑器标记
- **WHEN** 系统创建导出快照
- **THEN** SHALL 移除 `contenteditable`、`draggable`、NodeView 控件和编辑器专用 CSS 类名

### Requirement: PDF 导出日志
系统 SHALL 在 PDF 导出生命周期中输出结构化日志事件：`export.pdf.start`、`export.pdf.ready`、`export.pdf.print_invoked`、`export.pdf.afterprint`、`export.pdf.timeout`、`export.pdf.error`。

#### Scenario: PDF 导出日志
- **WHEN** PDF 导出启动
- **THEN** 系统 SHALL 输出 `export.pdf.start` 日志
- **WHEN** 打印面板成功弹出
- **THEN** 系统 SHALL 输出 `export.pdf.print_invoked` 日志
- **WHEN** 打印完成或取消
- **THEN** 系统 SHALL 输出 `export.pdf.afterprint` 日志
- **WHEN** 导出超时或出错
- **THEN** 系统 SHALL 输出 `export.pdf.timeout` 或 `export.pdf.error` 日志

## MODIFIED Requirements

### Requirement: 导出格式入口
系统 SHALL 在现有工具栏或菜单中提供"导出"入口，列出 PDF、Word 和 HTML 三种格式，并对当前文档执行用户选择的导出操作。PDF 菜单项 SHALL 标注"打印 / 另存为 PDF"，Word 菜单项 SHALL 标注为"Word (.docx)"。

#### Scenario: 用户选择 PDF 导出
- **WHEN** 用户从"导出"入口选择"打印 / 另存为 PDF"
- **THEN** 系统 SHALL 开始 PDF 导出流程并打开系统打印面板

#### Scenario: 用户选择 Word 导出
- **WHEN** 用户从"导出"入口选择"Word (.docx)"
- **THEN** 系统 SHALL 开始 DOCX 导出流程并打开原生保存对话框，默认文件名以 `.docx` 结尾

### Requirement: 渲染 HTML 导出源
系统 SHALL 以当前 WYSIWYG 编辑器的渲染 HTML 为三种导出的共同内容来源。导出前 SHALL 从编辑器 DOM 克隆创建只读快照，在克隆上执行图片转换、编辑器标记清理和图表渲染，所有预处理不得修改编辑器实时 DOM。

#### Scenario: 文档含渲染内容（修改）
- **WHEN** 用户导出含图片、图表或格式化文本的当前文档
- **THEN** 系统 SHALL 从编辑器 DOM 克隆子树的只读快照
- **AND** 在快照上执行图片转换和图表处理

#### Scenario: 文档含本地图片（修改）
- **WHEN** 用户导出含本地图片（asset 协议 URL）的文档
- **THEN** 系统 SHALL 在导出快照上将 asset URL 转换为 data URI
- **AND** 编辑器中的原始 asset URL SHALL 保持不变

#### Scenario: 源码模式下导出
- **WHEN** 用户在源码（CodeMirror）模式下触发导出
- **THEN** 系统 SHALL 先将最新源码内容同步到 WYSIWYG 编辑器，再创建导出快照并执行导出

### Requirement: 浏览器打印 PDF 导出
系统 SHALL 使用 Tauri 原生打印能力或浏览器打印流程承载当前渲染 HTML 以供用户另存为 PDF，并应用专用打印样式。在 macOS 上 SHALL 使用 Tauri 2.11+ `WebviewWindow::print()` 通过临时 WebviewWindow 打开系统打印面板；在 Windows/Linux 上 SHALL 使用顶层 WebView `window.print()`。实现 MUST NOT 引入 jsPDF、pdf-lib 或其他 PDF 生成依赖。打印流程 SHALL 使用 `beforeprint`/`afterprint`、窗口关闭和超时事件管理生命周期，不得仅凭 `print()` 返回值判断成功。

#### Scenario: 触发 PDF 导出（macOS）
- **WHEN** 用户在 macOS 上选择 PDF 导出
- **THEN** 系统 SHALL 创建临时 WebviewWindow 加载导出 HTML
- **AND** 等待 `document.fonts.ready` 和图片 `decode()` 完成后
- **AND** 调用 Tauri `WebviewWindow::print()` 打开系统打印面板

#### Scenario: 触发 PDF 导出（Windows/Linux）
- **WHEN** 用户在 Windows 或 Linux 上选择 PDF 导出
- **THEN** 系统 SHALL 在顶层 WebView 中加载导出 HTML
- **AND** 调用 `window.print()` 打开系统打印面板

#### Scenario: PDF 打印流程不可用（修改）
- **WHEN** Tauri `WebviewWindow::print()` 调用失败
- **THEN** 系统 SHALL 显示用户可理解的导出失败提示
- **AND** 输出 `export.pdf.error` 日志

#### Scenario: PDF 生命周期管理
- **WHEN** 用户确认打印或取消打印
- **THEN** 系统 SHALL 通过 `afterprint` 事件或窗口关闭事件检测
- **AND** 清理临时 WebView 资源
- **AND** 输出 `export.pdf.afterprint` 日志

#### Scenario: PDF 超时保护
- **WHEN** PDF 导出启动后 60 秒内未完成打印
- **THEN** 系统 SHALL 自动关闭打印流程
- **AND** 显示超时提示
- **AND** 输出 `export.pdf.timeout` 日志

#### Scenario: PDF 并发导出保护（修改）
- **WHEN** 用户在 PDF 导出过程中再次点击导出
- **THEN** 系统 SHALL 忽略重复请求
- **AND** 显示"正在导出中，请稍候"提示

## REMOVED Requirements

### Requirement: Word 兼容文件导出
**Reason**: 由原生 OOXML DOCX 导出替代。HTML 包装的 `.doc` 在 Word/WPS 中排版严重失真，且不支持图片、图表等语义结构。
**Migration**: 用户现应使用"Word (.docx)"菜单项导出真正的 DOCX 文件。

### Requirement: Word 兼容文件导出（子场景）
**Reason**: 同上。
**Migration**: 导出文件名后缀从 `.doc` 改为 `.docx`。
