## Context

当前 PDF 导出使用隐藏 iframe + `window.print()` 方案，在 Tauri/macOS WebView 中隐藏零尺寸子框架的 `print()` 行为不可靠——用户看不到任何打印对话框或保存面板，且 `print()` 返回 `void`，代码无法确认打印面板是否实际弹出。Word 导出生成的是 HTML 包装的 `.doc` 文件，在 Word/WPS 中排版严重失真。此外，`convertLocalImages()` 直接修改编辑器实时 DOM，存在副作用。

## Goals / Non-Goals

**Goals:**
- PDF 导出可靠弹出系统打印面板（macOS 用 Tauri 原生 `WebviewWindow::print()`，其他平台用顶层 WebView `window.print()`）
- 用真正的 OOXML DOCX 替换 HTML 包装的 `.doc`
- 构建只读导出快照机制，不再修改编辑器实时 DOM
- 更新导出菜单项（PDF 提示改为"打印 / 另存为 PDF"，Word 改为 ".docx"）
- 增加结构化日志和 Toast 提示，覆盖所有失败路径

**Non-Goals:**
- 不引入 jsPDF、pdf-lib 等纯 JS PDF 生成库（仍依赖浏览器打印流程）
- 不改变 HTML 导出行为（仅重构快照机制）
- 不实现 DOCX 导入
- 不改变 Mermaid/PlantUML 的渲染方式（仅导出时转 PNG）

## Decisions

### Decision 1: 用 Tauri 原生 `WebviewWindow::print()` 替换隐藏 iframe

**方案：** 在 macOS 上创建临时 Tauri WebviewWindow，加载导出 HTML，然后调用 Tauri 2.11 的 `WebviewWindow::print()` 打开系统打印面板。Windows/Linux 回退到顶层 WebView `window.print()`。

**理由：**
- 隐藏 iframe 的 `window.print()` 在 Tauri/macOS WebView 中行为不可靠，用户看不到任何对话框
- Tauri 2.11 提供了 `WebviewWindow::print()` 原生 API，可可靠触发系统打印面板
- 临时 WebView 是可见的顶层窗口，打印行为与浏览器一致
- 通过 `beforeprint`/`afterprint` 事件和超时机制管理生命周期

**替代方案考虑：**
- 隐藏 iframe 方案：当前方案，在 Tauri/macOS 中不可靠
- jsPDF/pdf-lib：引入额外依赖，且无法保留浏览器渲染效果（CSS、字体、图表 SVG）

### Decision 2: 使用 docx 库生成原生 OOXML

**方案：** 使用 `docx` npm 包（lazy-load），从 ProseMirror JSON 映射到 DOCX 语义结构。

**理由：**
- `docx` 库是纯 TypeScript OOXML 生成库，无原生依赖
- 支持段落、标题、列表、表格、图片等完整语义结构
- 可定义 Word 样式（字体、间距、边框等）
- 通过 lazy-load 避免增加主包体积

**替代方案考虑：**
- HTML 包装 `.doc`：当前方案，排版严重失真
- 手写 XML 模板：维护成本高，难以覆盖所有节点类型
- pandoc 等外部工具：增加运行时依赖，不适合桌面应用

### Decision 3: 构建只读导出快照

**方案：** 创建 `buildExportSnapshot()` 函数，从 ProseMirror 编辑器克隆 DOM 子树，在克隆上执行图片转换和清理操作，不修改实时 DOM。

**理由：**
- 当前 `convertLocalImages()` 直接修改编辑器 DOM 中的 `img.src`，将 asset URL 替换为 data URI，影响编辑器状态
- 克隆 DOM 后操作，保证编辑器状态不受导出影响
- 可同时清理 `contenteditable`、`draggable`、NodeView 控件等编辑器专用标记

### Decision 4: 导出快照中图表转 PNG

**方案：** 在导出快照中，将 Mermaid/PlantUML SVG 渲染为 Canvas 再导出为 PNG data URI，嵌入 DOCX 和 HTML 导出中。

**理由：**
- DOCX 不支持 SVG 内联，需要栅格化
- 跨平台字体渲染差异导致 SVG 在 Word 中可能变形
- Canvas 导出 PNG 保留当前渲染效果

### Decision 5: 并发导出保护

**方案：** 保留 `exportInProgress` 标志，扩展为支持导出类型感知（同一类型互斥，不同类型可并行）。

**理由：**
- 当前全局 `exportInProgress` 过于粗粒度，PDF 和 DOCX 导出不应互斥
- 但 PDF 打印流程独占性高，建议按类型隔离

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| Tauri `WebviewWindow::print()` 在旧版本不可用 | 检测 Tauri 版本，回退到顶层 WebView `window.print()` |
| DOCX 库增加包体积 | 使用动态 import lazy-load，仅在用户点击 Word 导出时加载 |
| 图表转 PNG 可能丢失交互性 | 导出场景不需要交互，PNG 保留渲染效果即可 |
| 导出快照中 Mermaid/PlantUML 渲染未完成 | 等待 `document.fonts.ready` 和图表渲染完成后再生成快照 |
| 并发导出竞态 | 按导出类型隔离锁，PDF 和 DOCX 可同时进行 |
