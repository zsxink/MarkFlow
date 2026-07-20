# ui-aria-attributes Specification

## Purpose

定义 MarkFlow 工具栏和 Toast 组件的无障碍（ARIA）属性规范。

## Agent Context
- **源码入口：** 待实现。
- **关联规范：** `context-menu`、`file-tree-architecture`、`statusbar`。
- **不变量：** 待实现。
- **验证：** 待实现。

## Requirements

### Requirement: 工具栏无障碍属性

工具栏容器 SHALL 设置 `role="toolbar"` 和 `aria-label="工具栏"`。按钮组 SHALL 设置 `role="group"` 和对应的 `aria-label`。开关按钮（如加粗、斜体）SHALL 设置 `aria-pressed="true/false"` 以反映当前状态。

#### Scenario: 工具栏容器具有正确 ARIA 属性
- **WHEN** 工具栏完成初始化渲染
- **THEN** 容器元素 SHALL 具有 `role="toolbar"` 和 `aria-label="工具栏"`

#### Scenario: 按钮组具有正确 ARIA 属性
- **WHEN** 工具栏包含按钮组（如格式化、对齐）
- **THEN** 每个按钮组 SHALL 具有 `role="group"` 和描述性 `aria-label`

#### Scenario: 开关按钮反映状态
- **WHEN** 用户点击加粗按钮激活加粗
- **THEN** 加粗按钮的 `aria-pressed` SHALL 更新为 `"true"`
- **WHEN** 用户再次点击加粗按钮取消加粗
- **THEN** 加粗按钮的 `aria-pressed` SHALL 更新为 `"false"`

### Requirement: Toast 无障碍属性

Toast 容器 SHALL 设置 `role="alert"` 和 `aria-live="assertive"`，确保屏幕阅读器立即播报通知内容。

#### Scenario: Toast 显示时屏幕阅读器播报
- **WHEN** 系统显示一条 Toast 通知
- **THEN** Toast 容器 SHALL 具有 `role="alert"` 和 `aria-live="assertive"`
- **THEN** 屏幕阅读器 SHALL 立即播报通知文本
