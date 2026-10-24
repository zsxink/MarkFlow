# Tasks

## 1. 头部工具行

- [x] 1.1 新建 `src/ui/file-tree/header.ts`：`renderTreeHeader()` 构建 sticky 头行（折叠箭头 + 根文件夹名 + 4 按钮），导出挂载/卸载与落点推导 `resolveCreateTargetDir()`；经 core.ts/index.ts barrel re-export。验证：`npx tsc --noEmit`
- [x] 1.2 `src/styles/sidebar.css` 加 `.tree-header` sticky 样式、按钮组 hover/focus-within 淡入淡出、24px ghost 按钮。验证：样式审查
- [x] 1.3 接线：工作区打开后头行插入滚动容器首位（现场确认 #file-tree/.sidebar-content 层次），无工作区不渲染；左侧箭头/名称点击 `collapseAllFolders()`。验证：`npx tsc --noEmit`

## 2. 四按钮行为

- [x] 2.1 新建文件/新建文件夹：落点跟随选中项（选中文件夹→其内；选中文件→同目录；未选中→根目录），打开既有新建流程（new-file-dialog 按需加可选目录参数，默认行为不变）。验证：`npx tsc --noEmit`
- [x] 2.2 刷新按钮 → `refreshFileTree()`；折叠全部 → 与 #418 相同的智能切换分发（抽公共函数）。验证：`npx tsc --noEmit`

## 3. 移除旧入口

- [x] 3.1 移除 `#tree-toggle-all`（HTML/CSS/JS/`switchSidebarTab` 同步）与 footer「新建文件」按钮（HTML/JS），footer 仅留「打开文件夹」。验证：`grep -rn "tree-toggle-all" src/ index.html` 无命中
- [x] 3.2 `sidebar-tree-toggle.test.ts` 改写为头部按钮行为测试（可见性、分发、footer 单按钮）。验证：`npm test -- src/ui/__tests__`

## 4. 单元测试

- [x] 4.1 新建 `src/ui/file-tree/__tests__/header.test.ts`：头行渲染（根名/无工作区）、落点推导三情形、四按钮分发。验证：`npm test -- src/ui/file-tree`

## 5. 回归与门禁

- [x] 5.1 全量 `npm test`、`npx tsc --noEmit`、`node scripts/check-layering.mjs` 通过。验证：三条命令退出码 0
