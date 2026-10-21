# Proposal

## Why

`write_file_binary`（`src-tauri/src/commands/export.rs:616-618`）是一个零校验的 Tauri command：直接将前端传入的 `Vec<u8>` 写到前端指定的任意路径，无 `resolve_path`、无 `validate_path_in_workspace`、无大小上限、无保存对话框，且已在 `src-tauri/src/lib.rs:344` 注册到 `invoke_handler`。DOCX 导出实际使用的是旁边的 `save_binary_export`（弹窗授权 + 写盘），全仓库搜索确认 `write_file_binary` 除声明与注册外无任何调用方。这条暴露给前端的任意写盘通道与 `export-workspace-bypass`、`write-file-permission` 两份规范的安全意图相悖，属于可被利用的攻击面，且没有任何使用价值。

## What Changes

- 删除 `commands::export::write_file_binary` 函数及其 `#[tauri::command]` 属性
- 从 `src-tauri/src/lib.rs` 的 `generate_handler!` 中移除 `commands::export::write_file_binary` 注册
- 清理随之变为未使用的 import（如有）
- 在 `export-workspace-bypass` 规范中固化一条要求：导出写盘 SHALL 仅通过带保存对话框授权的专用命令完成，不得暴露无校验的任意路径写盘命令
- 若将来确有「写已授权临时路径」的内部需求，应实现为内部 Rust 函数而非 `#[tauri::command]`

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `export-workspace-bypass`: 新增要求 —— 导出写入必须经由授权命令，不得存在零校验的任意路径写盘 command

## Impact

- 代码：`src-tauri/src/commands/export.rs`、`src-tauri/src/lib.rs`
- API：移除 Tauri IPC command `write_file_binary`（无前端调用方，无兼容性影响）
- 依赖：无新增
- 文档：`docs/cleanup-plan/analysis.md`、`priority.md`、`code-standards.md` 中关于该项的待办记录在改动完成后应视为已处理（不修改历史文档）
