# Design

## 背景

右键菜单构建：`src/ui/file-tree-context-menu.ts` `showContextMenu(x, y, path, type)`（:17-51），`TargetType = 'file' | 'folder' | 'empty'`。有工作区恒有「新建文件/新建文件夹」（:22-25）；节点项（file/folder 共用 :27-33）「重命名/复制(副本)/删除/复制文件路径/复制绝对路径」；空白区分支（:34-43）有工作区时「复制工作区路径」（:37）、「关闭工作区」（:38）；末尾所有 target 加「在文件资源管理器中显示」（:46-48）。`'close-workspace'` action → `closeWorkspaceFolder()`（:158-161）。

关闭流程（不动）：`closeWorkspaceFolder()`（workspace.ts:63-71）→ setWorkspacePath(null) → 后端 clear_workspace（清 watcher + last_workspace）→ resetFileTreeToEmptyState（空态文案已是「请先打开文件夹」）→ toast。

## 方案

### 节点右键加「关闭文件夹」

`file-tree-context-menu.ts` 节点分支（file/folder）在「复制绝对路径」之后加 `divider: true` 的「关闭文件夹」项，可见条件与空白区一致（`getWorkspacePath()` 非空）；action 复用现有 `'close-workspace'` case（同一关闭流程，零新逻辑）。空态文案与「在文件资源管理器中显示」等其余项不动。

### 文案替换（机械替换，共 8 处 + Rust 1 处）

| 文件 | 旧 | 新 |
|---|---|---|
| `file-tree-context-menu.ts:37` | 复制工作区路径 | 复制文件夹路径 |
| `file-tree-context-menu.ts:38` | 关闭工作区 | 关闭文件夹 |
| `file-tree-context-menu.ts:145` | 已复制工作区路径 | 已复制文件夹路径 |
| `new-file-dialog.ts:95` | 请先打开工作区 | 请先打开文件夹 |
| `sidebar/index.ts:38` | 请先打开一个工作区文件夹 | 请先打开文件夹 |
| `workspace.ts:70` | 工作区已关闭 | 文件夹已关闭 |
| `inline.ts:89` | 请先打开工作区 | 请先打开文件夹 |
| `src-tauri/src/menu/mod.rs:234` | 关闭工作区 | 关闭文件夹 |

内部命名（id、函数名、变量、spec 目录）一律不动。完成替换后 `grep -rn "工作区" src/ src-tauri/src/` 逐一核对剩余命中：只允许非用户可见（注释/spec 引用/`Requires::Workspace` 等代码标识）残留，用户可见字符串必须清零。

### 测试更新

- `src/ui/__tests__/file-tree-context-menu.test.ts`：:36-41 断言文案改「关闭文件夹」「复制文件夹路径」；:43-51 关闭流程用例改用新文案；新增节点右键用例：有工作区时 file/folder target 菜单含「关闭文件夹」且点击调 `closeWorkspaceFolder`，无工作区时不含。
- `src-tauri/src/menu/tests.rs:319`：`labels_are_chinese` 的「关闭工作区」断言改「关闭文件夹」。
- 其它断言上述 toast 文案的测试一并 grep 更新（new-file-dialog/inline/workspace 相关测试若有）。

## 风险

- Rust label 改动影响 `cargo test`（tests.rs 三处断言涉及 close-workspace：id 清单 :110 不变、label :319 改、requires :450 不变）。
- 前端 native-menu.test.ts 断言的是 id 与 handler 映射，不涉及 label 文案（apply 时 grep 确认）。
