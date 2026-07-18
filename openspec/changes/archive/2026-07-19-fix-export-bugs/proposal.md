## Why

PDF/Word/HTML 导出功能（commit 15e6eac）存在两个严重 Bug 和三个中等问题：有工作区时导出到工作区外路径被后端拒绝（常见场景直接失败）、导出的本地图片使用 Tauri asset 协议 URL 导致应用外裂图、PDF 打印 iframe 存在 load 事件竞态、exportInProgress 并发守卫对 PDF 无效、源码模式下导出过期的 WYSIWYG DOM。这些问题导致导出功能在实际使用中基本不可用。

## What Changes

- **新增后端导出命令**：为 HTML/Word 导出新增专用 Tauri 命令（类似 `save_mermaid_svg_export`），用户通过原生对话框选路径后直接写入，跳过工作区校验
- **本地图片转 data URI**：导出前遍历渲染 DOM 中的 `<img>`，将 Tauri asset 协议 URL 转为 base64 data URI 内联
- **修复 PDF iframe 竞态**：改用 `iframe.srcdoc` 替代 `document.open/write/close`，消除 about:blank load 竞态
- **修复 PDF 并发守卫**：让 exportInProgress 守卫覆盖到 iframe 清理完成
- **源码模式导出支持**：导出前检测编辑器模式，若为 source 模式先同步内容回 ProseMirror 或提示用户

## Capabilities

### New Capabilities

- `export-workspace-bypass`: 导出时跳过工作区路径校验，允许用户将文件保存到任意位置

### Modified Capabilities

- `rendered-document-export`: 修复本地图片 data URI 转换、PDF iframe 竞态、并发守卫、源码模式支持

## Impact

- **后端**：`src-tauri/src/commands/files.rs` — 新增导出写入命令
- **前端**：`src/lib/documentExport.ts` — 图片转换、iframe 修复、并发守卫
- **编辑器集成**：`src/components/toolbar.ts` — 源码模式检测与同步
- **API 变更**：新增 Tauri 命令，前端调用方式变更
