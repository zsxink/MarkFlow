## Context

PDF/Word/HTML 导出功能（commit 15e6eac）当前实现存在以下问题：

1. **写入路径受限**：`documentExport.ts` 使用前端 `save()` 对话框选路径，然后调用 `writeFile`（Tauri `write_file` 命令），该命令在有工作区时强制校验路径必须在工作区内（`validate_path_in_workspace`），导致常见场景（导出到桌面/下载）直接失败
2. **图片 URL 不可移植**：编辑器 DOM 中本地图片被 `editor.image.resolver.ts` 解析为 `asset://localhost/...` 协议 URL，导出直接取 `innerHTML`，这些 URL 只在 Tauri webview 内有效
3. **PDF iframe 竞态**：`printDocument` 使用 `document.open/write/close` 同步写入，与 `once` load 事件监听器存在时序耦合
4. **PDF 并发守卫失效**：`printDocument` 同步返回，`finally` 块立即释放 `exportInProgress` 守卫
5. **源码模式导出过期内容**：源码模式下最新编辑在 CodeMirror，导出始终读 ProseMirror DOM

现有 Mermaid/PNG 导出通过专用后端命令（`save_mermaid_svg_export` 等）使用 `select_export_path` + `fs::write`，跳过工作区校验，可作为参考模式。

## Goals / Non-Goals

**Goals:**

- 修复导出到工作区外路径被拒的问题
- 确保导出的 HTML/Word 文件中本地图片可正常显示
- 修复 PDF 打印的 iframe 竞态和并发守卫问题
- 支持源码模式下导出最新内容
- 保持与现有 Mermaid 导出命令的一致性

**Non-Goals:**

- 不引入 jsPDF、pdf-lib 等 PDF 生成库
- 不支持 .docx（Open XML）格式
- 不重构导出架构（保持现有 HTML 包装模式）
- 不处理超大文档的内存优化（后续优化）
- 不清洗用户 HTML 中的 script 标签（低风险，后续考虑）

## Decisions

### D1: 新增后端导出写入命令 `save_document_export`

**选择**：新增独立的 Tauri 命令，接收文件内容字符串和文件扩展名，内部调用 `select_export_path` 选路径 + `fs::write` 写入

**替代方案**：
- 方案 A：给 `write_file` 增加 `allow_outside_workspace` 参数 — 会修改现有安全校验逻辑，影响面大
- 方案 B：前端跳过 `writeFile` 直接调用后端命令 — 已选，类似 Mermaid 导出模式

**理由**：Mermaid/PNG 导出已验证此模式可行，且与现有代码风格一致。`write_file` 的工作区校验是安全核心逻辑，不宜为导出场景放宽。

### D2: 图片转 data URI 在前端完成

**选择**：导出前遍历渲染 DOM 中的 `<img>`，对 `asset://` 协议 URL 使用 `readFileAsBase64` 转为 `data:` URI 内联

**替代方案**：
- 方案 A：后端读取文件 + base64 编码返回 — 需新增后端命令，增加 IPC 开销
- 方案 B：复制图片到导出目录作为 sidecar 文件 — 改变导出为多文件，复杂度高

**理由**：前端已有 `readFileAsBase64`（通过 Tauri `invoke`），单文件导出更简单。data URI 内联会增大文件大小，但对典型文档可接受。

### D3: PDF iframe 改用 srcdoc

**选择**：将 `iframe.srcdoc = htmlContent` 替代 `document.open/write/close`，在 iframe load 事件后调用 `print()`

**替代方案**：
- 方案 A：延迟注册 load 监听器到 `appendChild` 之后 — 仍有竞态风险
- 方案 B：使用 blob URL — 增加不必要的复杂度

**理由**：`srcdoc` 是标准 API，浏览器保证在内容解析完成后触发 load 事件，无 about:blank 竞态。

### D4: 源码模式导出前同步内容

**选择**：导出前检测 `getMode()`，若为 source 模式，调用 `switchToWysiwyg()` 同步 CM6 内容到 ProseMirror，导出完成后恢复模式

**替代方案**：
- 方案 A：从 CM6 直接渲染导出 — 需要额外的 Markdown→HTML 渲染逻辑
- 方案 B：提示用户手动切回 — 用户体验差

**理由**：`switchToWysiwyg` 已实现 CM6→ProseMirror 同步逻辑，复用现有代码最安全。

## Risks / Trade-offs

- **[风险] data URI 增大文件体积** → 对含大量图片的文档，导出文件可能显著增大。缓解：后续可加文件大小预估提示
- **[风险] srcdoc 兼容性** → 极旧浏览器可能不支持，但 Tauri 内嵌 Chromium 版本足够新，风险低
- **[风险] 源码模式同步可能丢失编辑器状态** → `switchToWysiwyg` 会重置编辑器状态。缓解：导出完成后恢复源码模式
- **[风险] 20MB 写入限制** → 新命令复用 `save_mermaid_png_export` 的大小检查逻辑，超大文档（尤其内联大量 base64 图片后）可能触发限制。缓解：后续加预估提示
