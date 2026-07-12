## 1. 实现滚动重置

- [x] 1.1 在 `src/lib/editor.ts` 中新增 `resetEditorScroll()` 函数，使用 `scrollTo({ top: 0, behavior: 'auto' })` 重置 `#editor-area` 滚动位置
- [x] 1.2 在 `src/components/sidebar.fileops.ts` 的 `openFileInEditor` 中，`setMarkdown(content)` 之后、`refreshOutline()` 之前调用 `resetEditorScroll()`

## 2. 验证

- [x] 2.1 WYSIWYG 模式：长文档滚到底部 → 切换到短文档 → 首行完整可见且 `scrollTop === 0`
- [x] 2.2 源码模式：重复上述场景
- [x] 2.3 外部修改触发 `reloadActiveDocumentFromDisk` 时保持原滚动位置
- [x] 2.4 点击当前已打开的同一文件时，不触发滚动重置（`openFileInEditor` 早期 return）
- [x] 2.5 运行 `npm test` 确认无回归
