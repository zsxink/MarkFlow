## Why

PR #182 为修复 Rust 编译错误，将 `create_pdf` 替换成无条件报错的占位实现，导致 macOS “导出 PDF”在进入生成阶段后必然失败。该回归违反现有 `pdf-export` 规范，也暴露出现有测试只覆盖前端 mock、无法阻止后端能力被删除的问题，因此需要立即恢复真实导出并补齐平台验证门槛。

## What Changes

- 恢复可编译的 macOS 原生 PDF 生成路径，在不依赖系统 PDF 打印机或打印面板的情况下返回有效 PDF。
- 使用与当前 Tauri/wry 版本匹配的 WKWebView 接口，正确处理页面就绪、原生异步回调、超时和临时 WebView 清理。
- 对 macOS 10.15 与 11+ 的能力边界做显式处理，避免不支持时落入笼统的重试错误。
- 为非 macOS 目标保留明确的条件编译和稳定的 unsupported 错误，不影响独立的“打印…”流程。
- 加强 PDF 生命周期日志、错误分类和成功校验，禁止 stub 或打印回退冒充直接导出。
- 补充 Rust/TypeScript 测试与 macOS 实机验证步骤，覆盖真实后端调用链并防止同类回归。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `pdf-export`: 明确 macOS 版本能力、临时 WebView 生命周期、unsupported 错误语义以及真实后端防回归验证要求。

## Impact

- 受影响代码：`src-tauri/src/commands/export.rs`、Tauri 命令注册/平台桥接、`src/lib/pdfExport.ts` 及相关测试。
- 受影响依赖：macOS WKWebView Objective-C 绑定及其异步 block 支持；版本必须与 Tauri/wry 锁定依赖保持一致。
- 受影响平台：macOS 恢复直接导出；Windows/Linux 本次不实现完整原生直出，但必须继续通过条件编译并返回可识别的能力错误。
- 关联：GitHub Issue #183，回归来源 #180、#181、#182。
