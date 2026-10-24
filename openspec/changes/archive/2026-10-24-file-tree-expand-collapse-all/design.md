# Design

## 背景

- tab 行：`index.html:126-130` `.sidebar-tabs`（两个 `button.sidebar-tab[data-tab=files|outline]`）；切换逻辑 `src/ui/sidebar/index.ts:87-105` `switchSidebarTab()`（切 `.active`、`#file-tree.hidden`、footer display）。
- 展开三要素（chevron click handler，`render.ts:58-65`）：chevron 加/去 `expanded` + `.tree-children.hidden` 切换 + `aria-expanded` 同步；首次展开懒加载 `loadDirectoryThroughHook(path, false)`。
- 展开态单真相：`loader.ts` `saveExpandedState()`（扫描 `.tree-folder` 收集 expanded 的 data-path → `store.setState({ expandedPaths })`，纯内存 store）；`restoreExpandedState()`（`loader.ts:62-108`）逐段匹配展开并 `await loadDirectory`，深度封顶 `fileTreeAutoLoadDepth`（默认 8，`src/types/settings.ts:101`）。
- watcher rename 会改写 `expandedPaths`（`events.ts`），收起/展开不得绕过 store 直改 DOM。

## 方案

### 入口与样式

- `index.html` `.sidebar-tabs` 行内加 `<button id="tree-toggle-all" class="sidebar-tree-toggle" hidden aria-label="...">`，内联 SVG 双向 chevron 图标。绝对定位右侧（`.sidebar-tabs { position: relative }`），仅 files tab 时 `hidden=false`。
- 样式加 `src/styles/sidebar.css`（尺寸/悬浮态对齐 `.sidebar-footer-action` 的图标按钮语感，28px 方形 ghost button）。
- 可见性接线：`switchSidebarTab()` 内加一行 `treeToggle.hidden = tab !== 'files'`（初始 HTML 里默认 hidden，避免首帧大纲 tab 闪现）。

### 行为实现（file-tree 模块内，导出两个函数）

放 `src/ui/file-tree/loader.ts`（已有 save/restore/loadDirectory 全套依赖，行数 173 → 目标 +80 内，仍在 500 限内）：

- `collapseAllFolders()`：遍历 `#file-tree` 内所有 `.tree-folder`（含 wrapper 包裹），三要素收起；`await saveExpandedState()`（收集为空 → store 清空）。
- `expandAllFolders()`：迭代展开，参考 `restoreExpandedState()` 的逐层 await 模式：
  ```
  let depth = 0; let frontier = 已渲染且折叠的顶层文件夹
  while (frontier 非空 && depth < maxDepth(fileTreeAutoLoadDepth)):
    next = []
    for folder of frontier: 展开三要素 + await loadDirectory(folder.path, false)（pendingLoads 去重天然防重）；收集新渲染的折叠子文件夹入 next
    frontier = next; depth++
  await saveExpandedState()
  ```
  - 分页目录只加载第一页：`loadDirectory(path, false)` 本身就读第一页（append=false），符合「与手动点击一致」。
  - 逐个 await，不并发（避免打爆 readDirPage，与 restoreExpandedState 一致）。
  - 已展开文件夹的未加载子级：BFS 遍历天然覆盖（新加载的折叠子文件夹进入 next）。
- 按钮点击 handler 放 `src/ui/sidebar/index.ts`（initSidebar 内注册，与 tab 切换同层）：根据当前是否存在已折叠文件夹决定 expand/collapse（简单规则：有任何折叠文件夹 → 展开；否则 → 收起）。调 file-tree barrel 导出的两个函数（`src/ui/file-tree/index.ts` re-export），不深穿内部文件。

### 不做

- 不改 `restoreExpandedState()` / `saveExpandedState()` 本体。
- 不改 watcher 事件应用逻辑。
- 不加新设置项（深度复用 `fileTreeAutoLoadDepth`）。

## 测试策略

- `src/ui/file-tree/__tests__/lazy.test.ts`（已有 readDirPage mock 与 restore 测试可参考）：
  1. collapseAllFolders：构造两个展开文件夹（手动 chevron 展开或 restore）→ 调用后断言 chevron 无 expanded、children.hidden、expandedPaths 为空。
  2. collapseAllFolders 后 refreshFileTree 不恢复展开（mock 已有类似 round-trip 用例）。
  3. expandAllFolders：折叠状态下调用 → 断言逐层展开、expandedPaths 收集完整、深度封顶生效（depth=1 的 mock 场景断言第二层不再加载）。
- `src/ui/__tests__/` 或 sidebar 测试：`switchSidebarTab('outline')` 后按钮 hidden；files 时可见。若 sidebar 无既有测试文件，新建 `src/ui/__tests__/sidebar-tree-toggle.test.ts`（mock file-tree barrel）。

## 风险

- 超大工作区展开耗时：深度封顶 + 串行 await；UI 不阻塞（await 期间用户仍可操作，重复点击由 pendingLoads 去重兜底）。
- 按钮与 tab 点击冲突：按钮是 `.sidebar-tabs` 的子元素，click 事件会冒泡到 tab 容器——tab 点击注册在每个 `.sidebar-tab` 上（非容器委托），且按钮不在 tab 按钮内，无冲突；样式上绝对定位不覆盖 tab 文本。
