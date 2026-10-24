# Spec Delta

## ADDED Requirements

### Requirement: 一键展开/收起所有文件夹

文件树面板 SHALL 在「文件 / 大纲」tab 行右侧提供悬浮按钮，一键展开或收起所有文件夹。按钮 SHALL 仅在「文件」tab 激活时可见，带 `title` 与 `aria-label`，且不得拦截 tab 点击。展开/收起状态 SHALL 经 `saveExpandedState()` 与 store 的 `expandedPaths` 维持单一真相。

#### Scenario: 按钮可见性跟随 tab

- **WHEN** 侧边栏切换到「文件」tab
- **THEN** 悬浮按钮可见；切换到「大纲」tab 后按钮不可见

#### Scenario: 收起所有文件夹并持久化

- **WHEN** 点击按钮执行收起
- **THEN** 所有已渲染文件夹折叠（chevron 去 `expanded`、`.tree-children` 隐藏、`aria-expanded=false`），`saveExpandedState()` 持久化为空列表
- **THEN** 随后 `refreshFileTree()` 或重开工作区后文件夹保持折叠

#### Scenario: 展开所有文件夹逐层懒加载

- **WHEN** 点击按钮执行展开
- **THEN** 已渲染文件夹逐层展开，尚未加载的子目录经懒加载加载（分页目录只加载第一页），展开深度不超过 `fileTreeAutoLoadDepth`，展开态写入 `expandedPaths`
- **THEN** 与收起可循环切换

#### Scenario: 展开状态下 watcher 增量事件不受影响

- **WHEN** 一键展开后外部发生新建/删除/重命名
- **THEN** 增量事件应用行为与手动展开时一致
