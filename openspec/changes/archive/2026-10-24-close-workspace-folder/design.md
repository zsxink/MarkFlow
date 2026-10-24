# Design

## Context

- 工作区路径的前端单真相是 `src/ui/file-tree/workspace.ts` 的 `setWorkspacePath(path | null)`：`path` 非空时调 IPC `set_workspace`（后端停旧 watcher、启新 watcher、持久化 `last_workspace`）并更新 store；**传 `null` 目前只改 store，不通知后端**——watcher 继续运行、`last_workspace` 仍在，重启后 `restoreWorkspace()` 会自动恢复旧工作区。
- 「请先打开文件夹」空态是 `index.html` 中 `#file-tree` 的静态子节点 `<div class="empty-state">`；`#file-tree` 的 `hidden` 属性由侧边栏标签切换逻辑（`switchSidebarTab`）控制，与工作区无关。`refreshFileTree()` 在无工作区时直接 early-return，不会清理 DOM，因此关闭流程需要显式的空态重置。
- 原生菜单：Rust 侧 `menu/mod.rs` 纯数据描述（`Requires::Workspace` 变体已存在），点击经 `menu:action` 事件到 TS 侧 `src/ui/native-menu.ts` 的 `actionHandlers` 分发；`workspace:set` 事件自动触发 `hasWorkspace` 上报，`Requires::Workspace` 项随之禁用——新增菜单项的启用联动无需额外代码。
- `sidebar/index.ts` import 了 `file-tree-context-menu.ts`；若右键菜单反向 import sidebar 会形成循环依赖。

## Goals / Non-Goals

**Goals:**

- 关闭工作区后：前端回到与「从未打开过文件夹」等价的状态；后端 watcher 与持久化记录同步清理。
- 两个入口（右键菜单、原生菜单）走同一关闭流程，行为不可分叉。

**Non-Goals:**

- 不新增键盘快捷键（issue 标注可选；避免与现有快捷键冲突，保持范围最小）。
- 不处理多窗口同时打开不同工作区（现状 `set_workspace` 即全局单工作区，本变更沿用）。
- 不在侧边栏底部按钮区加入口（issue 建议的两个入口已覆盖可发现性；按钮区保持「打开/新建」）。

## Decisions

### D1: 后端新增 `clear_workspace` 命令，而非扩展 `set_workspace` 接收 None

`set_workspace` 的语义是「切换到某目录」（停旧 watcher → 设根 → 启新 watcher → 持久化）。关闭是不同语义：停 watcher、清根、清持久化。新增独立命令保持两者签名与语义清晰，不动现有命令的调用方。实现放 `src-tauri/src/state.rs`（参考 `set_workspace` 已有的「先停旧 watcher」逻辑），在 `lib.rs` 注册；TS 侧在 `src/infra/storage.ts` 加 `clearWorkspace()` IPC 封装（与 `setWorkspace` 对称）。

**替代方案**：让 `set_workspace` 接受 `Option<String>`。否决——所有既有调用点签名变动，且「清空」与「设置」混在一个命令里错误处理含糊。

### D2: `setWorkspacePath(null)` 内部调用 `clearWorkspace`，保持单一真相

`setWorkspacePath` 是工作区状态的唯一 accessor。让 `null` 分支与 `path` 分支对称：先调 IPC（`clear_workspace`），失败时记录日志且**不更新** store（与 `path` 分支失败时不动状态的行为一致），成功时 `store.setState({ workspacePath: null })`。这样任何调用方传 `null` 都得到完整语义，不可能出现「前端清了、后端没清」的分叉。

### D3: 关闭流程 `closeWorkspaceFolder()` 放 `file-tree/workspace.ts`，不放 sidebar

关闭不需要目录选择对话框，也不需要 `revealFilesTab`；而 `sidebar/index.ts` 已 import 右键菜单模块，反向依赖会成环。放 `file-tree/workspace.ts`（含空态重置），经 file-tree barrel 导出后，右键菜单（`file-tree-context-menu.ts`）与原生菜单（`native-menu.ts`）直接消费，无环。流程：

1. `await setWorkspacePath(null)`；
2. 守卫：`getWorkspacePath()` 仍非空说明后端清理失败，记录已由 `setWorkspacePath` 完成，直接返回（不重置 UI、不报成功，与 `activateWorkspaceFolder` 的守卫哲学一致）；
3. 重置文件树 DOM 与树状态（见 D4）；
4. toast「工作区已关闭」。

### D4: 空态重置 = innerHTML 恢复 empty-state + 树状态重建

`resetFileTreeToEmptyState()`：把 `#file-tree` 的 innerHTML 恢复为 `<div class="empty-state">请先打开文件夹</div>`，并用 `setTreeState(createFileTreeState())` 清空内存树状态（避免下次打开工作区残留旧节点）。**不碰 `hidden` 属性**——它属于标签页切换逻辑的职责；关闭时用户正停留在文件标签页，重置后立即看到空态。

### D5: 原生菜单项紧随「打开文件夹…」，`Requires::Workspace`，无快捷键

`file_menu()` 在 `open-folder` 之后加 `item("close-workspace", "关闭工作区", None, Requires::Workspace)`；无 accelerator（避免进入 `accelerators_are_unique` 断言集合）。TS 侧 `actionHandlers` 加 `'close-workspace': closeWorkspaceFolder`。同步更新 `menu/tests.rs` 的 id 集合、label 断言、requirement 断言与 enablement 断言（这些测试断言精确集合，漏改会红）。

### D6: 右键菜单入口放「空白区域 + 有工作区」分支

`showContextMenu` 的 `type === 'empty' && workspacePath` 分支（现有「复制工作区路径」处）追加「关闭工作区」，与无工作区分支的「打开文件夹」位置对应。文件/文件夹节点右键保持文件操作聚焦，不加工作区级操作。

### D7: Tauri capabilities 权限

新增自定义命令需确认 capabilities 声明（本项目 capabilities 非空白名单模式，命令未被引用则前端调用被拒）。实施时比照 `set_workspace` 在 capabilities 中的声明方式补 `clear_workspace`，并在构建产物 `capabilities.json` 中验证落地。

## Risks / Trade-offs

- [clear_workspace 失败（如 settings 写盘失败）导致前端不关闭] → 守卫返回，用户停留在原工作区，与打开失败的处理对称；日志已记录，无数据损坏风险。
- [关闭瞬间 watcher 尚在途的事件到达前端] → 前端 `workspacePath` 已为 null，`applyFileTreeEvents` 找不到容器自然 no-op（现状已安全），无需额外抑制。
- [多窗口场景下关闭影响所有窗口的文件树] → 与现状 `set_workspace` 全局单工作区一致，不引入新行为；本变更不解决也不恶化。
- [menu/tests.rs 断言精确集合，改动易漏] → 任务清单将「更新 Rust 菜单测试」列为独立验收项，`cargo test` 兜底。

## Migration Plan

纯增量功能，无数据迁移。回滚即还原代码；`last_workspace` 被清除后重启停留在空态，属预期用户可见行为。
