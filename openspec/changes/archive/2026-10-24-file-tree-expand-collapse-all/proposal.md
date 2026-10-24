# Proposal

## Why

深层目录里逐个点击 chevron 展开或收起文件夹非常繁琐，用户需要一个总览/收拢的快速切换入口（参考 VSCode 资源管理器的 Collapse All），见 issue #418。

## What Changes

- 在侧边栏「文件 / 大纲」tab 行（`.sidebar-tabs`）右侧增加绝对定位悬浮小按钮，点击在「展开所有文件夹 / 收起所有文件夹」间切换；仅「文件」tab 激活时可见（跟随 `switchSidebarTab` 语义），带 `title` 与 `aria-label`，不与 tab 点击冲突。
- 收起所有：遍历已渲染的 `.tree-folder`，移除 chevron `expanded`、隐藏 `.tree-children`、`aria-expanded=false`；随后调用 `saveExpandedState()` 持久化空列表，保证 `refreshFileTree()` / watcher rescan 恢复时不重新展开。
- 展开所有：逐层递归展开已渲染与新加载出的子文件夹，懒加载经 `loadDirectory`（分页目录只加载第一页，与手动点击一致）；深度封顶复用 `fileTreeAutoLoadDepth`；展开态写入 store `expandedPaths`（经 `saveExpandedState()`），与 `restoreExpandedState()`、watcher rename 改写保持单一真相。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `file-tree-architecture`: 新增「一键展开/收起所有文件夹」requirement——入口仅文件 tab 可见、收起持久化为空、展开逐层懒加载且深度受 `fileTreeAutoLoadDepth` 封顶、展开状态经 `expandedPaths` 单一真相。

## Impact

- 代码：`index.html`（按钮挂载点）、`src/styles/sidebar.css`（悬浮按钮样式）、`src/ui/sidebar/index.ts` 或 `src/ui/file-tree/`（行为实现，落点按分层规范：树操作放 file-tree 模块，sidebar 只接线）、设置读取沿用 `fileTreeAutoLoadDepth`。
- 测试：`src/ui/file-tree/__tests__/`（展开/收起行为）与 sidebar 相关测试（可见性切换）。
- 风险：超大工作区展开成本——深度封顶 + 逐层 await（不并发打爆 `readDirPage`）缓解；按钮与 tab 点击事件冲突需 stopPropagation/定位隔离。
- 关联 issue：#418。
