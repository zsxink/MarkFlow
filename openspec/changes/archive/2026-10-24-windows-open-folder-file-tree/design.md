# Design

## 背景

Issue #375：Windows 上打开文件夹后文件树空白。走查确认两处独立缺陷叠加：

1. 三个「打开文件夹」入口（`src/ui/native-menu.ts` 的 `openWorkspaceFolder()` / `openRecentFolder()`、`src/ui/toolbar.ts` 的 `sidebar-open-folder`、`src/ui/sidebar/index.ts` 的 `sidebar-open-btn`）只做 `setWorkspacePath()` + `refreshFileTree()` + toast，从不切换侧边栏标签页。侧边栏默认是「大纲」（`index.html` 中 `data-tab="outline"` 为 active），`#file-tree` 仍 `hidden`。
2. 路径键形态不一致：`state.ts` 的 `normalizeTreePath()` 把盘符小写（`C:/…` → `c:/…`）后作为节点/目录键；`workspace.ts` 的 `getWorkspacePath()` 只把 `\` 换成 `/`，保留大写盘符。`dom.ts` 的 `findChildrenContainer()` 用 `parentPath === workspacePath` 判断根容器，大小写不一致直接返回 `null`，`render.ts` 的 `renderDirectory()` 里 `if (!container) return;` 把整次渲染静默丢弃 —— 后端 `read_dir` 成功、日志无异常，前端一个节点也不渲染。

两个缺陷在 macOS/Linux 上都不触发（路径无盘符），所以只在 Windows 复现。

## 决策

### D1：统一入口收敛到一个工作区打开流程

三处入口的重复代码合并为一个 `openWorkspaceFolderFlow()`（`src/ui/sidebar/index.ts` 导出），流程：

1. `open({ directory: true, multiple: false })`；用户取消 → 直接返回，不改任何状态。
2. `setWorkspacePath(selected)`（内部已完成规范化，见 D2）。
3. `refreshFileTree()`。
4. 切换到「文件」标签页并确保侧边栏展开。
5. `showToast('文件夹已打开')`。

第 4 步复用 `switchSidebarTab('files')`，展开逻辑与 `native-menu.ts` 现有 `showSidebarTab()` 一致：侧边栏带 `collapsed` 类时点击 `sidebar-toggle` 按钮（保持按钮图标与 `aria-pressed` 同步），再切标签页。这样不引入第二套展开状态真相。

**为什么不是「记住上次标签页就够了」**：`lastSidebarTab` 只在启动时恢复一次，且默认大纲；用户打开文件夹这一明确动作本身就应把焦点带到文件树，属于意图推断，不能依赖历史偏好。

**为什么把 `switchSidebarTab` 的展开逻辑也搬进流程**：三个入口都应表现一致（含「最近文件夹」），否则从菜单打开最近文件夹仍看不到树。`native-menu.ts` 的 `showSidebarTab()` 保持原样（视图菜单的 `show-tree`/`show-outline` 语义不变）。

### D2：根路径在写入状态时规范化

新增 `src/utils/paths.ts` 导出 `normalizeWorkspacePath(path)`：

- `\` → `/`
- 去掉尾部 `/`（根 `/` 与 `C:/` 除外，去掉会变成空串）
- 盘符 `^[A-Z]:` → 小写

`file-tree/workspace.ts` 的 `setWorkspacePath()` 用它生成写入 `store` 的值。`state.ts` 的 `normalizeTreePath()` 保持独立（它是纯树模型函数，被 `state`/`events`/`loader` 使用），两者形态一致但职责分离：一个是「工作区根路径的对外形态」，一个是「树节点键的规范化」。

**为什么改写入端而不是改 `findChildrenContainer` 比较**：节点键本来就已经是小写盘符，把根路径对齐到同一形态是消除不一致的根因修法；只改比较函数会留下两套形态共存，后续 `restoreExpandedState()` 的 `path.startsWith(wsPath)` 前缀判断仍会失配（大写根路径 + 小写展开路径 → 相对路径算错 → 展开状态恢复失败）。实测该前缀判断也是同一 bug 的潜在复现点。

### D3：根容器查找加大小写不敏感兜底

`findChildrenContainer(parentPath, workspacePath)` 的根目录判断改为「规范化后相等」：两侧都套 `normalizeTreePath()` 再比较。这层兜底覆盖历史持久化的 `expandedPaths`、外部 IPC 传入路径等仍可能带大写盘符的来源，成本是每次根目录渲染一次字符串处理。

### D4：渲染失败不再静默

`renderDirectory()` 在 `findChildrenContainer()` 返回 `null` 时记录一次 `logException`（scope `file-tree.render`，带 `path` 与 `workspacePath` 上下文），而不是 `return` 后无声无息。同类问题下次可直接从 `%APPDATA%\MarkFlow\logs` 定位。

**取舍**：每次目录渲染失败都写一条日志，理论上高频失败会放大日志量。实际上容器缺失是结构性错误（同一时刻整棵树都渲染不出来），不会在正常路径上反复出现，且日志已按 level 过滤。

### D5：`loader.ts` 的刷新路径也规范化

`refreshFileTree()` 里 `loadDirectory(wsPath, false)` 之前，`wsPath` 已由 `getWorkspacePath()` 返回规范化形态（D2 之后）。`loadDirectory()` 内部本身已 `normalizeTreePath()`，无需额外改动；但 `restoreExpandedState()` 里 `path.startsWith(wsPath)` 的前缀判断依赖两侧形态一致，因此 D2 是它的前置条件。

## 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 已有用户持久化的 `workspacePath` 或 `expandedPaths` 带大写盘符 | 首屏根目录渲染仍可能失配 | D3 兜底；`restoreExpandedState()` 的逐层按名字匹配对盘符大小写不敏感 |
| 其他消费方假设 `workspacePath` 保留原始大小写 | 新建文件/文件夹、拖拽、内联编辑拼接路径后传给后端 | 后端 `resolve_path` 走 `canonicalize()`，Windows 上大小写不敏感，实际写盘路径由 OS 决定；`get_workspace()` 返回的是后端形态，`main.ts` 启动恢复时又会过一次 `setWorkspacePath()`（D2） |
| 三个入口改成共享流程后，`native-menu.test.ts` 的 mock 需要更新 | 测试失败 | 更新 mock 并在 `native-menu.test.ts` 断言「打开文件夹后调用 `switchSidebarTab('files')`」 |
| 侧边栏展开逻辑被搬进共享流程后，与视图菜单的 `show-tree` 行为不一致 | 用户困惑 | 两者最终状态相同（都展开 + 文件标签页）；`show-tree` 仍走 `showSidebarTab()`，不引入行为回退 |

## 测试策略

- `src/ui/file-tree/__tests__/state.test.ts`：补充 `normalizeTreePath` 对盘符、尾部斜杠的用例（若尚未覆盖）。
- `src/utils/__tests__/paths.test.ts`：新增 `normalizeWorkspacePath` 用例（`C:\Notes\` → `c:/Notes`、`/home/user/notes/` → `/home/user/notes`、根路径不被削成空串）。
- `src/ui/file-tree/__tests__/dom.test.ts`（新增）：`findChildrenContainer` 在根路径大小写不一致时仍返回 `#file-tree`。
- `src/ui/__tests__/native-menu.test.ts`：`open-folder` 与 `recent-folder:` 动作断言 `switchSidebarTab('files')` 被调用。
- `src/ui/sidebar/__tests__/`（新增用例）：`openWorkspaceFolderFlow` 在用户取消时不调用 `setWorkspacePath`/`refreshFileTree`/`switchSidebarTab`；成功时按顺序调用三者并展开折叠的侧边栏。
- 门禁：`npx tsc --noEmit`、`npm test`、`node scripts/check-layering.mjs`、`npx openspec validate --all`。
