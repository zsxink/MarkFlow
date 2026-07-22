## 1. 导出快照机制

- [x] 1.1 创建 `src/lib/exportSnapshot.ts`，实现 `buildExportSnapshot(renderedRoot: HTMLElement): Promise<DocumentFragment>` 函数
- [x] 1.2 在快照中移除 `contenteditable`、`draggable`、NodeView 控件和编辑器专用 CSS 类名
- [x] 1.3 将快照中的 asset 协议图片 URL 转换为 data URI（迁移 `convertLocalImages` 到快照机制）
- [x] 1.4 等待快照中所有字体和图片加载完成（`document.fonts.ready`、`img.decode()`）
- [x] 1.5 重构 `exportRenderedDocument()` 使用快照而非直接操作编辑器 DOM

## 2. PDF 导出修复

- [x] 2.1 在 Rust 端新增 `print_webview` Tauri 命令，调用 `WebviewWindow::print()`（macOS）
- [x] 2.2 在前端创建 `triggerPdfExport(html: string): Promise<boolean>`，macOS 使用 Tauri 命令，Windows/Linux 回退到 `window.print()`
- [x] 2.3 实现 PDF 生命周期管理：`beforeprint`/`afterprint` 事件、超时 60s 保护、窗口关闭检测
- [x] 2.4 添加 PDF 导出结构化日志：`export.pdf.start`、`ready`、`print_invoked`、`afterprint`、`timeout`、`error`
- [x] 2.5 用临时导出 WebView/窗口加载快照 HTML，而非隐藏 iframe

## 3. DOCX 导出实现

- [x] 3.1 新增 `src/lib/docxExport.ts`，使用 `docx` npm 包（lazy-load: `import('docx')`）
- [x] 3.2 实现段落、H1–H6 标题到 Word 样式的映射
- [x] 3.3 实现加粗、斜体、删除线、行内代码、链接的文本标记映射
- [x] 3.4 实现有序、无序、任务列表的映射
- [x] 3.5 实现块引用、代码块的样式映射
- [x] 3.6 实现表格映射（边框、合并、对齐）
- [x] 3.7 实现图片嵌入（data URI 解码为二进制，插入 `word/media/`）
- [x] 3.8 实现 Mermaid/PlantUML SVG 转 PNG 后在 DOCX 中嵌入
- [x] 3.9 定义 DOCX 样式：页面 A4、边距、中英文字体、字号、段落间距、代码背景色、表格边框
- [x] 3.10 实现 DOCX 二进制写入（通过 Tauri 二进制写入命令，非 UTF-8 字符串）

## 4. 导出菜单更新

- [x] 4.1 更新导出菜单项：PDF 改为"打印 / 另存为 PDF"，Word 改为"导出 Word (.docx)"
- [x] 4.2 移除旧的 Word (.doc) 导出入口
- [x] 4.3 将 `getExportFileName` 中 Word 扩展名从 `.doc` 改为 `.docx`

## 5. Rust 后端变更

- [x] 5.1 新增 `commands/export.rs`，实现 `print_webview` 命令（macOS Tauri 原生打印）
- [x] 5.2 新增 `write_file_binary` 命令用于写入 DOCX 二进制数据
- [x] 5.3 在 `lib.rs` 中注册新命令
- [x] 5.4 更新 capabilities 添加 `core:webview:allow-print` 权限

## 6. 规范更新

- [x] 6.1 更新 `openspec/specs/rendered-document-export/spec.md` 反映上述变更（归档时执行）
- [x] 6.2 新增 `openspec/specs/docx-export/spec.md`（归档时执行）

## 7. 测试

- [x] 7.1 导出快照测试：验证 NodeView 清理、图片转换、实时 DOM 不变
- [x] 7.2 DOCX 映射单元测试：每个节点/标记类型生成有效 OOXML
- [x] 7.3 PDF 状态机测试：start → ready → print_invoked → afterprint / timeout
- [x] 7.4 回归测试：HTML 导出、源码模式同步、取消保存、并发导出保护
