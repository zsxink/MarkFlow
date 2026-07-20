## ADDED Requirements

### Requirement: 状态栏无障碍属性

状态栏容器 SHALL 设置 `role="status"` 和 `aria-live="polite"`，确保字数、行数等统计信息变化时屏幕阅读器能感知。

#### Scenario: 状态栏容器具有正确 ARIA 属性
- **WHEN** 状态栏完成初始化渲染
- **THEN** 容器元素 SHALL 具有 `role="status"` 和 `aria-live="polite"`

#### Scenario: 统计变化时屏幕阅读器感知
- **WHEN** 编辑器更新导致字数或行数变化
- **THEN** 状态栏的 `aria-live="polite"` 区域 SHALL 允许屏幕阅读器在空闲时播报更新内容
