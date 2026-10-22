# Keyboard delta

## ADDED Requirements

### Requirement: 多文档标签快捷键
系统 MUST 支持 Ctrl/Cmd+T 新建空白标签、Ctrl/Cmd+W 关闭活动标签、Ctrl/Cmd+Shift+T 恢复最近关闭、Ctrl+Tab 与 Ctrl+Shift+Tab 循环切换，并阻止已处理命令的默认行为。设置或确认模态显示时 MUST 抑制标签命令。鼠标中键 MUST 关闭目标标签。

#### Scenario: 循环切换
- **WHEN** 用户在末尾标签按 Ctrl+Tab 或首个标签按 Ctrl+Shift+Tab
- **THEN** SHALL 分别循环到首个或末尾标签，保留各自未保存内容

#### Scenario: 模态保护
- **WHEN** 设置或确认模态打开且用户触发标签快捷键
- **THEN** SHALL 不新建、不切换、不关闭标签

#### Scenario: 中键关闭
- **WHEN** 用户在非活动标签上按鼠标中键
- **THEN** SHALL 针对该标签执行关闭语义，并阻止浏览器中键默认行为
