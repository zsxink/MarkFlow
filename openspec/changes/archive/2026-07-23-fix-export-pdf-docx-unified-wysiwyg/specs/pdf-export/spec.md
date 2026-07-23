## ADDED Requirements

### Requirement: 平台原生 PDF 生成
系统 SHALL 使用平台 WebView 原生 API 直接生成 PDF 文件，不依赖系统打印面板或 PDF 打印机。

#### Scenario: macOS PDF 生成
- **WHEN** 用户在 macOS 上选择"导出 PDF"
- **THEN** 系统 SHALL 使用 `WKWebView.createPDF(configuration:completionHandler:)` 生成 PDF
- **AND** 不经过系统打印面板

#### Scenario: Windows PDF 生成
- **WHEN** 用户在 Windows 上选择"导出 PDF"
- **THEN** 系统 SHALL 使用 WebView2 `PrintToPdf` 或 `PrintToPdfStream` 生成 PDF
- **AND** 不经过系统打印面板

#### Scenario: Linux PDF 生成
- **WHEN** 用户在 Linux 上选择"导出 PDF"
- **THEN** 系统 SHALL 使用 WebKitGTK `WebKitPrintOperation` 配合 GTK PDF export 功能生成 PDF
- **AND** 不经过系统打印对话框

### Requirement: PDF 保存对话框
系统 SHALL 在生成 PDF 前打开原生保存对话框，让用户选择目标路径。

#### Scenario: 选择保存路径
- **WHEN** 用户选择"导出 PDF"
- **THEN** 系统 SHALL 打开原生保存对话框
- **AND** 默认文件名 SHALL 以 `.pdf` 结尾
- **AND** 默认位置 SHALL 为用户文档目录或上次保存位置

#### Scenario: 用户取消保存
- **WHEN** 用户关闭或取消保存对话框
- **THEN** 系统 SHALL 不生成 PDF 文件且不显示错误

### Requirement: PDF 文件校验
系统 SHALL 仅在文件实际写入且以 `%PDF-` 文件头开头时报告成功。

#### Scenario: 成功校验
- **WHEN** PDF 文件写入完成
- **THEN** 系统 SHALL 读取文件前 5 字节
- **AND** 仅当前 5 字节为 `%PDF-` 时显示成功提示

#### Scenario: 写入失败
- **WHEN** PDF 文件写入失败或文件头不正确
- **THEN** 系统 SHALL 显示用户可理解的导出失败提示
- **AND** 不得显示成功提示

### Requirement: PDF 导出日志
系统 SHALL 在 PDF 导出生命周期中输出结构化日志事件：`export.pdf.start`、`export.pdf.ready`、`export.pdf.generating`、`export.pdf.written`、`export.pdf.validated`、`export.pdf.error`、`export.pdf.timeout`。

#### Scenario: PDF 导出成功日志
- **WHEN** PDF 导出成功完成
- **THEN** 系统 SHALL 依次输出 `export.pdf.start` → `export.pdf.ready` → `export.pdf.generating` → `export.pdf.written` → `export.pdf.validated`

#### Scenario: PDF 导出失败日志
- **WHEN** PDF 导出失败
- **THEN** 系统 SHALL 输出 `export.pdf.error` 日志，包含失败原因

#### Scenario: PDF 导出超时日志
- **WHEN** PDF 导出启动后 60 秒内未完成
- **THEN** 系统 SHALL 输出 `export.pdf.timeout` 日志
- **AND** 自动终止导出流程
