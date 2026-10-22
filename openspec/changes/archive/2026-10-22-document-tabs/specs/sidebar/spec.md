# Sidebar delta

## MODIFIED Requirements

### Requirement: 文件转换确认
系统 MUST 在关闭文档或替换工作区会丢弃文档时确认未保存的更改与外部冲突；打开其他文件与切换标签 MUST 保留原会话且不弹未保存确认。

#### Scenario: 切换前保留未保存的更改
- **WHEN** 当前文档有未保存更改或外部冲突且用户打开其他文件
- **THEN** SHALL 新建或复用标签并保留原文档，不弹未保存确认

#### Scenario: 与外部冲突确认
- **WHEN** 用户关闭有未保存修改或外部冲突的文档
- **THEN** SHALL 显示保存、不保存和取消，保存失败或取消不得关闭


#### Scenario: 清洁时跳过确认
- **WHEN** 用户切换文档且当前文档没有脏状态和外部修改
- **THEN** SHALL 不显示确认并保留原标签


### Requirement: 活动文件路径状态管理
系统 MUST 管理活动文件路径状态并将其与文件树 UI 同步。

#### Scenario: 设置活动文件路径更新树选择
- **WHEN** `setActiveFilePath(path)` 被调用
- **THEN** 文件树应突出显示匹配的文件节点
- **THEN** `getActiveFilePath()` 应返回新路径

#### Scenario: 清除活动文档重置状态
- **WHEN** `clearActiveDocument()` 被调用
- **THEN** 活动文件路径应设置为空
- **THEN** 编辑内容SHALL被清除
- **THEN** 大纲须刷新
- **THEN** 树选择应被清除

#### Scenario: 重写打开文档路径
- **WHEN** 目录被重命名
- **AND** `rewriteActiveDocumentPath(from, to)` 被调用
- **THEN** 所有匹配标签的路径与活动文件路径应更新以反映新的路径前缀

#### Scenario: 如果路径匹配则清除活动文档
- **WHEN** 文件或目录被删除
- **AND** 匹配活动文档路径
- **THEN** SHALL 仅处理匹配标签，并在丢弃脏内容前确认


### Requirement: 处理外部文件删除
The system SHALL route external deletion to every matching open document. Background documents SHALL retain memory and defer the deletion prompt until activation; active documents SHALL offer keep, discard, and save-as without silently recreating a deleted file.

#### Scenario: 清理外部删除的干净文档
- **WHEN** `handleExternalDeletion(path)` 被调用
- **AND** 活动文档没有脏，没有外部修改
- **THEN** SHALL 明确提示删除并保留内容，只有用户明确放弃后才关闭标签

#### Scenario: 外部删除的脏文档 — 丢弃
- **WHEN** `handleExternalDeletion(path)` 被调用
- **AND** 活动文档脏或有外部修改
- **AND** 用户选择"discard"
- **THEN** SHALL 关闭对应标签并激活相邻标签，其他标签保持完整
- **THEN** 函数应返回`'discarded'`

#### Scenario: 外部删除的脏文档 — 重新保存
- **WHEN** `handleExternalDeletion(path)` 被调用
- **AND** 活动文档脏或有外部修改
- **AND** 用户选择另存为
- **THEN** SHALL 提示新路径并仅在成功保存后更新对应标签，失败保留内存
- **THEN** 不得静默重建已删除路径

#### Scenario: 无关删除被忽略
- **WHEN** `handleExternalDeletion(path)` 被调用
- **AND** 路径与活动文档不匹配
- **THEN** 函数应返回`'ignored'`
