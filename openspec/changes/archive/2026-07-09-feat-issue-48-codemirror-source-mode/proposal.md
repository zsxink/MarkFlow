## Why

源码模式下使用原生 `<textarea>` 没有语法高亮、括号匹配、代码折叠等现代编辑器基本功能，影响 Markdown 编辑体验。CodeMirror 6 的依赖已在 `package.json` 中，但未使用。替换后能获得开箱即用的语法高亮（通过 highlight.js 语言包）、括号匹配、代码折叠、行号原生支持，且与现有 Tiptap/ProseMirror 无缝共存。

## What Changes

- 创建 `src/lib/editor.source.ts`，封装 CodeMirror 6 `EditorView` 的创建、销毁与双向同步
- `initEditor()` 中 `source-editor-wrapper` 内用 CM6 容器替换 `<textarea>`
- `switchToSource()` 用 CM6 实例替代 textarea 赋值逻辑
- `switchToWysiwyg()` 从 CM6 读取内容而非 textarea
- `getMarkdown()` 从 CM6 的 state.doc 而非 textarea.value 读取
- `setMarkdown()` 写入 CM6 文档 model 而非 textarea.value
- 移除自定义行号计算 `syncSourceEditorLineNumbers()`、`autoGrowSourceEditor()`、自定义 gutter DOM
- `editor.stats.ts` 从 CM6 实例获取光标/字数/行数信息
- `editor.state.ts` 移除 `cachedSourceGutterStyles` 相关函数（由 CM6 原生 gutter 替代）
- CM6 只在 source mode 激活时创建，切换到 WYSIWYG 时销毁，不占用内存
- 不新增依赖（`@codemirror/state`、`@codemirror/view`、`codemirror`、`highlight.js` 已在 package.json 中）
- **BREAKING**: `cachedSourceGutterStyles` 状态字段从 Store 中移除；对外暴露的 DOM id `#source-editor` 不复存在

## Capabilities

### New Capabilities

- `codemirror-source-editor`: CodeMirror 6 源码编辑器模块。负责 CM6 实例的创建、配置（Markdown 语法高亮、行号、括号匹配、代码折叠）、与文档状态的双向同步、资源管理（创建/销毁生命周期）

### Modified Capabilities

<!-- No existing spec-level requirements are changing; this is a pure implementation replacement -->

## Impact

- **修改的文件**：
  - `src/lib/editor.ts` — 重写 source mode 相关的 DOM 操作和同步逻辑
  - `src/lib/editor.state.ts` — 移除 `cachedSourceGutterStyles`
  - `src/lib/editor.stats.ts` — 改为从 CM6 实例获取统计信息
  - `src/utils/keyboard.ts` — 无变化（导入的 `switchToSource`/`switchToWysiwyg` 接口不变）
  - `src/components/toolbar.ts` — 可能需要适配 CM6 实例的焦点管理
- **新增文件**：
  - `src/lib/editor.source.ts` — CM6 封装模块
- **移除的逻辑**：
  - `syncSourceEditorLineNumbers()` — 由 CM6 `lineNumbers()` 扩展替代
  - `autoGrowSourceEditor()` — 由 CM6 内建滚动容器替代
  - DOM id `#source-editor`（textarea）— 改为 CM6 的 `.cm-editor`
  - DOM id `#source-editor-gutter` — 由 CM6 的 gutter 替代
  - Store 字段 `cachedSourceGutterStyles` — 不再需要
- **依赖**：无新增（均已在 `package.json` 中）
- **测试**：现有的统计函数（`getWordCount`、`getLineCount`、`getCursorPos`）需要更新内部实现，保持接口不变
