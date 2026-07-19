## ADDED Requirements

### Requirement: 右键菜单无障碍属性

右键菜单容器 SHALL 设置 `role="menu"`。每个菜单项 SHALL 设置 `role="menuitem"`。禁用的菜单项 SHALL 设置 `aria-disabled="true"`。

#### Scenario: 菜单容器具有正确 ARIA 属性
- **WHEN** 右键菜单被创建并显示
- **THEN** 容器元素 SHALL 具有 `role="menu"`

#### Scenario: 菜单项具有正确 ARIA 属性
- **WHEN** 菜单项被渲染
- **THEN** 每个菜单项按钮 SHALL 具有 `role="menuitem"`

#### Scenario: 禁用菜单项具有 aria-disabled
- **WHEN** 菜单项被标记为禁用状态
- **THEN** 该菜单项 SHALL 具有 `aria-disabled="true"`

### Requirement: 右键菜单焦点管理

右键菜单显示时 SHALL 将焦点移到第一个菜单项。ESC 关闭菜单时 SHALL 恢复焦点到触发菜单的元素。

#### Scenario: 菜单显示时焦点移到第一项
- **WHEN** 右键菜单被创建并显示
- **THEN** 焦点 SHALL 移动到第一个非分隔线的菜单项

#### Scenario: ESC 关闭并恢复焦点
- **WHEN** 用户在菜单打开时按下 Escape 键
- **THEN** 菜单关闭
- **THEN** 焦点 SHALL 恢复到触发菜单的元素
