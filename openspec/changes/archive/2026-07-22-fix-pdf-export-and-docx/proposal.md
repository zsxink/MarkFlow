## Why

当前 PDF 导出点击后无任何响应（无打印对话框、无保存对话框、无错误提示），Word 导出生成的 `.doc` 文件实质是 HTML 改名，在 Word/WPS 中排版严重失真。用户无法获得可用的 PDF 和真正的 DOCX 文件，且导出过程会直接修改编辑器实时 DOM，存在副作用。

## What Changes

- **修复 PDF 导出无响应**：替换隐藏 iframe `window.print()` 方案，使用 Tauri 原生 `WebviewWindow::print()` 或独立打印 WebView，确保系统打印面板可靠弹出
- **替换伪 `.doc` 为真正的 DOCX**：移除 Word-compatible HTML `.doc` 方案，改用 OOXML 标准生成 `.docx` 文件
- **构建只读导出快照**：创建 `buildExportSnapshot()` 从 ProseMirror JSON/DOM 克隆构建一次性导出数据，不再修改编辑器实时 DOM
- **更新导出菜单**：将 "Word (.doc)" 改为 "Word (.docx)"，PDF 菜单项提示改为"打印 / 另存为 PDF"
- **更新 `rendered-document-export` 规范**：反映上述变更

## Capabilities

### New Capabilities
- `docx-export`: 基于 OOXML 标准的原生 DOCX 文件导出，支持段落、标题、文本标记、列表、链接、引用、代码块、表格、图片等语义结构

### Modified Capabilities
- `rendered-document-export`: PDF 导出从隐藏 iframe 方案改为可靠打印流程；Word 导出从 HTML 包装 `.doc` 改为原生 DOCX；增加导出快照机制，禁止修改编辑器实时 DOM

## Impact

- **代码变更**：`src/lib/documentExport.ts` 重构，新增 `src/lib/docxExport.ts`，新增 Tauri Rust 命令 `print_webview`
- **依赖变更**：新增 DOCX 生成库（lazy-load），移除"无新运行时依赖"约束
- **规范变更**：更新 `rendered-document-export` spec，新增 `docx-export` spec
- **测试变更**：新增 DOCX 映射单元测试、PDF 状态机测试、导出快照测试
- **UI 变更**：导出菜单项从 "Word (.doc)" 改为 "Word (.docx)"，PDF 提示改为"打印 / 另存为 PDF"
