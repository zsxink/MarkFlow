## MODIFIED Requirements

### Requirement: CM6 实例生命周期管理

系统 SHALL 在 lossless 文档打开时创建一个 CodeMirror 6 `EditorView`，并在文档关闭、窗口销毁或 session dispose 时销毁。Source 与 Live Preview 切换 MUST 通过 compartments 重配置同一实例，不得创建第二正文编辑器。

#### Scenario: 打开 lossless 文档时创建 CM6
- **WHEN** 用户通过 lossless path 打开 Markdown 文件
- **THEN** 系统在统一 editor surface 容器内创建一个 `EditorView`
- **THEN** 初始文档为 Core session 返回的完整逻辑 Markdown 文本

#### Scenario: 切换到源码模式时创建 CM6
- **WHEN** 尚未建立统一 editor surface 的迁移期文档首次切换到 Source
- **THEN** 系统为该 lossless session 创建唯一的 CodeMirror 6 `EditorView`
- **THEN** 已存在统一 surface 时复用原实例，不创建第二正文编辑器

#### Scenario: 切换编辑模式不重建 CM6
- **WHEN** 用户从 Source 切换到 Live Preview 或反向切换
- **THEN** 系统重配置 mode/projection compartments
- **THEN** `EditorView` identity、document、selection、scroll、History 和 pending pipeline 保持不变

#### Scenario: 切换到 WYSIWYG 时销毁 CM6
- **WHEN** 用户从 Source 切换到新的 Live Preview/WYSIWYG surface
- **THEN** 系统不得销毁 CodeMirror 6 实例，而是重配置同一 `EditorView`
- **THEN** 只有关闭文档、销毁窗口或 dispose session 才销毁该实例

#### Scenario: 关闭文档时销毁 CM6
- **WHEN** 活动文档被关闭或 session disposed
- **THEN** 系统调用 `view.destroy()` 并取消关联请求
- **THEN** session、binding 和 widgets 不再接收 late result

### Requirement: WYSIWYG 与 Source 双向内容同步

Source 与 Live Preview SHALL 共享同一个 CodeMirror document，不再进行 ProseMirror Markdown 序列化或 `setContent()` 全文同步。模式切换只改变视觉投影和交互扩展，正文与 dirty 状态保持不变。

#### Scenario: Live Preview → Source
- **WHEN** 用户从 Live Preview 切换到 Source
- **THEN** 系统移除或关闭 Live Preview decorations/widgets
- **THEN** 同一 CodeMirror document 显示完整 Markdown 源码
- **THEN** 不产生文档 transaction 或 dirty 变化

#### Scenario: WYSIWYG → Source 同步
- **WHEN** 用户从 Live Preview/WYSIWYG 切换到 Source
- **THEN** 同一 CodeMirror document 直接显示完整 Markdown 源码
- **THEN** 不经过 ProseMirror serializer，且不产生同步 transaction

#### Scenario: Source → Live Preview
- **WHEN** 用户从 Source 切换到 Live Preview
- **THEN** 系统在同一 document 上启用投影扩展
- **THEN** 不调用 Tiptap/ProseMirror 或 Markdown serializer

#### Scenario: Source → WYSIWYG 同步
- **WHEN** 用户从 Source 切换到 Live Preview/WYSIWYG
- **THEN** 系统在同一 CodeMirror document 上启用投影
- **THEN** 文档 bytes、History、selection 与 dirty 状态不因切换改变

#### Scenario: Core reload 同步到 CM6
- **WHEN** 用户确认从磁盘 reload 且 Core 返回新的 confirmed snapshot
- **THEN** active binding 以受控 resync transaction 更新 CodeMirror
- **THEN** session revision、selection 恢复策略和 dirty 状态按 reload 协议更新

#### Scenario: 外部 setMarkdown 同步到 CM6
- **WHEN** 兼容 API `setMarkdown` 请求替换当前文档内容
- **THEN** 请求经 active lossless binding 执行受控 reload 或显式 bulk transaction
- **THEN** CodeMirror 与 Core 收敛到同一 revision，且不得把内容路由到隐藏 ProseMirror

### Requirement: 内容变更追踪

CodeMirror 文档 transaction SHALL 立即更新 optimistic dirty 状态、进入 Core patch pipeline，并触发 `editor:update`。dirty 判断 MUST 使用 pending changes、confirmed revision 与 persisted revision，不得比较 `lastPersistedMarkdown` 或规范化后的全文字符串。

#### Scenario: CM6 内容变更进入 patch pipeline
- **WHEN** 用户在 Source 或 Live Preview 中输入或删除文字
- **THEN** transaction 被提取为有 identity 的局部 patch
- **THEN** store 立即显示 dirty
- **THEN** patch 按单 in-flight 顺序发送到 Core

#### Scenario: CM6 内容变更触发 dirty 检查
- **WHEN** CodeMirror 收到正文变更 transaction
- **THEN** 系统根据 pending changes、confirmed revision 与 persisted revision 更新 dirty
- **THEN** 不比较规范化 Markdown 全文

#### Scenario: CM6 内容变更触发 editor:update
- **WHEN** 用户修改 CodeMirror document
- **THEN** 系统在去抖延迟后发射 `{ type: 'editor:update' }`
- **THEN** outline、stats 和状态栏从 active binding 或 confirmed Core 状态刷新

### Requirement: 统计数据兼容

编辑器 SHALL 在 Source 与 Live Preview 两种模式下通过同一 active CodeMirror binding 或同 revision Core snapshot 获取字数、行数和光标位置，并保持现有公开函数接口兼容。

#### Scenario: 两种模式获取字数与行数
- **WHEN** 在 Source 或 Live Preview 中调用 `getWordCount()` 与 `getLineCount()`
- **THEN** 返回同一 active document revision 的统计结果

#### Scenario: 获取字数
- **WHEN** 在任一编辑模式调用 `getWordCount()`
- **THEN** 返回 active CodeMirror document 或同 revision Core snapshot 的字数

#### Scenario: 获取行数
- **WHEN** 在任一编辑模式调用 `getLineCount()`
- **THEN** 返回 active CodeMirror document 或同 revision Core snapshot 的行数

#### Scenario: 获取光标位置
- **WHEN** 在任一编辑模式调用 `getCursorPos()`
- **THEN** 返回当前 CodeMirror selection 对应的 `{ line, col }`

### Requirement: 焦点管理

Source 与 Live Preview SHALL 使用同一 CodeMirror focus owner。模式切换、工具栏操作和投影 widget 退出后 MUST 恢复可预测的 CodeMirror selection/focus，不得把焦点转移到隐藏 ProseMirror。

#### Scenario: 模式切换保持焦点
- **WHEN** 用户切换 Source/Live Preview
- **THEN** 同一 CodeMirror editor 保持或恢复焦点
- **THEN** 光标位置不变

#### Scenario: CM6 焦点
- **WHEN** editor surface 被要求获取焦点，或模式切换与命令执行完成
- **THEN** 焦点归属唯一的 CodeMirror 6 `EditorView`
- **THEN** selection 对应当前 Markdown source position

#### Scenario: 工具栏命令后恢复焦点
- **WHEN** 用户点击工具栏执行文本命令
- **THEN** 命令作用于 active CodeMirror selection
- **THEN** 命令完成后 CodeMirror 恢复焦点

### Requirement: CM6 工具栏操作支持

系统 SHALL 在 Source 与 Live Preview 中通过统一 command router 支持图片、引用、代码块及其他格式命令。命令 SHALL 生成局部 CodeMirror transaction，并经同一 patch pipeline 同步到 Core。

#### Scenario: 插入图片
- **WHEN** 用户在任一模式调用图片插入
- **THEN** 系统在当前 selection 插入 `![alt](path)` 或替换显式 source range
- **THEN** 该操作形成一个可 Undo transaction
- **THEN** 未触及相邻空行保持不变

#### Scenario: 源码模式插入图片
- **WHEN** 用户在 Source 模式调用图片插入
- **THEN** command router 在当前 selection 生成局部 CodeMirror transaction
- **THEN** transaction 经统一 patch pipeline 同步到 Core

#### Scenario: 插入引用
- **WHEN** 用户在任一模式点击引用按钮
- **THEN** command router 仅对当前行或选区行添加/移除 `> `
- **THEN** 结果以局部 patch 同步到 Core

#### Scenario: 源码模式插入引用
- **WHEN** 用户在 Source 模式点击引用按钮
- **THEN** command router 仅修改当前行或选区行，并保持未触及 bytes 不变

#### Scenario: 插入代码块
- **WHEN** 用户在任一模式点击代码块按钮
- **THEN** command router 使用上下文 fence 风格包裹选区或插入空 fence
- **THEN** 操作不规范化文档其他代码块

#### Scenario: 源码模式插入代码块
- **WHEN** 用户在 Source 模式点击代码块按钮
- **THEN** command router 以一个可 Undo 的局部 transaction 插入或包裹 fence
- **THEN** 操作不重序列化文档其他区域

### Requirement: WYSIWYG → Source 切换保留代码块尾随换行

系统 MUST 因 Source 与 Live Preview 共享同一 CodeMirror document，而在任意次数模式切换后保持代码块内部和 fence 前的全部尾随换行。模式切换本身不得产生正文 transaction。

#### Scenario: 代码块尾随换行在切换时保留
- **WHEN** Live Preview 中代码块结束 fence 前有一个尾随换行
- **AND** 用户切换到 Source
- **THEN** 同一 CodeMirror document 中该换行仍存在

#### Scenario: 多个尾随换行在往返切换时保留
- **WHEN** 代码块结束 fence 前有多个尾随换行
- **AND** 用户在 Source/Live Preview 间多次切换
- **THEN** 所有尾随换行和各自 EOL 保存结果保持不变

#### Scenario: 多个尾随换行在切换时保留
- **WHEN** 代码块结束 fence 前有多个尾随换行
- **AND** 用户执行任意一次 Source/Live Preview 模式切换
- **THEN** 所有尾随换行仍存在于同一 CodeMirror document

## REMOVED Requirements

### Requirement: 序列化完整性检查保留

**Reason**: Lossless path 不再通过 Tiptap/ProseMirror serializer 在模式间转换 Markdown，因此“serializer 截断后的 fallback”不应继续存在于主链。

**Migration**: 用 Core patch flush、revision 校验、save payload hash 与 exact source fallback 验证完整性；legacy path 在迁移期保留自身检查，但不得影响 lossless session。
