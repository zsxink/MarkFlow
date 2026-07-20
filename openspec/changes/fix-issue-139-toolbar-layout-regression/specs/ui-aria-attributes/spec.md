## ADDED Requirements

### Requirement: 工具栏按钮组容器视觉完整性

按钮组容器创建后 SHALL NOT 破坏工具栏整体视觉布局。ARIA 分组操作（`wrapGroup`）SHALL 确保按钮仍按设计排列在同一水平行内。

#### Scenario: ARIA 分组不影响工具栏布局
- **WHEN** `initAriaAttributes()` 执行完毕，按钮被移入 `[role="group"]` 容器
- **THEN** 工具栏内所有可视化元素 SHALL 仍保持原有水平单行 flex 布局
- **THEN** 按钮的视觉排列 SHALL 与分组前一致（不换行、不溢出、不错位）
