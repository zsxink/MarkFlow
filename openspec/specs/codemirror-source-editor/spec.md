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

系统 SHALL 为活动文档维护单一 CodeMirror 6 EditorView。Source 与 WYSIWYG 切换 SHALL 通过 Compartment 或等效 extension reconfiguration 完成，不得销毁 EditorView、替换 document 或创建并行编辑实例。关闭文档或窗口时 SHALL 销毁实例并清理插件、请求和 widget。

#### Scenario: 打开文档时创建唯一 CM6
- **WHEN** Core session 成功打开活动文档
- **THEN** 系统在编辑器容器内创建一个 CM6 EditorView
- **THEN** Source 或 WYSIWYG 模式只改变该实例的 extension 配置

#### Scenario: 模式切换不销毁 CM6
- **WHEN** 用户在 Source 和 WYSIWYG 之间切换
- **THEN** `view.destroy()` 不被调用
- **THEN** selection、scroll、document、pending patches 和 History 保持

#### Scenario: 文档关闭时释放资源
- **WHEN** 活动文档关闭或窗口销毁
- **THEN** 系统销毁 CM6 实例并取消绑定的 render、widget 和 patch 任务

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

Source 与 WYSIWYG SHALL 直接共享同一个 CodeMirror Markdown document 和 Core confirmed session，不存在模式间全文内容同步。模式切换只 reconfigure projection extensions，并在需要离开当前 revision barrier 时执行 Core flush。

#### Scenario: WYSIWYG → Source 共享内容
- **WHEN** 用户从 WYSIWYG 切换到 Source
- **THEN** Source 立即显示同一 CodeMirror document 的完整 Markdown
- **THEN** 不调用 serializer、`setContent` 或全文替换

#### Scenario: Source → WYSIWYG 共享内容
- **WHEN** 用户从 Source 切换到 WYSIWYG
- **THEN** 系统在同一 EditorView 上启用 Live Preview extensions
- **THEN** 不重新解析或注入第二份文档内容

#### Scenario: 外部 confirmed snapshot 重同步
- **WHEN** Runtime resync 返回合法 confirmed snapshot
- **THEN** Adapter 使用标记为 resync 的 transaction 更新同一 CodeMirror document
- **THEN** dirty、selection、History 和 pending state 按 resync 规范恢复

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

单一 CodeMirror 编辑视图 SHALL 在 Source 和 WYSIWYG 下保持焦点语义。工具栏、菜单和 widget 操作 SHALL 恢复到正确文本 selection 或结构化焦点，不得把焦点发送到隐藏 ProseMirror。

#### Scenario: 模式切换保持焦点
- **WHEN** 用户切换 Source 或 WYSIWYG
- **THEN** 同一 CodeMirror EditorView 保持或恢复焦点
- **THEN** 当前 selection 不发生无意变化

#### Scenario: Widget 操作返回文本流
- **WHEN** 用户提交或取消结构化 widget 操作
- **THEN** 焦点返回该 block 的稳定文本锚点或下一个可编辑位置

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

### Requirement: WYSIWYG → Source 切换保留代码块尾随换行

系统 MUST 确保从 WYSIWYG 切换到源码模式时，围栏代码块末尾的尾随换行在 CM6 文档中保留。

#### Scenario: 代码块尾随换行在切换时保留
- **WHEN** WYSIWYG 模式中代码块末尾有一个尾随换行
- **WHEN** 用户切换到源码模式
- **THEN** CM6 文档中结束围栏前保留该尾随换行

#### Scenario: 多个尾随换行在切换时保留
- **WHEN** WYSIWYG 模式中代码块末尾有多个尾随换行
- **WHEN** 用户切换到源码模式
- **THEN** CM6 文档中结束围栏前保留所有尾随换行
