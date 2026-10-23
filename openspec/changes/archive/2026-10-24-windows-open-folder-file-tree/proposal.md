# Proposal

## Why

在 Windows 上通过菜单栏「文件 → 打开文件夹…」、工具栏「打开文件夹」或侧边栏底部「打开文件夹」选择目录后，界面只弹出「文件夹已打开」提示，侧边栏文件树却始终空白（或仍是「请先打开文件夹」空状态），用户无法浏览工作区文件。这是 0.1.3 的可用性阻断缺陷：打开工作区后没有任何可见结果，且切换到「文件」标签页同样无内容。

根因有两处，叠加后造成「提示成功但树为空」：

1. **未切换标签页**：三处打开文件夹入口只做 `setWorkspacePath()` + `refreshFileTree()` + toast，不切换侧边栏标签页；而侧边栏默认/恢复的标签页是「大纲」，文件树容器 `#file-tree` 仍带 `hidden`，用户看不到文件浏览。
2. **Windows 路径大小写不一致**：文件树状态层用 `normalizeTreePath()`（把盘符 `C:` 小写成 `c:`）作为节点键，而工作区根路径（`getWorkspacePath()`）只做反斜杠替换、保留大写盘符。渲染时 `findChildrenContainer()` 用 `parentPath === workspacePath` 判断根目录，大小写不一致即返回 `null`，`renderDirectory()` 静默丢弃整次渲染 —— 后端读目录成功，前端一棵节点也不渲染。

## What Changes

- 三处「打开文件夹」入口统一走同一个工作区打开流程：设置工作区 → 刷新文件树 → 切换到「文件」标签页并展开侧边栏 → 提示成功。
- 工作区根路径在写入状态时即规范化（盘符小写、反斜杠转正斜杠、去掉尾部斜杠），使根路径与文件树节点键使用同一形态，`findChildrenContainer()` 的根目录判断不再受大小写影响。
- `findChildrenContainer()` 的根目录判断改为大小写不敏感兜底，避免历史状态或外部传入路径的大小写差异再次让整棵树渲染被静默丢弃。
- `renderDirectory()` 在找不到容器时记录一次告警日志（含路径与工作区路径），使同类问题下次可从日志直接定位，而不是静默失败。
- 新增/更新单元测试覆盖：盘符规范化、根目录容器查找、打开文件夹后侧边栏切到文件标签页。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `sidebar`：新增「打开文件夹后切到文件标签页」的行为要求（三条入口一致），并明确空工作区/失败路径不得停留在空白状态。
- `file-tree-architecture`：强化「规范化 path 是稳定键」不变量 —— 工作区根路径与节点键 MUST 使用同一规范化形态（含 Windows 盘符大小写），根目录容器查找 MUST 对大小写差异容错，渲染不得静默丢弃。

## Impact

- 前端代码：`src/ui/sidebar/index.ts`、`src/ui/toolbar.ts`、`src/ui/native-menu.ts`（入口统一）、`src/ui/file-tree/workspace.ts`（根路径规范化）、`src/ui/file-tree/dom.ts`（容器查找 + 日志）、`src/ui/file-tree/loader.ts`（刷新路径规范化）。
- 状态影响：`store.workspacePath` 形态变为规范化的 POSIX 风格小写盘符路径；依赖它的原生菜单同步、新建文件/文件夹、拖拽与内联编辑均按同一形态工作。
- 测试：`src/ui/file-tree/__tests__/`、`src/ui/__tests__/`（新增/更新用例）。
- 后端与 IPC 不变，无需修改 Rust 命令。
