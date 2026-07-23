## MODIFIED Requirements

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
