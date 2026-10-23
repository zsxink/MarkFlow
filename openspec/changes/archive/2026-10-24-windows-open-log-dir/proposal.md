# Proposal: windows-open-log-dir

## Why

Windows 下「帮助 → 打开日志目录」点击后完全无反应（issue #377）。根因：后端 `get_log_dir` 返回正斜杠归一化路径（`C:/Users/...`），前端 `@tauri-apps/plugin-shell` 的 `open()` 按 `tauri.conf.json` 的白名单正则校验，其中盘符分支 `[a-zA-Z]:\\.*` 要求盘符后必须是反斜杠，正斜杠路径校验失败被拒；而 `dispatchNativeMenuAction` 的 catch 只写日志，无任何用户可见反馈，表现为「点了没反应」。同一根因还影响文件树右键「在文件资源管理器中显示」与图片右键「打开文件所在」（Windows 上同样会因路径形态校验失败）。

## What Changes

- 后端新增 Tauri 命令 `open_in_file_manager(path)`：用 `tauri-plugin-opener`（Rust API）按系统默认方式打开目录或定位文件，不经 shell 插件的 URL 白名单校验，接受任意分隔符形态的路径（正斜杠/反斜杠均可）。
  - 目录 → 在系统文件管理器中打开该目录；
  - 文件 → 在系统文件管理器中定位该文件（`reveal` 语义，与右键菜单文案一致）；
  - 路径不存在时返回统一错误类型 `AppError`（Io 类），前端可分类提示。
- 前端三处本地路径打开全部改走新命令：
  - `src/ui/native-menu.ts` `openLogDirectory()`（帮助 → 打开日志目录）；
  - `src/ui/file-tree-context-menu.ts` `reveal`（在文件资源管理器中显示）；
  - `src/ui/image-context-menu.ts` `openContainingFolder`（打开文件所在）。
  - `@tauri-apps/plugin-shell` 仅保留用于外部 URL（帮助 → 反馈）。
- `dispatchNativeMenuAction` 的 catch 增加用户可见 toast 提示（复用 `classifyError` 分类），修复「菜单动作失败无任何反馈」的整类问题；`logException` 结构化日志保留。

## Capabilities

### New Capabilities

- `file-manager-open`: 通过后端命令以系统文件管理器打开目录/定位本地文件的能力，覆盖路径形态容错、目录与文件的语义区分、不存在路径的统一错误返回，以及菜单/右键菜单/图片菜单三个 UI 入口的接入与失败反馈。

### Modified Capabilities

- `native-menu-bar`: 「菜单操作分发」要求新增场景——菜单动作执行失败时必须给出用户可见的提示，不得静默失败（仅写日志）。

## Impact

- **后端**：`src-tauri/Cargo.toml` 新增 `tauri-plugin-opener` 依赖；`src-tauri/src/lib.rs` 注册插件与新命令；新增命令实现文件（含单元测试）。Rust 侧不需修改 `normalize_path`/`get_log_dir`（后端命令接受正斜杠路径）。
- **前端**：`src/ui/native-menu.ts`、`src/ui/file-tree-context-menu.ts`、`src/ui/image-context-menu.ts` 替换本地路径的 `shellOpen` 调用并补失败提示；`tauri.conf.json` 的 shell 白名单保留（仍用于 https URL）。
- **权限**：`tauri-plugin-opener` 仅经 Rust API 调用，不新增前端 capability 权限项。
- **风险**：低——不动现有日志/路径工具函数，三处调用点行为由新命令统一；Windows 实机验证为本修复的最终验收手段（CI 无 Windows 桌面环境，以单元测试 + 代码走查兜底）。
