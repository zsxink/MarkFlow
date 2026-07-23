## Why

PDF 导出依赖系统打印面板的"另存为 PDF"目标，无 PDF 打印机时无法保存；DOCX 导出因 `Packer.toBuffer()` 在 WebView 环境抛出 `nodebuffer is not supported` 直接失败；HTML 导出使用硬编码样式，与编辑器当前 light/dark/sepia 主题不一致。三种导出各用独立样式来源，视觉效果逐渐漂移。

## What Changes

- **PDF 导出**：从"调用系统打印"改为"平台 WebView 直接生成 PDF 文件"，不依赖打印机；拆分"导出 PDF"与"打印…"为两个独立动作
- **DOCX 导出**：将 `Packer.toBuffer()` 改为浏览器兼容的 `Packer.toArrayBuffer()`，恢复导出能力；统一使用共享主题令牌生成 Word 样式
- **HTML 导出**：生成自包含文档，保留 `.ProseMirror` 根容器、当前 `data-theme` 和 CSS variables；内联字体/图片/图表，不依赖 `asset://` 或本机路径
- **统一导出主题**：建立 `ExportTheme` 作为唯一样式来源，HTML/PDF 生成 CSS，DOCX 生成 Word styles，禁止各格式继续硬编码
- **导出 Ready 协议**：导出前等待字体、图片、图表全部就绪，确保快照完整性

## Capabilities

### New Capabilities
- `export-theme`: 统一导出文档模型与主题令牌，为 HTML/PDF/DOCX 提供唯一样式来源
- `html-export`: 自包含 HTML 导出，保留当前主题 CSS variables 和文档内容样式
- `pdf-export`: 平台原生 PDF 生成（macOS WKWebView、Windows WebView2、Linux WebKitGTK），不依赖系统打印

### Modified Capabilities
- `docx-export`: 修复浏览器环境 Packer 兼容性 + 使用共享主题令牌替代硬编码样式
- `rendered-document-export`: PDF 从"浏览器打印"改为"平台原生 PDF 生成"，拆分导出与打印入口

## Impact

- **后端 Rust**：macOS/Windows/Linux 各需实现平台原生 PDF 生成 API（`createPDF`、`PrintToPdf`、`WebKitPrintOperation`）
- **前端 TypeScript**：`documentExport.ts`、`docxExport.ts`、`createDocxFromHtml()` 需重构；新增 `exportTheme.ts` 统一主题定义
- **CSS**：抽取编辑器内容样式为可复用模块，新增导出专用 CSS 和打印 `@page` 规则
- **测试**：DOCX 需真实 Packer 测试（非 mock）；HTML 需主题一致性断言；PDF 需平台 backend 状态机测试
- **依赖**：无新增 npm 依赖（`docx` 库已存在）；Rust 侧可能需平台特定 crate（如 `webkit2gtk`）
