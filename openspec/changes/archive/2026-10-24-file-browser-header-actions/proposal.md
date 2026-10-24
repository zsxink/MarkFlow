# Proposal

## Why

文件浏览视图的高频操作（新建文件/文件夹、刷新、折叠全部）分散在右键菜单、footer 与 tab 行悬浮按钮，且深层目录缺少「当前工作区」的常驻标识。参考 VSCode 资源管理器，用户已确认定稿方案（issue #424，原型已过目）：头部固定文件夹名行 + hover 显示的四个功能按钮。

## What Changes

- **头部工具行**：文件树列表顶部新增 sticky 头行——左侧折叠箭头 + 工作区根文件夹名（点击折叠所有文件夹），列表滚动时固定；无工作区时不显示。
- **四个功能按钮**（头行右侧，顺序固定）：新建文件、新建文件夹、刷新（`refreshFileTree()`）、折叠全部（复用 #418 `expandAllFolders`/`collapseAllFolders` 智能切换）。
- **显示规则**：仅「文件」tab 激活且鼠标悬停在文件浏览器区域内时按钮组淡入，移出淡出；`focus-within` 时保持可见（键盘可达）。
- **新建落点跟随选中项**：选中文件夹→在其内新建；选中文件→在其同目录新建；未选中→工作区根目录（现有新建对话框流程 + 落点推导）。
- **移除双入口**：#418 的 tab 行右侧悬浮按钮（`#tree-toggle-all`）移除；footer「新建文件」按钮移除（footer 仅留「打开文件夹」）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `file-tree-architecture`: 新增「文件浏览器头部工具行」requirement（sticky 头行、四按钮、hover/focus 显示、新建落点跟随选中项）；修改「一键展开/收起所有文件夹」requirement（入口由 tab 行悬浮按钮改为头部第 4 按钮，显示规则同步）。
- `sidebar`: 「侧边栏底部操作栏布局」requirement 改为仅保留「打开文件夹」单按钮。

## Impact

- 代码：`index.html`（头行挂载、移除旧按钮）、`src/styles/sidebar.css`（头行样式、移除旧样式）、`src/ui/file-tree/`（新 `header.ts`、`loader.ts` 复用、选中状态读取）、`src/ui/sidebar/index.ts`（footer 精简、旧按钮接线移除）、`src/ui/new-file-dialog.ts`（落点参数）。
- 测试：`src/ui/__tests__/sidebar-tree-toggle.test.ts`（改写为头部按钮测试）、`src/ui/file-tree/__tests__/`（头行/落点用例）。
- 风险：sticky 依赖滚动容器结构（#file-tree vs .sidebar-content）需现场确认；new-file-dialog 落点参数为行为扩展；移除 footer 按钮影响既有测试断言。
- 关联 issue：#424（依赖 #418 的展开/收起函数、#407 无关联）。
