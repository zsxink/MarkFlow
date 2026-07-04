## ADDED Requirements

### Requirement: Window close intercept with dirty detection

当用户尝试关闭窗口时，系统检测当前文档是否有未保存的修改，并在必要时弹出保存确认对话框。

系统 SHALL 在窗口关闭前调用 `isDocumentDirty()` 检测当前文档是否为 dirty 状态。
系统 MUST 在文档为 dirty 时阻止窗口关闭，并显示未保存提示对话框。
系统 MAY 在文档为 clean（无未保存修改）时直接关闭窗口，不弹出任何提示。

#### Scenario: 未保存修改时关闭窗口
- **WHEN** 用户点击窗口关闭按钮（或 Cmd+W）关闭窗口
- **AND** 当前文档有未保存修改（`isDocumentDirty()` 返回 true）
- **THEN** 系统弹出保存确认对话框，窗口不关闭

#### Scenario: 无未保存修改时关闭窗口
- **WHEN** 用户关闭窗口
- **AND** 当前文档无未保存修改（`isDocumentDirty()` 返回 false）
- **THEN** 系统直接关闭窗口，不弹出提示

### Requirement: Save confirm dialog

保存确认对话框 SHALL 提供三个选项：保存并关闭、不保存直接关闭、取消关闭。

对话框布局 SHALL 遵循 `dialog-system` 规范中定义的 modal-overlay → modal → modal-header + content + modal-footer 结构。
对话框标题 SHALL 为「未保存的更改」。
对话框正文 SHALL 显示提示信息「当前文件有未保存的更改。」。
「保存」按钮 SHALL 触发保存操作后关闭窗口。
「不保存」按钮 SHALL 直接关闭窗口，放弃修改。
「取消」按钮 SHALL 关闭对话框，窗口保持打开状态。

按钮排列 MUST 为：左侧「取消」（btn-secondary）、右侧「保存」（btn-primary）和「不保存」（btn-secondary），按平台惯例分组。

#### Scenario: 用户选择「保存」
- **WHEN** 用户在保存确认对话框中点击「保存」
- **THEN** 系统调用 `saveActiveDocument({ interactive: true })` 保存当前文档
- **AND** 保存成功后关闭窗口
- **AND** 保存失败时显示 toast 错误提示，窗口保持打开状态

#### Scenario: 用户选择「不保存」
- **WHEN** 用户在保存确认对话框中点击「不保存」
- **THEN** 系统不保存文档，直接关闭窗口

#### Scenario: 用户选择「取消」
- **WHEN** 用户在保存确认对话框中点击「取消」或关闭按钮（✕）或点击遮罩层
- **THEN** 系统关闭对话框，窗口保持打开状态，不进行任何保存操作

### Requirement: Keyboard interaction

保存确认对话框 SHALL 支持键盘操作。

#### Scenario: Escape 关闭
- **WHEN** 保存确认对话框打开时
- **AND** 用户按下 Escape 键
- **THEN** 对话框关闭，窗口保持打开状态（等同于「取消」）

#### Scenario: Enter 触发保存
- **WHEN** 保存确认对话框打开时
- **AND** 用户按下 Enter 键
- **THEN** 触发「保存」操作
