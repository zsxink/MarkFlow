# Proposal

## Why

「关闭工作区」入口只有文件树空白区域右键与原生菜单两处，而用户最常右键的恰恰是文件/文件夹节点；打开文件夹后想关掉得先找空白处或翻菜单。同时用户可见文案混用「工作区」与「文件夹」（侧边栏空态、打开入口都说「文件夹」），术语不一致造成理解成本（issue #407）。

## What Changes

- **入口扩展**：文件树右键菜单在右键**文件节点**与**文件夹节点**时也提供「关闭文件夹」项（存在工作区时显示），与空白区域入口、原生菜单执行同一关闭流程。
- **文案统一**：用户可见文案不再出现「工作区」，统一为「文件夹」：
  - 右键菜单项：「关闭工作区」→「关闭文件夹」、「复制工作区路径」→「复制文件夹路径」
  - 原生菜单：「文件 → 关闭工作区」→「文件 → 关闭文件夹」（menu id `close-workspace` 不变）
  - Toast：「工作区已关闭」→「文件夹已关闭」、「请先打开工作区」→「请先打开文件夹」（3 处）、「已复制工作区路径」→「已复制文件夹路径」、「请先打开一个工作区文件夹」→「请先打开文件夹」
  - 相应单元测试断言同步更新
- **命名不动**：内部实现命名（`workspacePath`/`closeWorkspaceFolder`/`close-workspace` command id/spec 目录名 `workspace-close`）保持不变，只改用户可见文案，避免无谓的大范围重命名。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `workspace-close`: 「关闭工作区入口」requirement 扩展入口清单（新增文件节点/文件夹节点右键菜单）并将入口文案统一为「关闭文件夹」「复制文件夹路径」。
- `native-menu-bar`: 「菜单状态联动」requirement 中「关闭工作区」文案改为「关闭文件夹」。

## Impact

- 代码：`src/ui/file-tree-context-menu.ts`（菜单项 + 节点分支入口）、`src/ui/new-file-dialog.ts`、`src/ui/sidebar/index.ts`、`src/ui/file-tree/workspace.ts`、`src/ui/file-tree/inline.ts`（toast 文案）、`src-tauri/src/menu/mod.rs`（菜单 label）。
- 测试：`src/ui/__tests__/file-tree-context-menu.test.ts`、`src-tauri/src/menu/tests.rs`，及其它断言上述文案的测试。
- 风险：文案改动面广但机械；Rust label 改动需 `cargo test` 验证；无行为逻辑变化（仅菜单项可见条件复用现有工作区判断）。
- 关联 issue：#407。
