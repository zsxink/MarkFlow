## 1. ExportTheme 基础设施

- [x] 1.1 定义 `ExportTheme` TypeScript 接口（页面尺寸、字体栈、字号、行高、颜色变体、标题层级、代码/引用/列表/表格/图片规则）
- [x] 1.2 实现 `buildExportTheme()` 函数，从编辑器 CSS variables 和 `data-theme` 属性构建 ExportTheme 实例
- [x] 1.3 实现 `exportThemeToCss(theme, options?)` 函数，生成包含 CSS variables 和 `.ProseMirror` 内容选择器的 CSS 文本
- [x] 1.4 实现 `exportThemeToDocxStyles(theme)` 函数，将 ExportTheme 转换为 `docx` 库的 IStylesOptions
- [x] 1.5 为 ExportTheme 相关函数编写单元测试

## 2. DOCX 导出修复

- [x] 2.1 将 `docxExport.ts` 中 `Packer.toBuffer()` 改为 `Packer.toArrayBuffer()`，构造 `Uint8Array`
- [x] 2.2 更新 `createDocxFromHtml()` 使用 ExportTheme 生成 Word 样式（替换硬编码样式）
- [x] 2.3 添加真实 Packer 测试：在 jsdom/happy-dom 环境调用 `Packer.toArrayBuffer()`，验证 ZIP 结构、`[Content_Types].xml`、`word/document.xml`、`PK` 头
- [ ] 2.4 验证 DOCX 在 Word/WPS/LibreOffice 中可正常打开

## 3. HTML 导出重构

- [x] 3.1 修改导出快照逻辑：保留 `.ProseMirror` 根容器（而非仅克隆子节点），设置 `data-theme` 属性
- [x] 3.2 使用 `exportThemeToCss(theme)` 生成导出 CSS，替换硬编码的 `EXPORT_STYLE` 常量
- [x] 3.3 实现字体内联：将 Source Serif 4 woff2 和 Source Han Serif SC 子集转为 base64 data URI 内联到 `@font-face`
- [x] 3.4 实现图片内联：将 `asset://` 协议 URL 转换为 `data:image/...;base64,...` (already existed in convertLocalImages)
- [x] 3.5 实现图表内联：将 Mermaid/PlantUML SVG 渲染为 PNG data URI (already existed in convertSvgToPngDataUrl)
- [x] 3.6 实现导出 Ready 协议：等待 `document.fonts.ready`、图片 `decode()`、图表渲染完成（10 秒超时）
- [x] 3.7 清理编辑器交互标记：移除 `contenteditable`、`draggable`、NodeView 控件、光标/选区元素 (already existed in cleanupEditorMarkup)
- [ ] 3.8 验证导出 HTML 离线可完整显示，不依赖 `asset://` 或外部资源

## 4. PDF 导出重构

- [x] 4.1 修改导出菜单：拆分为"导出 PDF (.pdf)"和"打印…"两个独立选项
- [x] 4.2 实现"导出 PDF"流程：打开保存对话框 → 创建隔离 WebView → 加载自包含 HTML → 等待 ready → 调用平台 API 生成 PDF
- [x] 4.3 macOS 后端：实现 `create_pdf` Tauri command，使用 `WKWebView.createPDF(configuration:completionHandler:)`
- [x] 4.4 实现 PDF 文件校验：写入后读取前 5 字节验证 `%PDF-` 文件头
- [x] 4.5 更新 PDF 日志事件为新生命周期：`start` → `ready` → `generating` → `written` → `validated` / `error` / `timeout`
- [x] 4.6 保留"打印…"功能：使用现有 `WebviewWindow::print()` / `window.print()` 流程
- [x] 4.7 实现 PDF 并发导出保护和 60 秒超时机制

## 5. 测试与验证

- [x] 5.1 DOCX 测试：真实 Packer 生成 + OOXML 结构验证 + 样式一致性断言
- [x] 5.2 HTML 测试：文档根容器、`data-theme`、CSS variables、内联字体/图片、无编辑器控件
- [x] 5.3 PDF 测试：macOS `createPDF` 调用验证、文件头校验、超时/取消/失败状态机
- [x] 5.4 回归测试：导出前后编辑器 DOM 和 dirty 状态不变 (existing tests cover this)
- [x] 5.5 运行 `npm test` 和 `npm run build` 确认无回归
