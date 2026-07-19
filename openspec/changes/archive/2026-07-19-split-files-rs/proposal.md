## Why

`src-tauri/src/commands/files.rs` 有 1331 行，包含所有文件操作命令（读、写、重命名、复制、删除、元数据、图片下载、页面标题获取、目录分页列表），职责过多，不利于维护和代码审查。按功能拆分为子模块可提高可读性和可维护性。

## What Changes

- 将 `files.rs` 按功能拆分为 4 个文件：`files.rs`（核心文件操作）、`files_pagination.rs`（目录分页）、`files_image.rs`（图片下载）、`files_meta.rs`（元数据获取）
- 更新 `commands/mod.rs` 重新导出所有命令
- 所有 `#[tauri::command]` 函数签名保持不变，前端 IPC 不受影响

## Capabilities

### New Capabilities

（无新能力引入，纯代码结构重构）

### Modified Capabilities

（无 spec 级别行为变更）

## Impact

- **代码：** `src-tauri/src/commands/files.rs`、`src-tauri/src/commands/mod.rs`，新增 3 个文件
- **API：** 无变化（所有 Tauri command 签名不变）
- **依赖：** 无变化
- **风险：** 低（纯重构，不改功能逻辑）
