# Tasks

## 1. 后端清理命令与原生菜单

- [x] 1.1 在 `src-tauri/src/state.rs` 实现 `clear_workspace`（停止当前 watcher、清除 `workspace_root`、清除 settings 中的 `last_workspace` 并持久化），在 `src-tauri/src/lib.rs` 注册 Tauri 命令，并比照 `set_workspace` 在 capabilities 中的声明补 `clear_workspace` 权限；在 `src-tauri/src/state/tests.rs` 补单测验证清理后 `get_workspace` 返回 None 且 `last_workspace` 不再持久化，`cargo test --manifest-path src-tauri/Cargo.toml` 通过
- [x] 1.2 在 `src-tauri/src/menu/mod.rs` 的 `file_menu` 中 `open-folder` 之后新增 `close-workspace` 菜单项（label「关闭工作区」，`Requires::Workspace`，无快捷键），更新 `src-tauri/src/menu/tests.rs` 的 action id 集合、label、requirement 与 enablement 断言，`cargo test --manifest-path src-tauri/Cargo.toml` 通过

## 2. 前端关闭流程与入口

- [x] 2.1 在 `src/infra/storage.ts` 新增 `clearWorkspace()` IPC 封装（与 `setWorkspace` 对称）；扩展 `src/ui/file-tree/workspace.ts` 的 `setWorkspacePath(null)` 分支：调用 `clearWorkspace`，失败记录日志且不更新状态，成功后置空 store；新增 `resetFileTreeToEmptyState()`（恢复 `#file-tree` 空态 DOM + `createFileTreeState()` 重建树状态，不改 `hidden`）与 `closeWorkspaceFolder()` 统一关闭流程（守卫 + 重置 + toast），经 file-tree barrel 导出；单测覆盖：null 分支调用清理 IPC、失败保持状态、关闭流程重置空态
- [x] 2.2 接线两个入口：`src/ui/file-tree-context-menu.ts` 空白区域有工作区分支新增「关闭工作区」菜单项与 `close-workspace` action；`src/ui/native-menu.ts` `actionHandlers` 注册 `close-workspace` 处理器；更新/新增 `src/ui/__tests__/file-tree-context-menu.test.ts` 与 `src/ui/__tests__/native-menu.test.ts` 用例覆盖菜单项出现条件与分发，`npm test` 通过

## 3. 集成验证

- [x] 3.1 全量门禁通过：`npm test`、`npx tsc --noEmit`、`npm run build`、`npm run validate:openspec`、`node scripts/check-layering.mjs`、`cargo fmt --manifest-path src-tauri/Cargo.toml --check`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`、`cargo test --manifest-path src-tauri/Cargo.toml`
