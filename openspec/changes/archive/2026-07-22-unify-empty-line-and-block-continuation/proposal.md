## Why

用户在源码模式输入的空行会被图片归一化逻辑全局压缩，导致明确输入的空行在保存后丢失；同时，文档末尾的图片、引用、代码块等特殊块后缺乏统一的续写段落保障，用户需要额外操作才能继续写作。这两个问题都涉及"真实 Markdown 空白"与"编辑器续写入口"的边界，目前两种编辑模式的规则不一致。

## What Changes

1. **源码模式空行保留**：`normalizeImageMarkdown()` 的换行压缩范围从全局改为仅作用于图片节点附近，不再压缩用户明确输入的空行。
2. **WYSIWYG 末尾续写段落**：图片、引用、代码块插入/转换时，若位于文档末尾，自动在块后创建一个普通段落作为续写入口；不污染 Markdown 源码。
3. **源码模式工具栏适配 CM6**：图片、引用、代码块工具栏操作通过 CM6 API 在当前选区插入 Markdown，不再操作隐藏的 ProseMirror 或旧 textarea。
4. **WYSIWYG 空段落不污染 Markdown**：末尾空段落作为临时编辑状态，不编码进 Markdown，不引入 `&nbsp;`、零宽字符或额外 HTML。

## Capabilities

### New Capabilities
- `empty-line-preservation`: 源码模式空行保留规则，`normalizeImageMarkdown()` 仅处理图片附近换行，不全局压缩空行
- `block-continuation-paragraph`: 特殊块（图片、引用、代码块）后自动创建续写段落的行为规则
- `source-toolbar-cm6`: 源码模式工具栏操作适配 CodeMirror 6 API

### Modified Capabilities
- `codemirror-source-editor`: 新增工具栏操作（图片、引用、代码块）的 CM6 API 适配要求
- `enter-content-integrity`: 新增特殊块后续写段落的行为要求，以及 WYSIWYG 空段落不污染 Markdown 的要求
- `editor-bottom-spacer`: 无变更（续写段落是内容层行为，不改变底部留白）

## Impact

- **`src/lib/editor.serializer.ts`** — `normalizeImageMarkdown()` 换行压缩范围缩小
- **`src/lib/editor.ts`** — `setImage()`、`toggleBlockquote()`、`toggleCodeBlock()` 增加末尾续写段落逻辑
- **`src/lib/editor.source.ts`** — 新增 CM6 工具栏操作（图片、引用、代码块插入）
- **`src/components/toolbar.ts`** — 源码模式工具栏按钮适配 CM6 API
- **`src/lib/editor.serializer.test.ts`** — 新增空行保留、续写段落、多图片插入等测试
- **`src/lib/editor.extensions.ts`** — 可能涉及 Tiptap 扩展调整
