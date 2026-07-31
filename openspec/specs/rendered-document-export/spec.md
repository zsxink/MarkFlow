# rendered-document-export Specification

## Purpose
定义渲染文档导出（PDF/Word/HTML）的快照机制、日志规范、导出格式入口和浏览器打印流程，确保导出操作不干扰编辑器实时状态。

## Requirements

### Requirement: 导出快照
系统 SHALL 从 Core Export IR 获取结构化文档数据。导出触发时 SHALL flush 发起 session 的 pending patch，取得 confirmed revision，调用 `getExportDocument` 获取 ExportDocument，通过 IR 渲染器生成 HTML。所有导出预处理操作（图片转换、图表渲染、主题/字体处理）均在 Export IR 派生的导出文档上执行，不得读取或修改编辑器实时 DOM。M8C removal 后，产品主路径 MUST NOT 使用从编辑器 DOM 克隆创建的只读导出快照。

#### Scenario: 使用 Export IR 导出
- **WHEN** Core 会话活跃且用户触发导出
- **THEN** 系统 SHALL 使用 IR 路径而非 DOM 快照
- **AND** 通过 `buildConfirmedRevisionHtml` 获取 Export IR 并渲染

#### Scenario: Core session 缺失时失败
- **WHEN** Core 会话不可用或无法确认 revision
- **THEN** 系统 SHALL 返回稳定导出错误
- **AND** 不得从编辑器 `renderedRoot` 克隆 DOM 子树
- **AND** 文档 dirty 状态 SHALL 不变

#### Scenario: 编辑器 DOM 不受影响
- **WHEN** 导出流程使用 IR 路径或 DOM 快照
- **THEN** 编辑器的实时 DOM SHALL 保持不变
- **AND** 文档的 dirty 状态 SHALL 不变

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
系统 SHALL 以 Core Export IR 渲染的 HTML 作为 PDF/DOCX/HTML/print 的共同内容来源。IR 路径下，Export IR 的 blocks 按类型渲染为对应 HTML 标记，包裹在 `.ProseMirror` 根容器中，携带 `data-export-ir-schema-version`、`data-session-id`、`data-revision` 属性。产品主路径 MUST NOT 从编辑器 DOM 克隆内容、读取 active editor selection，或从当前 window content 推导导出文档。

#### Scenario: IR 路径导出内容
- **WHEN** 通过 IR 路径导出含图片、图表或格式化文本的文档
- **THEN** 系统 SHALL 从 ExportDocument 的 blocks 渲染 HTML
- **AND** 不涉及编辑器 DOM 克隆

#### Scenario: 文档含本地图片
- **WHEN** 导出含本地图片（asset 协议 URL）的文档
- **THEN** 系统 SHALL 从 Export IR assets 解析本地图片并将其转换为 data URI
- **AND** 编辑器中的原始 asset URL SHALL 保持不变

#### Scenario: 源码模式下导出
- **WHEN** 用户在源码（CodeMirror）模式下触发导出
- **THEN** 系统 SHALL 先将最新源码内容同步到 Core，再通过 IR 路径构建 ExportDocument 并导出

#### Scenario: WYSIWYG 模式下导出
- **WHEN** 用户在 WYSIWYG 模式下触发导出
- **THEN** 系统 SHALL flush Core-backed editor patches 并导出发起时 confirmed revision
- **AND** 不得调用 ProseMirror serializer 或读取 WYSIWYG DOM 生成导出内容

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

### Requirement: IR 导出会话一致性校验
当使用 Export IR 路径时，系统 SHALL 校验 ExportDocument 的 session_id、base_revision、export_request_id 与原始请求一致，确保导出内容与当前文档状态对应。

#### Scenario: 会话校验通过
- **WHEN** 前端收到 ExportDocument
- **THEN** SHALL 校验 session_id 与请求一致
- **AND** SHALL 校验 base_revision 与 flush 后的 revision 一致
- **AND** SHALL 校验 export_request_id 与请求一致

#### Scenario: 会话校验失败
- **WHEN** 任意校验不通过
- **THEN** 系统 SHALL 抛出 `EXPORT_SESSION_MISMATCH` 错误
- **AND** 不生成导出输出
