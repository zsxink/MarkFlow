# source-toolbar-cm6 Specification

## Purpose
定义源码模式下工具栏操作（图片、引用、代码块）使用 CodeMirror 6 API 执行 Markdown 插入的规则。

## Agent Context
- **源码入口：** `src/components/toolbar.ts`、`src/lib/editor.source.ts`、`src/lib/editor.ts`
- **关联规范：** `codemirror-source-editor`、`block-continuation-paragraph`
- **不变量：** CM6 模式下的所有工具栏块操作必须通过 `view.dispatch` API 而非操作隐藏的 ProseMirror 编辑器；WYSIWYG 模式下保持 Tiptap 命令操作。
- **验证：** `npm run build`；手动验证两个编辑模式下工具栏操作的正确性。

## Requirements

### Requirement: 按当前编辑模式分发工具栏操作

工具栏中的块级插入操作（图片、引用、代码块）SHALL 根据当前模式（`getMode()` 返回值）选择不同的执行路径：
- WYSIWYG 模式：使用 Tiptap `editor.chain().focus()` 命令
- 源码模式：使用 CM6 `getSourceView().dispatch()` API

#### Scenario: WYSIWYG 模式使用 Tiptap 命令
- **WHEN** 当前模式为 WYSIWYG
- **AND** 用户点击引用按钮
- **THEN** 调用 `getEditor()?.chain().focus().toggleBlockquote().run()`
- **WHEN** 当前模式为 WYSIWYG
- **AND** 用户点击代码块按钮
- **THEN** 调用 `getEditor()?.chain().focus().toggleCodeBlock().run()`

#### Scenario: 源码模式使用 CM6 API
- **WHEN** 当前模式为 source
- **AND** 用户点击引用按钮
- **THEN** 通过 `getSourceView().dispatch()` 在当前选区行前添加 `> ` 前缀
- **WHEN** 当前模式为 source
- **AND** 用户点击代码块按钮
- **THEN** 通过 `getSourceView().dispatch()` 用 `\`\`\`` 围栏包裹选区

### Requirement: 图片操作在两个模式已有适配

图片插入操作 `insertImageSrc()` SHALL 保持双模式适配，本规范不做修改。

#### Scenario: 源码模式图片插入
- **WHEN** 当前模式为 source
- **AND** 调用 `insertImageSrc(src)`
- **THEN** 通过 `view.dispatch()` 在 CM6 中插入 `![alt](src)` 文本
- **THEN** 光标位于插入文本末尾

### Requirement: 源码模式工具栏焦点保持

CM6 模式下的工具栏操作执行后，焦点 SHALL 回到 CM6 编辑器，避免工具栏点击导致编辑器失焦。

#### Scenario: 工具栏操作后焦点回到 CM6
- **WHEN** 当前模式为 source
- **AND** 用户点击工具栏按钮（引用/代码块/图片）
- **THEN** 操作执行后调用 `view.focus()` 使焦点回到 CM6 编辑器
