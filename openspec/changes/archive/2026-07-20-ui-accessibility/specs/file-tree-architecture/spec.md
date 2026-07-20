## ADDED Requirements

### Requirement: 文件树无障碍属性

文件树容器 SHALL 设置 `role="tree"` 和 `aria-label="文件树"`。目录节点 SHALL 设置 `role="treeitem"` 和 `aria-expanded="true/false"`。文件节点 SHALL 设置 `role="treeitem"`。选中节点 SHALL 设置 `aria-selected="true"`。

#### Scenario: 文件树容器具有正确 ARIA 属性
- **WHEN** 文件树完成初始化渲染
- **THEN** 容器元素 SHALL 具有 `role="tree"` 和 `aria-label="文件树"`

#### Scenario: 目录节点具有展开状态属性
- **WHEN** 一个目录节点被渲染且处于展开状态
- **THEN** 该节点 SHALL 具有 `role="treeitem"` 和 `aria-expanded="true"`
- **WHEN** 该目录节点被折叠
- **THEN** `aria-expanded` SHALL 更新为 `"false"`

#### Scenario: 文件节点具有正确属性
- **WHEN** 一个文件节点被渲染
- **THEN** 该节点 SHALL 具有 `role="treeitem"`，不具有 `aria-expanded` 属性

#### Scenario: 选中节点具有选中状态
- **WHEN** 用户点击选中一个文件节点
- **THEN** 该节点 SHALL 具有 `aria-selected="true"`
- **THEN** 之前选中的节点 SHALL 移除 `aria-selected` 或设置为 `"false"`

### Requirement: 文件树键盘导航

文件树 SHALL 支持以下键盘操作：上下箭头在同级节点间移动焦点，左箭头折叠展开的目录或移动到父级，右箭头展开目录或移动到第一个子项，Enter 打开文件。

#### Scenario: 上下箭头移动焦点
- **WHEN** 文件树中某个节点具有焦点
- **THEN** 按下 Down Arrow SHALL 将焦点移动到下一个可见节点
- **THEN** 按下 Up Arrow SHALL 将焦点移动到上一个可见节点

#### Scenario: 右箭头展开目录
- **WHEN** 焦点在一个已折叠的目录节点上
- **THEN** 按下 Right Arrow SHALL 展开该目录并保持焦点

#### Scenario: 右箭头进入子节点
- **WHEN** 焦点在一个已展开的目录节点上
- **THEN** 按下 Right Arrow SHALL 将焦点移动到第一个子节点

#### Scenario: 左箭头折叠目录
- **WHEN** 焦点在一个已展开的目录节点上
- **THEN** 按下 Left Arrow SHALL 折叠该目录并保持焦点

#### Scenario: 左箭头移动到父节点
- **WHEN** 焦点在一个文件节点或已折叠的目录节点上
- **THEN** 按下 Left Arrow SHALL 将焦点移动到父级节点

#### Scenario: Enter 打开文件
- **WHEN** 焦点在一个文件节点上
- **THEN** 按下 Enter SHALL 打开该文件
