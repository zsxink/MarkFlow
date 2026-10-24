# Proposal

## Why

打开文件夹后文件树会一直绑定该工作区，应用没有任何「关闭工作区」入口：侧边栏底部、工具栏与原生菜单都只有打开操作。用户一旦打开过文件夹就只能停留在这个工作区里，无法回到「请先打开文件夹」的初始空状态。

## What Changes

- 新增统一的「关闭工作区」流程：前端调用新的后端清理命令，随后清空工作区路径状态并把文件树重置回「请先打开文件夹」空态。
- 后端新增 `clear_workspace` 命令：停止文件系统 watcher、清除会话工作区根路径、清除持久化的 `last_workspace`，保证重启后不再自动恢复已关闭的工作区（当前 `setWorkspacePath(null)` 只清前端状态，Rust 侧 watcher 与 `last_workspace` 均未清理）。
- 新增两个入口，均执行同一关闭流程：
  - 文件树空白区域右键菜单新增「关闭工作区」（与无工作区时的「打开文件夹」位置对应）；
  - 原生菜单「文件」新增「关闭工作区」项，仅有工作区时可用（复用现有 `Requires::Workspace` 启用机制）。
- 已打开的文档标签页不受影响：只解除工作区绑定，不关闭任何文件。

## Capabilities

### New Capabilities

- `workspace-close`: 定义关闭当前已打开工作区文件夹的行为契约——入口与启用条件、前端状态重置（文件树空态、路径状态）、后端 watcher 与持久化清理、以及已打开文档不受影响的保证。

### Modified Capabilities

（无——`sidebar`、`native-menu-bar`、`context-menu` 既有 requirement 均为通用约束（入口一致性、按状态启用、统一菜单 API），新增关闭入口符合既有约束，无需改动 requirement 层。）

## Impact

- 前端：`src/ui/file-tree/workspace.ts`（`setWorkspacePath(null)` 接后端清理 + 新增关闭流程与空态重置）、`src/ui/file-tree-context-menu.ts`（新菜单项）、`src/ui/native-menu.ts`（actionHandlers 接线）、`src/infra/storage.ts`（`clearWorkspace` IPC 封装）。
- 后端：`src-tauri/src/state.rs`（`clear_workspace`：停 watcher、清 `workspace_root` 与 `last_workspace`）、`src-tauri/src/lib.rs`（注册命令）、`src-tauri/src/menu/mod.rs`（file 菜单项）、Tauri capabilities 权限声明。
- 测试：`src-tauri/src/menu/tests.rs`（菜单结构断言更新）、`src-tauri/src/state/tests.rs`（清理行为）、前端 file-tree / context-menu / native-menu 相关 `__tests__`。
- 不改动：文档标签页会话（`src/ui/documents/session.ts` 与 workspacePath 解耦，现状已满足）。
