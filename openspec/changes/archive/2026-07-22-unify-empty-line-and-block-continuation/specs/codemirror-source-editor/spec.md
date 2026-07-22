## ADDED Requirements

### Requirement: CM6 工具栏操作支持

系统 SHALL 支持在 CM6 源码模式下通过工具栏插入图片、引用和代码块。操作 SHALL 使用 CM6 `EditorView.dispatch` API，而非操作隐藏的 ProseMirror 编辑器。

#### Scenario: 源码模式插入图片
- **WHEN** 用户处于源码模式且调用图片插入
- **THEN** 系统通过 `getSourceView().dispatch` 在 CM6 当前选区插入 `![alt](path)` Markdown
- **THEN** 插入后光标位于插入文本末尾
- **WHEN** 有选中文本时插入图片
- **THEN** 选中文本被替换为图片 Markdown

#### Scenario: 源码模式插入引用
- **WHEN** 用户处于源码模式且在工具栏点击引用按钮
- **THEN** 系统通过 CM6 API 在当前行或选区前加 `> ` 前缀
- **WHEN** 有选区时
- **THEN** 选区每行前均添加 `> ` 前缀
- **WHEN** 无选区时
- **THEN** 在当前行前插入 `> `，并将光标放在 `> ` 之后

#### Scenario: 源码模式插入代码块
- **WHEN** 用户处于源码模式且在工具栏点击代码块按钮
- **THEN** 系统通过 CM6 API 将选区内容包裹在 `\`\`\`` 围栏中
- **WHEN** 有选区时
- **THEN** 选区上方插入 `\`\`\``，下方插入 `\`\`\``，光标位于结束围栏之前
- **WHEN** 无选区时
- **THEN** 插入两个空 `\`\`\`\n\n\`\`\` 围栏，光标位于围栏内部
