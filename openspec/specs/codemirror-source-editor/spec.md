# codemirror-source-editor Specification

## Purpose
定义 CodeMirror 6 源码编辑器的生命周期、Markdown 编辑能力以及与 WYSIWYG 模式的内容同步。

## Agent Context
- **源码入口：** `src/lib/editor.source.ts`、`src/lib/editor.ts`、`src/lib/editor.state.ts`、`src/lib/editor.stats.ts` 和 `src/styles/editor.css`。
- **关联规范：** `type-system`、`enter-content-integrity`、`document-size-tier`、`autosave-reliability`。
- **不变量：** 同一时刻只存在一个当前模式的编辑器视图；模式切换不得丢失 Markdown 或错误改变 dirty 状态；程序化写入必须避免被当作用户编辑，源码模式的只读状态必须与 store 一致。
- **验证：** `npm test -- src/lib/editor.state.test.ts src/lib/editor.helpers.test.ts src/lib/editor.serializer.test.ts`；`npm run build`；`npx openspec validate codemirror-source-editor --strict`。

## Requirements

### Requirement: CM6 实例生命周期管理

系统 SHALL 在用户切换到源码模式时创建 CodeMirror 6 实例，并在切换到 WYSIWYG 模式时销毁实例。不在 WYSIWYG 模式时，CM6 实例不应占用内存。

#### Scenario: 切换到源码模式时创建 CM6
- **WHEN** 用户从 WYSIWYG 切换到源码模式
- **THEN** 系统在 `#source-editor-wrapper` 内创建 CM6 `EditorView`，初始内容为当前文档的 Markdown 源码
- **THEN** `#source-editor-wrapper` 的 `hidden` 属性被移除

#### Scenario: 切换到 WYSIWYG 时销毁 CM6
- **WHEN** 用户从源码模式切换到 WYSIWYG
- **THEN** 系统调用 `view.destroy()` 销毁 CM6 实例，释放所有资源

### Requirement: Markdown 语法高亮

源码编辑器 SHALL 对 Markdown 内容提供语法高亮，支持至少以下元素的高亮：标题（#）、粗体、斜体、代码行/代码块、列表、引用、链接、图片、水平线、表格。

#### Scenario: 标题高亮
- **WHEN** 源码中包含 `# 标题` 行
- **THEN** `#` 符号和标题文字以不同颜色/样式显示

#### Scenario: 代码块高亮
- **WHEN** 源码中包含围栏代码块（\`\`\`）
- **THEN** 代码块内部以等宽字体显示，背景色与其他内容区分

### Requirement: 行号

源码编辑器 SHALL 在左侧显示行号，行号应与装订线（gutter）区域一起自动计算。当前活动行行号 SHOULD 高亮。

#### Scenario: 行号显示
- **WHEN** 源码编辑器加载
- **THEN** 左侧 gutter 区域显示从 1 开始的行号
- **THEN** 当前光标所在行的行号高亮

### Requirement: 括号匹配

源码编辑器 SHALL 支持括号匹配高亮。当光标位于括号（`()`, `[]`, `{}`）上时，对应的匹配括号 SHALL 高亮显示。

#### Scenario: 括号匹配
- **WHEN** 光标位于一个开括号 `[` 上
- **THEN** 对应的闭括号 `]` 也被高亮

### Requirement: 代码折叠

源码编辑器 SHALL 支持代码折叠。在可折叠的元素（如代码块、HTML 注释）左侧 gutter 中 SHALL 显示折叠手柄。

#### Scenario: 代码块折叠
- **WHEN** 鼠标悬停在代码块左侧 gutter
- **THEN** 显示折叠箭头
- **WHEN** 点击折叠箭头
- **THEN** 代码块内容被折叠隐藏，gutter 显示展开箭头

### Requirement: WYSIWYG 与 Source 双向内容同步

系统 SHALL 确保 WYSIWYG 和 Source 模式间的内容一致性。切换模式时，源编辑器内容 SHALL 精确反映 WYSIWYG 编辑器的 Markdown 序列化结果；切换回 WYSIWYG 时，源编辑器修改 SHALL 完全应用到 Tiptap 文档。

#### Scenario: WYSIWYG → Source 同步
- **WHEN** 用户从 WYSIWYG 切换到源码模式
- **THEN** CM6 文档内容 = Tiptap 的 `editor.storage.markdown.getMarkdown()` 序列化结果
- **THEN** dirty 标志不变

#### Scenario: Source → WYSIWYG 同步
- **WHEN** 用户从源码模式切换到 WYSIWYG
- **THEN** Tiptap `setContent(content)` 接收 CM6 文档当前内容
- **THEN** 同步后 CM6 实例被销毁

#### Scenario: 外部 setMarkdown 同步到 CM6
- **WHEN** 系统调用 `setMarkdown(content)` 且当前为源码模式
- **THEN** CM6 文档被替换为新的 content（通过 `view.dispatch({changes})` 使用 `programmaticUpdate` 标记）

### Requirement: 内容变更追踪

源码编辑器的内容变更 SHALL 触发 dirty 标志检查和 `editor:update` 事件，与 WYSIWYG 模式行为一致。

#### Scenario: CM6 内容变更触发 dirty 检查
- **WHEN** 用户在源码编辑器中输入或删除文字
- **THEN** 系统检查当前文档与 `lastPersistedMarkdown` 是否一致，更新 store 的 `dirty` 状态

#### Scenario: CM6 内容变更触发 editor:update
- **WHEN** 用户在源码编辑器中输入或修改内容
- **THEN** 系统在去抖延迟后发射 `{ type: 'editor:update' }` 事件（~80ms）

### Requirement: 统计数据兼容

源码编辑器 SHALL 支持通过 CM6 实例获取字数、行数、光标位置等统计信息，保持与现有 `getWordCount`、`getLineCount`、`getCursorPos` 函数接口兼容。

#### Scenario: 获取字数
- **WHEN** 源码模式激活时调用 `getWordCount()`
- **THEN** 返回 CM6 文档内容的字数统计

#### Scenario: 获取行数
- **WHEN** 源码模式激活时调用 `getLineCount()`
- **THEN** 返回 CM6 文档的行数（`view.state.doc.lines`）

#### Scenario: 获取光标位置
- **WHEN** 源码模式激活时调用 `getCursorPos()`
- **THEN** 返回 `{ line, col }` 对象，与 textarea 时代格式一致

### Requirement: Store 字段清理

Store SHALL 移除不再使用的 `cachedSourceGutterStyles` 字段。导入该字段的消费者需适配。

#### Scenario: cachedSourceGutterStyles 不存在
- **WHEN** 任何代码引用 `store.getState().cachedSourceGutterStyles`
- **THEN** 返回 `undefined`
- **WHEN** 调用 `setCachedSourceGutterStyles()`
- **THEN** 不再写入 store（函数可保留为空操作或移除）

### Requirement: 移除 DOM 依赖

不在源码模式时，`#source-editor`（textarea）和 `#source-editor-gutter` DOM 元素 SHALL 不存在于 `source-editor-wrapper` 中。改为 CM6 的 `.cm-editor` 容器。

#### Scenario: CM6 容器存在
- **WHEN** 源码模式激活
- **THEN** CM6 实例的 DOM 根节点（`.cm-editor`）位于 `#source-editor-wrapper` 内
- **THEN** `document.getElementById('source-editor')` 返回 `null`
- **THEN** `document.getElementById('source-editor-gutter')` 返回 `null`

### Requirement: 焦点管理

源码模式时焦点事件 SHALL 正确传递给 CM6，WYSIWYG 模式时焦点事件 SHALL 正确传递给 Tiptap。

#### Scenario: CM6 焦点
- **WHEN** 切换到源码模式
- **THEN** CM6 实例自动获取焦点
- **WHEN** 点击工具栏操作（如保存）
- **THEN** CM6 实例不因此失去焦点或状态

### Requirement: 序列化完整性检查保留

切换模式时，Markdown 序列化完整性检查 SHALL 在 Tiptap → CM6 方向保留。即 WYSIWYG → Source 切换时，仍需检查 Tiptap Markdown 序列化是否截断。

#### Scenario: 序列化完整性检查
- **WHEN** WYSIWYG → Source 切换，且序列化完整性检查失败
- **THEN** 使用 fallback 内容填充 CM6 文档而非直接使用序列化结果
- **THEN** toast 通知用户序列化异常
