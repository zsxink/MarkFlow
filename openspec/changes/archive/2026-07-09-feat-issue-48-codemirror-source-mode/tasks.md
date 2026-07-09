## 1. 准备工作

- [x] 1.1 检查 `@codemirror/lang-markdown` 是否在依赖中；如无则 `npm install @codemirror/lang-markdown`
- [x] 1.2 创建 `src/lib/editor.source.ts` 模块，确定导出接口

## 2. CM6 核心模块（editor.source.ts）

- [x] 2.1 实现 CM6 实例创建函数 `createSourceEditor(container: HTMLElement, content: string, onUpdate: (doc: string) => void): EditorView`
  - 使用 `basicSetup`（来自 `codemirror`）作为基础配置
  - 添加 `markdown()` 语言支持（来自 `@codemirror/lang-markdown`）
  - 配置 `EditorView.updateListener` 捕获内容变更
  - 设置模块级变量 `currentView` 保存实例

- [x] 2.2 实现 CM6 实例销毁函数 `destroySourceEditor(): void`
  - 调用 `view.destroy()` 并清空 `currentView`
  - 移除 `#source-editor-wrapper` 内的 CM6 DOM

- [x] 2.3 实现 CM6 文档替换函数 `setSourceContent(content: string): void`
  - 使用 `view.dispatch({ changes: ... })` 或 `TransactionSpec` 替换全部文档
  - 设置 `programmaticUpdate` 标记，防止触发外部 dirty 检查

- [x] 2.4 实现 `getSourceContent(): string` 从 CM6 读取当前内容
  - 返回 `view.state.doc.toString()`

- [x] 2.5 导出 `getSourceView(): EditorView | null` 供统计数据模块使用

## 3. 修改 mode 切换（editor.ts）

- [x] 3.1 修改 `switchToSource()`：
  - 序列化 Markdown 后，调用 `createSourceEditor()` 而非设置 textarea.value
  - CM6 容器替换 `<textarea id="source-editor">`
  - 保留序列化完整性检查（truncation detect + fallback）
  - 移除 `syncSourceEditorLineNumbers()` 和 `autoGrowSourceEditor()` 的调用

- [x] 3.2 修改 `switchToWysiwyg()`：
  - 从 `getSourceContent()` 读取 CM6 内容而非 textarea.value
  - 调用 `destroySourceEditor()` 销毁 CM6 实例
  - 恢复 WYSIWYG 编辑器焦点

- [x] 3.3 修改 `getMarkdown()`：
  - source 模式时从 CM6 `view.state.doc.toString()` 读取
  - 保持 `normalizeImageMarkdown()` 处理

- [x] 3.4 修改 `setMarkdown()`：
  - source 模式时调用 `setSourceContent()` 而非操作 textarea.value
  - 保持 dirty 同步逻辑

## 4. 更新 initEditor 中的 Source 事件绑定

- [x] 4.1 移除 `#source-editor` textarea 的 input/click/keyup/ResizeObserver 事件监听
- [x] 4.2 在 `createSourceEditor()` 的 `updateListener` 中实现：
  - dirty 检查（`getMarkdown() !== lastPersistedMarkdown`）
  - 去抖发射 `editor:update` 事件
- [x] 4.3 移除 `autoGrowSourceEditor()` 引用（CM6 原生自带滚动）

## 5. 修改统计数据模块（editor.stats.ts）

- [x] 5.1 修改 `getWordCount()` 在源码模式时从 CM6 实例获取内容
- [x] 5.2 修改 `getLineCount()` 使用 `view.state.doc.lines`
- [x] 5.3 修改 `getCursorPos()` 使用 CM6 的 `state.selection.main.head` 计算行列
- [x] 5.4 移除 `getSourceTextarea()` 私有函数

## 6. 清理 State 和 DOM

- [x] 6.1 从 `editor.state.ts` 移除 `setCachedSourceGutterStyles()` / `getCachedSourceGutterStyles()`
- [x] 6.2 从 Store state 类型中移除 `cachedSourceGutterStyles` 字段
- [x] 6.3 更新 `initEditor()` 中的 HTML 模板，用 CM6 容器 div 替换 textarea + gutter
- [x] 6.4 移除不可见的 `syncSourceEditorLineNumbers()` 导出或在内部置空
- [x] 6.5 移除 `autoGrowSourceEditor()` 函数

## 7. 构建与测试

- [x] 7.1 `npm run build` TypeScript 编译通过，无类型错误
- [x] 7.2 `npm test` 全部测试通过
- [ ] 7.3 手动验证：WYSIWYG → Source ↔ WYSIWYG 内容一致性
- [ ] 7.4 手动验证：源码模式语法高亮正确显示
- [ ] 7.5 手动验证：行号显示正确
- [ ] 7.6 手动验证：手动验证保存/dirty 检测正常
- [ ] 7.7 手动验证：统计信息（字数、行数、光标位置）显示正确
