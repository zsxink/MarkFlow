## Why

MarkFlow 的文件保存（文档和 settings）全部使用 `fs::write` 直接覆盖目标文件。进程崩溃、断电、磁盘满或写入失败时，文件可能被截断或清空。前端自动保存基于 `setInterval`，没有 in-flight 锁——保存耗时超过间隔时可发生重叠写入，旧内容后完成时可能覆盖新内容。冲突判断依赖 3 秒 TTL 的 `suppressNextWatcherRefresh` 布尔机制，存在事件丢失窗口。

## What Changes

- 在 Rust 后端建立共享 `atomic_write` 函数：写入同目录临时文件 → flush → 原子 rename 替换目标，失败时清理临时文件并保留旧文件
- 将文档保存（`write_file`）、settings 保存（`save_settings_inner`）统一迁移到 `atomic_write`
- 自动保存改为串行调度：同一时刻最多一次保存，新编辑仅合并为下一次保存
- 为每次保存携带内容 revision；完成时只把对应 revision 标记为 persisted
- 保存前核对磁盘 `mtime + size`，可靠识别外部修改
- 失败时保留 dirty 状态并提供可见、可重试的错误
- 启动时识别并安全处理遗留临时文件

## Capabilities

### New Capabilities
- `atomic-save`: Rust 后端原子写入基础设施，包含临时文件创建、flush/sync、原子替换、失败清理和遗留临时文件处理

### Modified Capabilities
- `sidebar-fileops`: 保存要求变更——`saveActiveDocument` 需串行化调度、revision 追踪、保存前 mtime 校验、失败时保留 dirty 状态并显示可重试错误

## Impact

- **Rust 后端**：`src-tauri/src/commands/files.rs`（`write_file` 命令）、`src-tauri/src/commands/settings.rs`（`save_settings_inner`）需迁移到 atomic_write
- **TypeScript 前端**：`src/main.ts`（auto-save timer）、`src/components/sidebar.fileops.ts`（`saveActiveDocument`）、`src/lib/editor.ts`（`markDocumentPersisted`）需支持 revision 追踪和串行调度
- **文件监视器**：`src/main.ts` 的 `file-changed` 监听器在保存前需增加 mtime 校验逻辑
- **测试**：需新增 Rust 单元测试覆盖短写、权限错误、rename 失败等故障注入场景
