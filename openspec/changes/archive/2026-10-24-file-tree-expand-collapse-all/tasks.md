# Tasks

## 1. 行为实现（file-tree 模块）

- [x] 1.1 `src/ui/file-tree/loader.ts` 新增导出 `collapseAllFolders()`：三要素收起全部已渲染 `.tree-folder`（wrapper 包裹与裸节点都覆盖），末尾 `await saveExpandedState()`。验证：`npx tsc --noEmit`
- [x] 1.2 `src/ui/file-tree/loader.ts` 新增导出 `expandAllFolders()`：BFS 逐层展开 + `await loadDirectory(path, false)` 懒加载，深度封顶 `fileTreeAutoLoadDepth`（读法沿用 restoreExpandedState 的 settings 兜底），末尾 `await saveExpandedState()`。验证：`npx tsc --noEmit`
- [x] 1.3 `src/ui/file-tree/index.ts`/`core.ts` re-export 两个新函数（经 barrel，不深穿）。验证：`npx tsc --noEmit`

## 2. 入口与样式

- [x] 2.1 `index.html` `.sidebar-tabs` 行加悬浮按钮（默认 `hidden`、aria-label、SVG 双 chevron 图标）。验证：`npm run build` 或 tsc 无碍
- [x] 2.2 `src/styles/sidebar.css` 加 `.sidebar-tree-toggle` 绝对定位样式（右侧、ghost 风格、hover 反馈，不覆盖 tab）。验证：目测/样式审查
- [x] 2.3 `src/ui/sidebar/index.ts`：`switchSidebarTab()` 同步按钮 hidden；`initSidebar()` 注册点击（有折叠文件夹 → expandAllFolders，否则 collapseAllFolders）。验证：`npx tsc --noEmit`

## 3. 单元测试

- [x] 3.1 `src/ui/file-tree/__tests__/lazy.test.ts` 新增 collapseAllFolders 用例：全部折叠 + expandedPaths 清空 + refresh 后不恢复。验证：`npm test -- src/ui/file-tree/__tests__/lazy.test.ts`
- [x] 3.2 新增 expandAllFolders 用例：逐层展开、expandedPaths 完整、深度封顶（构造两层目录、depth 限 1 时第二层不加载）、与收起循环切换。验证：同上
- [x] 3.3 sidebar 按钮可见性与点击分发测试（新建或扩展 sidebar 测试，mock file-tree barrel）。验证：`npm test -- src/ui`

## 4. 回归与门禁

- [x] 4.1 全量 `npm test`、`npx tsc --noEmit`、`node scripts/check-layering.mjs` 通过。验证：三条命令退出码 0
