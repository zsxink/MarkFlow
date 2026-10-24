# Spec Delta

## ADDED Requirements

### Requirement: 文件浏览器头部工具行

文件树面板 SHALL 在列表顶部提供 sticky 头部工具行：左侧为折叠箭头与工作区根文件夹名（点击折叠所有文件夹），右侧为四个功能按钮（顺序固定）：新建文件、新建文件夹、刷新、折叠全部。按钮组 SHALL 仅在鼠标悬停于文件浏览器区域内或按钮组内元素持有键盘焦点时可见（淡入淡出）。无工作区时头部行 MUST NOT 显示。

#### Scenario: 头行固定与内容

- **WHEN** 已打开工作区且文件树列表滚动
- **THEN** 头行固定在列表顶部不随滚动消失，显示折叠箭头与工作区根文件夹名

#### Scenario: 按钮悬停显示

- **WHEN** 鼠标进入文件浏览器区域
- **THEN** 四个按钮淡入；移出后淡出；按钮组内元素持有键盘焦点时保持可见

#### Scenario: 四按钮行为

- **WHEN** 依次点击四个按钮
- **THEN** 新建文件与新建文件夹按「跟随选中项」落点打开既有新建流程；刷新执行 `refreshFileTree()` 全量刷新；折叠全部按「一键展开/收起所有文件夹」requirement 智能切换

#### Scenario: 新建落点跟随选中项

- **WHEN** 点击新建文件或新建文件夹按钮
- **THEN** 选中文件夹时在其内新建；选中文件时在其同目录新建；未选中任何节点时在工作区根目录新建

#### Scenario: 无工作区不显示头行

- **WHEN** 未打开工作区
- **THEN** 文件树保持「请先打开文件夹」空态，不显示头部行与按钮

## MODIFIED Requirements

### Requirement: 一键展开/收起所有文件夹

文件树面板 SHALL 在头部工具行提供「折叠全部」按钮，一键展开或收起所有文件夹。按钮 SHALL 仅在「文件」tab 激活且鼠标悬停于文件浏览器区域内（或其内元素持有键盘焦点）时可见，带 `title` 与 `aria-label`，且不得拦截其它交互。展开/收起状态 SHALL 经 `saveExpandedState()` 与 store 的 `expandedPaths` 维持单一真相。

#### Scenario: 按钮可见性跟随 tab

- **WHEN** 侧边栏「文件」tab 激活
- **THEN** 鼠标悬停于文件浏览器区域时「折叠全部」按钮可见；移出后隐藏；键盘焦点在按钮组内时保持可见；「大纲」tab 下头部行整体不可见

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
