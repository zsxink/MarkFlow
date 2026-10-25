# Spec Delta

## ADDED Requirements

### Requirement: 活动文档窗口标题与未保存标识

窗口标题栏 MUST 显示当前活动文档的文件名；活动文档存在未保存更改时，文件名后 MUST 显示 `*`。保存成功、切换活动文档及关闭最后一个标签时，标题 MUST 与活动文档状态同步；没有活动文档时标题回落为 `MarkFlow`。

#### Scenario: 显示当前文件名
- **WHEN** 用户打开或切换到一个文档标签
- **THEN** 窗口标题栏显示该活动文档的文件名

#### Scenario: 未保存更改标记
- **WHEN** 活动文档被编辑且尚未保存
- **THEN** 窗口标题文件名后显示一个星号 `*`

#### Scenario: 保存后移除标记
- **WHEN** 活动文档保存成功
- **THEN** 窗口标题文件名后的 `*` 消失

#### Scenario: 无活动文档
- **WHEN** 用户关闭最后一个标签
- **THEN** 窗口标题显示 `MarkFlow`

