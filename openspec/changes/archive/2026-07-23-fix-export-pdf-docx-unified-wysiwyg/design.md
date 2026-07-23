## Context

MarkFlow 当前三种导出格式（PDF/DOCX/HTML）各有独立的样式来源和实现路径：
- PDF 通过 `WebviewWindow::print()` 或 `window.print()` 调用系统打印面板，依赖用户系统有 PDF 打印机
- DOCX 使用 `docx` 库的 `Packer.toBuffer()`，该 API 仅适用于 Node.js，在 WebView 环境直接抛错
- HTML 导出使用硬编码的 `EXPORT_STYLE` 常量，与编辑器的 `data-theme`（light/dark/sepia）和 CSS variables 完全脱节

三种格式的快照来源相同（ProseMirror DOM 克隆），但样式各自为政，导致视觉效果逐渐漂移。编辑器主题由 `variables.css` 中的 CSS variables 定义，内容样式在 `.ProseMirror ...` 选择器下，导出时这些规则未被复用。

## Goals / Non-Goals

**Goals:**
- 建立 `ExportTheme` 作为三种导出格式的唯一样式来源
- PDF 导出不依赖系统打印，直接生成 `.pdf` 文件
- DOCX 导出在 WebView 环境正常工作
- HTML 导出自包含且保留当前主题
- 导出前等待字体/图片/图表就绪

**Non-Goals:**
- 逐像素一致（DOCX 使用独立排版引擎，不承诺像素级相同）
- 实时预览导出效果
- 批量导出
- 自定义导出模板

## Decisions

### D1: 统一 ExportTheme 数据模型

**选择**：定义 TypeScript `ExportTheme` 接口，包含页面尺寸、内容宽度、页边距、字体栈、字号、行高、颜色（含主题变体）、标题层级、代码/引用/列表/表格/图片规则。

**替代方案**：
- A: CSS variables 直接复用 → 不可行，DOCX 无法消费 CSS variables
- B: 每种格式独立维护样式 → 已有问题，继续漂移

**理由**：单一数据源，HTML/PDF 从其生成 CSS，DOCX 从其生成 Word styles。编辑器主题切换时 `ExportTheme` 同步更新。

### D2: PDF 使用平台原生 API

**选择**：macOS 使用 `WKWebView.createPDF(configuration:)`，Windows 使用 WebView2 `PrintToPdf`，Linux 使用 WebKitGTK `WebKitPrintOperation` + GTK PDF export。

**替代方案**：
- A: jsPDF/pdf-lib → 增加 200KB+ 依赖，且需将 DOM 转为 PDF 绘图指令，复杂度极高
- B: 继续使用系统打印 → 依赖打印机，用户体验差

**理由**：平台原生 API 无额外依赖，由 WebView 引擎直接渲染，保真度最高。需拆分"导出 PDF"与"打印…"为两个菜单项。

### D3: DOCX 使用 Packer.toArrayBuffer()

**选择**：将 `Packer.toBuffer()` 改为 `Packer.toArrayBuffer()`，构造 `Uint8Array` 后通过 `save_binary_export` 命令保存。

**替代方案**：
- A: `Packer.toBlob()` → 可行，但多一次 Blob → ArrayBuffer 转换
- B: Node.js polyfill → 增加不必要的依赖和复杂度

**理由**：`toArrayBuffer()` 是浏览器原生支持的最小改动，无额外转换开销。

### D4: HTML 导出保留 .ProseMirror 根容器

**选择**：导出快照保留 `.ProseMirror` 根容器，设置 `data-theme` 属性，内联对应的 CSS variables 和内容样式。

**替代方案**：
- A: 克隆子节点 + 独立样式 → 当前实现，样式不命中
- B: 完全重写 HTML 结构 → 过度工程，且丢失 ProseMirror 的语义类名

**理由**：保留根容器使现有 `.ProseMirror ...` 选择器自然生效，最小改动获得最大样式覆盖。

### D5: 导出 Ready 协议

**选择**：导出前等待 `document.fonts.ready`、所有 `<img>` 的 `decode()` 完成、Mermaid/PlantUML 渲染完成，设置 30 秒超时。

**替代方案**：
- A: 固定延时（当前 500ms）→ 不可靠，大文档/慢设备会截断
- B: 不等待 → 更差

**理由**：主动等待比固定延时可靠，超时保护防止无限阻塞。

## Risks / Trade-offs

- **[平台 PDF API 差异]** → 三个平台的 PDF API 签名和配置不同，需分别实现。macOS 最成熟，Windows 次之，Linux 可能需 spike 验证 WebKitGTK 版本兼容性。→ 先实现 macOS，Windows/Linux 可作为后续 PR。
- **[字体内联体积]** → 自包含 HTML 需内联字体，Source Serif 4 woff2 约 300KB，中文字体子集约 4MB。→ 接受体积增加，换取离线一致性；可选压缩优化。
- **[DOCX 样式精度]** → Word 排版引擎与 WebView 不同，同一主题令牌映射后仍有视觉差异。→ 验收标准为"同一主题设计和信息层级"，不以逐像素相同为标准。
- **[导出快照内存]** → 大文档的 DOM 克隆 + 资源内联可能占用大量内存。→ 文档大小分级（`document-size-tier` spec）已有框架，导出时可复用。
