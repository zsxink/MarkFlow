## MODIFIED Requirements

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

### Requirement: 焦点管理

单一 CodeMirror 编辑视图 SHALL 在 Source 和 WYSIWYG 下保持焦点语义。工具栏、菜单和 widget 操作 SHALL 恢复到正确文本 selection 或结构化焦点，不得把焦点发送到隐藏 ProseMirror。

#### Scenario: 模式切换保持焦点
- **WHEN** 用户切换 Source 或 WYSIWYG
- **THEN** 同一 CodeMirror EditorView 保持或恢复焦点
- **THEN** 当前 selection 不发生无意变化

#### Scenario: Widget 操作返回文本流
- **WHEN** 用户提交或取消结构化 widget 操作
- **THEN** 焦点返回该 block 的稳定文本锚点或下一个可编辑位置

## REMOVED Requirements

### Requirement: 序列化完整性检查保留
**Reason**: Source 与 WYSIWYG 不再维护 Tiptap 文档或执行全文 serializer 同步，完整性由同一 Markdown mirror、Core revision 和 byte-preserving tests 保证。
**Migration**: 将原序列化检查替换为 Core revision barrier、source hash 校验和 resync integrity gate。
