# pdf-export Specification

## Purpose
定义平台原生 PDF 生成能力，使用 WebView 原生 API 直接生成 PDF 文件，不依赖系统打印面板或 PDF 打印机。

## Requirements

### Requirement: 平台原生 PDF 生成
系统 SHALL 使用平台 WebView 原生 API 直接生成 PDF 文件，不依赖系统打印面板或 PDF 打印机；系统 MUST NOT 以无条件失败的占位实现代替已声明支持的平台能力。

#### Scenario: macOS 11 及以上 PDF 生成
- **WHEN** 用户在 macOS 11 或更高版本选择"导出 PDF"
- **THEN** 系统 SHALL 使用 WKWebView `createPDF(configuration:completionHandler:)` 或经验证具有同等直接保存与分页能力的 WebKit 原生操作生成 PDF
- **AND** 不经过系统打印面板
- **AND** 不要求系统存在 PDF 打印机

#### Scenario: macOS 10.15 PDF 生成
- **WHEN** 用户在 macOS 10.15 上选择"导出 PDF"
- **THEN** 系统 SHALL 在调用前检测原生 selector 能力
- **AND** 使用不显示面板的 WKWebView save print operation 生成 PDF，或返回稳定、可理解的系统版本不支持错误
- **AND** 系统 MUST NOT 调用不存在的 selector 或发生崩溃

#### Scenario: Windows PDF 生成
- **WHEN** 用户在 Windows 上选择"导出 PDF"
- **THEN** 系统 SHALL 使用 WebView2 `PrintToPdf` 或 `PrintToPdfStream` 生成 PDF
- **AND** 不经过系统打印面板

#### Scenario: Linux PDF 生成
- **WHEN** 用户在 Linux 上选择"导出 PDF"
- **THEN** 系统 SHALL 使用 WebKitGTK `WebKitPrintOperation` 配合 GTK PDF export 功能生成 PDF
- **AND** 不经过系统打印对话框

#### Scenario: 当前构建尚未实现的平台
- **WHEN** 当前平台的直接 PDF 后端尚未实现
- **THEN** 系统 SHALL 返回稳定的 `PDF_UNSUPPORTED` 能力错误
- **AND** "导出 PDF" MUST NOT 静默打开打印对话框或报告成功

### Requirement: PDF 保存对话框
系统 SHALL 在生成 PDF 前打开原生保存对话框，让用户选择目标路径，并将所选路径交给后端直接生成和原子保存。

#### Scenario: 选择保存路径
- **WHEN** 用户选择"导出 PDF"
- **THEN** 系统 SHALL 在创建导出 WebView 前打开原生保存对话框
- **AND** 默认文件名 SHALL 使用当前文档名称并以 `.pdf` 结尾
- **AND** 默认位置 SHALL 为用户文档目录或上次保存位置

#### Scenario: 用户取消保存
- **WHEN** 用户关闭或取消保存对话框
- **THEN** 系统 SHALL 不调用 PDF 生成命令
- **AND** 不创建临时 WebView或临时文件
- **AND** 不显示错误

### Requirement: PDF 文件校验
系统 SHALL 先将 PDF 写入目标目录中的临时文件，仅在文件非空且以 `%PDF-` 文件头开头时原子提交最终文件并报告成功。

#### Scenario: 成功校验
- **WHEN** 原生 PDF 生成完成并写入临时文件
- **THEN** 系统 SHALL 读取文件前 5 字节
- **AND** 仅当前 5 字节为 `%PDF-` 且文件非空时原子提交最终文件
- **AND** 成功结果 SHALL 包含实际写入字节数

#### Scenario: 写入或校验失败
- **WHEN** PDF 写入失败、文件为空或文件头不正确
- **THEN** 系统 SHALL 删除未提交的临时文件
- **AND** 保留已存在的目标文件
- **AND** 显示用户可理解的导出失败提示
- **AND** 不得显示成功提示

### Requirement: PDF 导出日志
系统 SHALL 在 PDF 导出生命周期中输出结构化日志事件：`export.pdf.start`、`export.pdf.ready`、`export.pdf.generating`、`export.pdf.written`、`export.pdf.validated`、`export.pdf.error`、`export.pdf.timeout`。

#### Scenario: PDF 导出成功日志
- **WHEN** PDF 导出成功完成
- **THEN** 系统 SHALL 依次输出 `export.pdf.start` → `export.pdf.ready` → `export.pdf.generating` → `export.pdf.written` → `export.pdf.validated`

#### Scenario: PDF 导出失败日志
- **WHEN** PDF 导出失败
- **THEN** 系统 SHALL 输出 `export.pdf.error` 日志
- **AND** 日志 SHALL 包含稳定错误类别和原始失败原因

#### Scenario: PDF 导出超时日志
- **WHEN** 页面就绪或原生 PDF 生成在规定时间内未完成
- **THEN** 系统 SHALL 输出 `export.pdf.timeout` 日志
- **AND** 后端 SHALL 终止导出作业并清理临时资源

### Requirement: PDF 临时资源生命周期
系统 SHALL 为每次直接 PDF 导出创建隔离作业，并在成功、失败、取消或超时后关闭临时 WebView、删除临时 HTML 和未提交 PDF。

#### Scenario: 导出成功清理
- **WHEN** PDF 已校验并原子提交
- **THEN** 系统 SHALL 关闭该作业的临时 WebView
- **AND** 删除临时 HTML 与中间 PDF

#### Scenario: 导出失败或超时清理
- **WHEN** 页面加载、原生生成或文件写入失败或超时
- **THEN** 系统 SHALL 关闭该作业的临时 WebView
- **AND** 删除该作业创建的全部临时文件
- **AND** 迟到的原生回调 MUST NOT 写入目标文件或影响后续作业

### Requirement: PDF 页面就绪握手
系统 SHALL 在字体、图片和至少两个渲染帧完成后才调用平台 PDF API，不得使用固定 sleep 作为唯一就绪判断。

#### Scenario: 资源完成后生成
- **WHEN** 导出页面中的字体与图片均已加载或明确失败
- **THEN** 页面 SHALL 向后端发送 ready 信号
- **AND** 后端 SHALL 在收到对应作业的 ready 信号后调用原生 PDF API

#### Scenario: 页面就绪超时
- **WHEN** 导出页面未在规定时间内发出 ready 信号
- **THEN** 系统 SHALL 返回 `PDF_TIMEOUT`
- **AND** 不生成或提交目标 PDF

### Requirement: PDF 后端防回归验证
项目 SHALL 包含覆盖真实 `create_pdf` 后端路径的验证，确保支持平台不会再次被无条件错误 stub 替代。

#### Scenario: macOS 后端编译验证
- **WHEN** PDF 导出实现或原生依赖发生变更
- **THEN** CI 或合入前验证 SHALL 对 macOS target 执行 Rust 编译检查
- **AND** 不得仅依赖 mock `invoke()` 的前端测试

#### Scenario: macOS 实际导出验证
- **WHEN** 发布包含 PDF 导出变更的 macOS 构建
- **THEN** 验证 SHALL 在未配置 PDF 打印机的环境生成有效 PDF
- **AND** 长文档的末尾标记和分页内容 SHALL 存在
- **AND** 连续两次导出 SHALL 使用隔离作业并成功完成
