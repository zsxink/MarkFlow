## Why

通过 macOS Finder 文件关联打开 Markdown 文件时，前端进入单文件模式（无工作区），但后端可能仍保留上次工作区。若文件不在该工作区内，`write_file` 因 `validate_path_in_workspace` 拒绝保存。同时自动保存缺少 dirty guard，即使文件未修改也会每个周期重复调用保存，导致无意义的错误日志和 `autosaveErrorCount` 累加。

## What Changes

- 移除 `write_file` 中基于全局 `workspace_root` 的工作区边界检查，使用户明确打开的文档可以正常保存，无论其是否位于上次工作区内
- 自动保存 tick 增加 dirty guard：仅在文档有实际变更时才触发保存
- 区分保存失败与主动跳过：干净文档、保存进行中等跳过场景不应增加 `autosaveErrorCount`
- 保留文件树相关命令（`create_file`、`rename_path`、`delete_path`、`copy_file` 等）的工作区边界与符号链接校验

## Capabilities

### New Capabilities

- `write-file-permission`: 文档保存命令的路径权限模型 — 明确打开的文档允许保存到工作区外
- `autosave-dirty-guard`: 自动保存的脏检查逻辑 — 无变更不写盘，跳过不计为失败

### Modified Capabilities

- `atomic-save`: `write_file` 不再受工作区边界限制，需更新相关 requirement
- `autosave-reliability`: 新增 dirty guard 和错误计数语义变更

## Impact

- `src-tauri/src/commands/files.rs` — `write_file` 函数移除 `validate_path_in_workspace` 调用
- `src/main.ts` — `startAutoSave` 增加 dirty guard
- `src/lib/editor.state.ts` — `isDocumentDirty` 被新增的自动保存逻辑引用
- 新增前端单元测试和 Rust 单元测试
