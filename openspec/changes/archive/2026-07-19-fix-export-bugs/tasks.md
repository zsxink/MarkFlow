## 1. 后端导出写入命令

- [x] 1.1 在 `src-tauri/src/commands/files.rs` 中新增 `save_document_export` 命令，接收 `content: String` 和 `extension: String` 参数
- [x] 1.2 命令内部调用 `select_export_path` 打开原生保存对话框，设置默认扩展名
- [x] 1.3 使用 `fs::write` 写入选定路径（跳过工作区校验）
- [x] 1.4 在 `src-tauri/src/commands/mod.rs` 中注册新命令
- [x] 1.5 在前端 Tauri invoke 类型声明中添加新命令类型

## 2. 本地图片 data URI 转换

- [x] 2.1 在 `src/lib/documentExport.ts` 中新增 `convertLocalImages` 函数，遍历渲染 DOM 中的 `<img>` 元素
- [x] 2.2 对 `asset://` 协议 URL 调用 `readFileAsBase64` 转为 `data:` URI 并替换 src
- [x] 2.3 在 `exportRenderedDocument` 中调用 `convertLocalImages` 处理 DOM 后再取 innerHTML
- [x] 2.4 添加错误处理：单个图片转换失败时保留原 URL 并继续

## 3. PDF iframe 竞态修复

- [x] 3.1 重写 `printDocument` 函数，使用 `iframe.srcdoc = htmlContent` 替代 `document.open/write/close`
- [x] 3.2 在 iframe load 事件回调中调用 `printWindow.print()`
- [x] 3.3 将 iframe 移除逻辑移入 print 后的回调，替代固定 1s setTimeout
- [x] 3.4 确保 `printDocument` 返回 Promise，在打印对话框关闭后 resolve

## 4. PDF 并发守卫修复

- [x] 4.1 修改 `exportRenderedDocument` 的 PDF 分支，`await printDocument()` 后再释放 `exportInProgress` 守卫
- [x] 4.2 确保 finally 块在 print 完成后执行

## 5. 源码模式导出支持

- [x] 5.1 在 `exportCurrentDocument`（`toolbar.ts`）中检测 `getMode()` 是否为 source
- [x] 5.2 若为 source 模式，调用 `switchToWysiwyg()` 同步内容，记录原模式
- [x] 5.3 导出完成后，若原模式为 source，调用 `switchToSource()` 恢复

## 6. 前端导出调用适配

- [x] 6.1 修改 `exportRenderedDocument` 的 HTML/Word 分支，调用新后端命令 `save_document_export` 替代前端 `save()` + `writeFile`
- [x] 6.2 移除对 `@tauri-apps/plugin-dialog` save 函数的依赖（导出场景）
- [x] 6.3 更新错误处理，适配新的后端命令返回值

## 7. 测试

- [x] 7.1 更新 `documentExport.test.ts`，添加正常 load→print 测试
- [x] 7.2 添加源码模式导出测试
- [x] 7.3 添加并发守卫测试
- [x] 7.4 添加图片 data URI 转换测试
