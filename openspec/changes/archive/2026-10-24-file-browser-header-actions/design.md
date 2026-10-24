# Design

## 背景（已核实锚点 + 待现场确认项）

- tab 行 `index.html:126-130`；#418 按钮 `#tree-toggle-all`（index.html `.sidebar-tabs` 内、`sidebar.css .sidebar-tree-toggle`、`sidebar/index.ts` 接线与 `switchSidebarTab` hidden 同步、测试 `src/ui/__tests__/sidebar-tree-toggle.test.ts`）。
- footer：`index.html:135-144` 两个 `.sidebar-footer-action`（实际按钮文案以现场为准，spec 历史写「打开文件夹/新建文件夹」）；点击接线在 `initSidebar`。
- 展开三要素与 `expandAllFolders`/`collapseAllFolders`（`loader.ts`，#418 合入）；`refreshFileTree()`；`saveExpandedState`。
- 新建流程：`src/ui/new-file-dialog.ts`（落树 :109/:118）、`src/ui/file-tree/inline.ts`（startInlineCreate）；footer「新建文件」现状调用链与是否带目录参数**需现场确认**。
- 选中状态：`.tree-file.active` class + aria（`render.ts` click / `aria.ts`），「当前选中树节点」的读取入口**需现场确认**（DOM query `.tree-file.active`/`[aria-selected=true]` 或 treeState）。
- 滚动容器：sticky 头行必须放在滚动容器内的首位——`#file-tree`（nav）与 `.sidebar-content` 的层次**需现场确认**，头行插入实际发生滚动的容器第一个子位。

## 方案

### 头部行 DOM 与样式（新文件 `src/ui/file-tree/header.ts`）

- `renderTreeHeader()` 构建：`<div class="tree-header">` = 折叠箭头按钮（chevron）+ `<span class="tree-header-name">根文件夹名</span>` + `<div class="tree-header-actions">`（4 个 `.tree-header-action` ghost 图标按钮，含内联 SVG：file-plus / folder-plus / refresh-cw / chevrons-down-up，均带 aria-label/title）。
- 挂载：工作区打开（`refreshFileTree` / `setWorkspacePath` 成功路径）时插入滚动容器首位；无工作区/关闭时不渲染。根文件夹名 = `workspacePath` 最后一段。
- 样式（`sidebar.css`）：`.tree-header { position: sticky; top: 0; z-index; background: var(--bg); border-bottom }`；`.tree-header-actions { opacity: 0; transition: opacity 140ms }`；`#file-tree:hover .tree-header-actions, .tree-header:focus-within .tree-header-actions { opacity: 1 }`。按钮 24px ghost 风格（对齐原 `.sidebar-tree-toggle` 语感）；「大纲」tab 下 `#file-tree.hidden` 天然隐藏头行。
- 头行左侧箭头+名称点击 → `collapseAllFolders()`（收起整树）。

### 四按钮接线（`header.ts` 内注册，能力经模块内直接调用或 barrel）

1. 新建文件 / 新建文件夹：推导落点目录 → 打开既有新建流程。落点推导 `resolveCreateTargetDir()`：读当前选中节点——选中文件夹节点→其 path；选中文件节点→父目录 path；无选中→`getWorkspacePath()`。new-file-dialog 若无目录参数则扩展（新增可选 `dir` 入参，默认沿用现状行为）；inline 新建路径同理或仅对话框路径（以现有两条链路现状为准，选择改动最小者，但两条入口的落点语义必须一致）。
2. 刷新：`void refreshFileTree()`。
3. 折叠全部：`hasCollapsedFolder() ? expandAllFolders() : collapseAllFolders()`（与 #418 分发一致，抽公共小函数避免复制）。

### 移除旧入口

- `#tree-toggle-all`：index.html 元素、`.sidebar-tree-toggle` CSS、`sidebar/index.ts` 接线与 `switchSidebarTab` 中的 hidden 同步、`sidebar-tree-toggle.test.ts`（改写为头部按钮行为测试，mock 结构复用）。
- footer「新建文件」按钮：index.html 元素移除、`sidebar/index.ts` 接线移除；`.sidebar-footer-action` 样式保留单按钮（等宽布局自然退化为占满）。

### 不做

- 不改 `expandAllFolders`/`collapseAllFolders`/`saveExpandedState` 本体；不改 watcher 事件逻辑；不加设置项；右键菜单、原生菜单入口不动。

## 测试策略

- `src/ui/file-tree/__tests__/header.test.ts`（新建）：头行渲染（有工作区显示根文件夹名/无工作区不显示）、落点推导三情形（选中文件夹/选中文件/未选中）、四按钮分发（mock refreshFileTree/expand/collapse/new-file 流程）。
- `src/ui/__tests__/sidebar-tree-toggle.test.ts` 改写为 `sidebar-tree-header.test.ts`：hover/focus 可见性（happy-dom 支持 :hover 不全，用 focus-within + class 断言或直接测 header.ts 导出的可见性逻辑）、tab 切换隐藏、footer 单按钮断言。
- 既有 footer 断言与 #418 测试全部更新，不删除行为覆盖。

## 风险

- sticky 容器判断错误会导致头行不固定——实现后必须实际验证（测试中难验 sticky，静态断言 class/位置 + 人工验证说明）。
- new-file-dialog 落点参数是行为扩展，需覆盖默认参数兼容（无参调用行为不变，既有测试不破）。
