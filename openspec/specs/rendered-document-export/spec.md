# rendered-document-export Specification

## Purpose
定义渲染文档导出（PDF/Word/HTML）的快照机制、日志规范、导出格式入口和浏览器打印流程，确保导出操作不干扰编辑器实时状态。

## Requirements

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
系统 SHALL 在 PDF 导出/打印生命周期中输出结构化日志。事件名称与直接生成、打印流程的完整事件集合由 [`pdf-export`](../pdf-export/spec.md) 的“PDF 导出日志”要求定义；本规范限定打印流程事件须符合该集合。

#### Scenario: PDF 导出日志
- **WHEN** PDF 导出启动
- **THEN** 系统 SHALL 输出 `export.pdf.start` 日志
- **WHEN** 打印面板成功弹出
- **THEN** 系统 SHALL 输出 `export.pdf.print_invoked` 日志
- **WHEN** 打印完成或取消
- **THEN** 系统 SHALL 输出 `export.pdf.afterprint` 日志
- **WHEN** 导出超时或出错
- **THEN** 系统 SHALL 输出 `export.pdf.timeout` 或 `export.pdf.error` 日志

### Requirement: 导出格式入口
系统 SHALL 在现有工具栏或菜单中提供"导出"入口，列出"导出 PDF (.pdf)"、"打印…"、"Word (.docx)"和"HTML (.html)"四个选项。PDF 菜单项 SHALL 标注"导出 PDF (.pdf)"（直接生成文件），新增"打印…"选项保留系统打印流程，Word 菜单项 SHALL 标注为"Word (.docx)"。

#### Scenario: 用户选择 PDF 导出
- **WHEN** 用户从"导出"入口选择"导出 PDF (.pdf)"
- **THEN** 系统 SHALL 直接生成 PDF 文件（不打开打印面板）

#### Scenario: 用户选择打印
- **WHEN** 用户从"导出"入口选择"打印…"
- **THEN** 系统 SHALL 打开系统打印面板（保留现有打印流程）

#### Scenario: 用户选择 Word 导出
- **WHEN** 用户从"导出"入口选择"Word (.docx)"
- **THEN** 系统 SHALL 开始 DOCX 导出流程并打开原生保存对话框，默认文件名以 `.docx` 结尾

#### Scenario: 用户选择 HTML 导出
- **WHEN** 用户从"导出"入口选择"HTML (.html)"
- **THEN** 系统 SHALL 开始 HTML 导出流程并打开原生保存对话框，默认文件名以 `.html` 结尾

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
系统 SHALL 保留浏览器打印能力作为"打印…"功能的实现。在 macOS 上使用 Tauri `WebviewWindow::print()` 通过临时 WebviewWindow 打开系统打印面板；在 Windows/Linux 上使用顶层 WebView `window.print()`。此流程仅供"打印…"菜单项使用，不再承载"导出 PDF"功能。

#### Scenario: 触发打印（macOS）
- **WHEN** 用户在 macOS 上选择"打印…"
- **THEN** 系统 SHALL 创建临时 WebviewWindow 加载导出 HTML
- **AND** 等待 `document.fonts.ready` 和图片 `decode()` 完成后
- **AND** 调用 Tauri `WebviewWindow::print()` 打开系统打印面板

#### Scenario: 触发打印（Windows/Linux）
- **WHEN** 用户在 Windows 或 Linux 上选择"打印…"
- **THEN** 系统 SHALL 在顶层 WebView 中加载导出 HTML
- **AND** 调用 `window.print()` 打开系统打印面板

#### Scenario: PDF 打印流程不可用
- **WHEN** Tauri `WebviewWindow::print()` 调用失败
- **THEN** 系统 SHALL 显示用户可理解的导出失败提示
- **AND** 输出 `export.pdf.error` 日志

#### Scenario: PDF 生命周期管理
- **WHEN** 用户确认打印或取消打印
- **THEN** 系统 SHALL 通过 `afterprint` 事件或窗口关闭事件检测
- **AND** 清理临时 WebView 资源
- **AND** 输出 `export.pdf.afterprint` 日志

#### Scenario: PDF 超时保护
- **WHEN** 打印流程启动后 60 秒内未完成
- **THEN** 系统 SHALL 自动关闭打印流程
- **AND** 显示超时提示
- **AND** 输出 `export.pdf.timeout` 日志

#### Scenario: PDF 并发导出保护
- **WHEN** 用户在打印过程中再次点击"打印…"
- **THEN** 系统 SHALL 忽略重复请求
- **AND** 显示"正在导出中，请稍候"提示

