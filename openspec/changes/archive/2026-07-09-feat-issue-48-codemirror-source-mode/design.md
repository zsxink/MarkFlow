## Context

当前 MarkFlow 源码模式使用纯 `<textarea>` 作为编辑器，没有语法高亮、括号匹配、代码折叠等现代编辑功能。`@codemirror/view`、`@codemirror/state`、`codemirror` 全量包以及 `highlight.js` 已在 `package.json` 中，但未被使用。

现有源码模式的核心逻辑分布在 `src/lib/editor.ts` 的几个函数中：
- `switchToSource()` — 从 Tiptap 序列化 Markdown，设置 textarea.value，显示 wrapper
- `switchToWysiwyg()` — 从 textarea.value 读取，设回 Tiptap
- `syncSourceEditorLineNumbers()` — 手动计算行号并写入 gutter DOM
- `autoGrowSourceEditor()` — 手动调整 textarea 高度
- `getMarkdown()` — 从 textarea.value 读取
- `setMarkdown()` — 写入 textarea.value
- `editor.stats.ts` 中从 textarea 获取统计信息

## Goals / Non-Goals

**Goals:**
- 用 CodeMirror 6 替换 textarea，Markdown 获得语法高亮
- 行号由 CM6 原生 gutter 提供，去除自定义行号逻辑
- 括号匹配、代码折叠开箱即用
- 双向同步（WYSIWYG ↔ Source）内容一致性保持
- 不新增外部依赖
- CM6 实例懒创建，切换模式下销毁，不浪费内存

**Non-Goals:**
- 不改变 WYSIWYG 模式（Tiptap）的任何行为
- 不添加 Markdown 编辑特有的预览面板（如分栏编辑/预览）
- 不做 CM6 ↔ Tiptap 实时双向同步（仅切换时同步，非同时显示）
- 不做 CM6 主题自定义（使用 CM6 默认浅色主题，后续可配）
- 不替换 Tiptap 代码块中的语法高亮（ProseMirror 代码块仍使用已有方案）

## Decisions

### D1: 使用 `codemirror` 全量包 vs 组合 `@codemirror/*` 子包

**决定**：使用 `codemirror` 全量包（`import { basicSetup } from 'codemirror'`）。

**理由**：`basicSetup` 包含行号（`lineNumbers()`）、活动行高亮（`highlightActiveLineGutter()`/`highlightActiveLine()`）、括号匹配（`bracketMatching()`）、代码折叠（`foldGutter()`/`indentOnInput()`）、历史（`history()`/`historyKeymap()`）等所有需要的功能，一包即可。避免逐个挑选子包的组合成本和维护开销。`codemirror` 全量包已在依赖中。

**替代方案**：逐个引入 `@codemirror/basic-setup` 子包可获得更细的控制，但当前需求没有需要定制的部分，全量包更简洁。

### D2: CM6 实例保存方式

**决定**：在 `editor.source.ts` 模块中通过模块级变量 `let currentView: EditorView | null = null` 保存当前 CM6 实例，通过 `getSourceView()`/`setSourceView()` 访问。

**理由**：
- CM6 实例仅在源码模式活跃时存在，不是持久状态
- 模块级变量比 Store 更轻量，不需要序列化
- 与 `editor.state.ts` 中 `editor` 变量模式一致

**替代方案**：存入 Store 的 Zustand 状态 — 过重，CM6 实例不可序列化，Store 不适合存非持久化实例引用。

### D3: 语法高亮方案

**决定**：使用 `@codemirror/lang-markdown`（CM6 官方 Markdown 语言支持，已在 `codemirror` 全量包内部依赖中），而非配置 `highlight.js`。

**理由**：
- `@codemirror/lang-markdown` 是 CM6 生态的一等公民，与 CM6 的语法树、折叠、括号匹配等深度集成
- 配置简单：`import { markdown } from '@codemirror/lang-markdown'`
- `highlight.js` 对于 CM6 需要额外的 bridge（如 `@codemirror/lang-html` 配合 `lang-hljs`），增加复杂度
- `highlight.js` 可以作为代码块的备用高亮方案（`markdown({codeLanguages: ...})`）

**注意**：`codemirror` 全量包不自动引入 `@codemirror/lang-markdown`，需要额外 import 安装。检查 `@codemirror/lang-markdown` 是否已在依赖中 — 如不在需 `npm install @codemirror/lang-markdown`。

### D4: CM6 实例生命周期绑定

**决定**：CM6 在 `switchToSource()` 中创建，在 `switchToWysiwyg()` 中销毁。

**理由**：
- 与 issue #48 提案一致，CM6 只在源码模式激活时存活
- 避免在 WYSIWYG 模式下维护不需要的编辑器实例
- 创建时直接用 Tiptap 序列化的 Markdown 初始化，无需后续同步

### D5: 内容同步策略

**决定**：切换时一次性全量同步，无实时双向绑定。

**理由**：
- MarkFlow 的源码模式和 WYSIWYG 模式是互斥切换，不是分栏同时编辑
- 不需要 CM6 的每次修改都实时同步到 Tiptap（Tiptap 不在前台）
- 切换时全量替换是最可靠的方案，避免增量同步产生的状态不一致
- CM6 → Tiptap 方向：`switchToWysiwyg()` 中 `view.state.doc.toString()` 读取全部内容
- Tiptap → CM6 方向：`switchToSource()` 中 `view.dispatch({changes: ...})` 替换整个文档

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| `@codemirror/lang-markdown` 不在依赖中 | 需要额外 `npm install` | 先检查依赖；作为 dev 成本接受 |
| CM6 实例销毁/重建的性能开销（大规模文档） | 切换模式时可能有短暂卡顿 | 目前文档规模较小（单个 Markdown 文件），CM6 初始化开销可忽略 |
| textarea 的 Event 监听器需要全面迁移到 CM6 | 事件绑定逻辑重复或遗漏 | `EditorView.updateListener` 统一捕获变更，移除所有 textarea 事件监听 |
| `highlight.js` 依赖变为 unused | 遗留依赖 | 保留在 `package.json` 中不主动移除，其他模块（如 ProseMirror 代码块）可能使用 |
| `editor.stats.ts` 中直接引用的 DOM id `#source-editor` 不复存在 | 统计函数在源码模式时工作异常 | 改为通过 CM6 实例 `view.state` 获取内容；保持函数签名兼容 |
| `syncSourceEditorLineNumbers()` 外部可能被引用 | 调用报错或空操作 | 函数保留但标记 `@deprecated`，内部返回空 |
