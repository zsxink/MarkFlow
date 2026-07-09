## ADDED Requirements

### Requirement: showContextMenuStatic 函数

系统 SHALL 提供 `showContextMenuStatic(items: ContextMenuItem[], position: {x: number, y: number}, options?: ContextMenuOptions): void` 函数，用于创建统一的右键菜单。

**ContextMenuItem:**
- `label: string` — 菜单项显示文本（HTML 字符串，支持图标等）
- `onClick?: () => void` — 点击处理函数
- `danger?: boolean` — 危险操作样式标记
- `divider?: boolean` — 分隔线标记（为 true 时忽略其他字段）

**ContextMenuOptions:**
- `containerId?: string` — 容器元素 ID，默认 `'context-menu'`
- `className?: string` — 额外 CSS class

#### Scenario: 在指定位置显示菜单
- **WHEN** 调用 `showContextMenuStatic(items, {x: 100, y: 200})`
- **THEN** 菜单出现在屏幕 (100, 200) 处，菜单项被正确渲染

#### Scenario: 菜单位置被限定在视口内
- **WHEN** position 靠近屏幕边缘
- **THEN** 菜单被调整到视口范围内（使用 clampMenuPosition 逻辑）

#### Scenario: 点击菜单项执行对应操作并关闭
- **WHEN** 用户点击一个菜单项
- **THEN** 该项的 onClick 被调用，菜单关闭

#### Scenario: 点击菜单外部自动关闭
- **WHEN** 用户点击菜单之外的区域
- **THEN** 菜单关闭

#### Scenario: 显示新菜单时自动关闭之前的
- **WHEN** 连续调用两次 showContextMenuStatic
- **THEN** 后一次调用关闭前一次的菜单
