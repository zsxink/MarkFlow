## 1. Rust 原子写入基础设施

- [x] 1.1 在 `src-tauri/src/commands/files.rs` 中实现 `atomic_write(path: &Path, content: &str)` 函数：创建临时文件（`.tmp` 后缀，含 PID）→ 写入 → `sync_all()` → `fs::rename()` 替换目标 → 失败时清理临时文件
- [x] 1.2 在 `src-tauri/src/commands/files.rs` 中实现 `cleanup_stale_temp_files(dir: &Path)` 函数：扫描目录下 `*.tmp` 文件，删除超过阈值或属于非运行进程的临时文件
- [x] 1.3 在应用启动时（`src-tauri/src/lib.rs` 的 setup 钩子）调用 `cleanup_stale_temp_files` 清理遗留临时文件
- [x] 1.4 为 `atomic_write` 编写 Rust 单元测试：成功写入、写入失败保留旧文件、rename 失败清理、父目录自动创建
- [x] 1.5 为故障注入场景编写测试：模拟磁盘满（写入超大内容）、权限错误（只读目录）、rename 失败

## 2. 迁移现有写入调用

- [x] 2.1 将 `write_file` 命令（`files.rs` L49-58）从 `fs::write` 迁移到 `atomic_write`
- [x] 2.2 将 `save_settings_inner`（`settings.rs` L45-57）从 `fs::write` 迁移到 `atomic_write`
- [x] 2.3 验证迁移后现有测试通过（`npm test` + Rust `cargo test`）

## 3. 前端串行化自动保存

- [x] 3.1 在 `src/main.ts` 中为 auto-save 添加 `savingInProgress` boolean flag，timer 触发时检查 flag，跳过正在进行的保存
- [x] 3.2 在 `src/components/sidebar.fileops.ts` 的 `saveActiveDocument` 中设置/清除 `savingInProgress` flag
- [x] 3.3 确保保存期间新编辑仅标记 dirty，不触发额外保存

## 4. Revision 追踪

- [x] 4.1 在 `src/lib/editor.ts` 中添加模块级 `revision: number` 计数器，每次内容变更时递增
- [x] 4.2 修改 `markDocumentPersisted` 接受 revision 参数，仅当 persisted revision 与当前 revision 一致时才标记 `dirty: false`
- [x] 4.3 在 `saveActiveDocument` 中保存前快照 revision，保存完成后对比决定是否清除 dirty

## 5. 保存前 mtime + size 校验

- [x] 5.1 在 `src/lib/editor.ts` 中维护 `lastReadMtime` 和 `lastReadSize` 状态，文件打开/读取时记录
- [x] 5.2 在 `saveActiveDocument` 中保存前通过 Rust 后端获取当前文件的 mtime 和 size，与快照对比
- [x] 5.3 新增 Tauri command `get_file_stats(path)` 返回 `{ mtime: number, size: number }`
- [x] 5.4 如果 mtime 或 size 变化，交互模式下弹出确认对话框；非交互模式下跳过保存

## 6. 错误处理与用户体验

- [x] 6.1 `saveActiveDocument` 失败时保留 dirty 状态，交互模式显示错误 toast（含重试提示），非交互模式写入日志
- [x] 6.2 `saveActiveDocumentAsNewFile` 迁移到 `atomic_write`
- [x] 6.3 `sidebar.conflict.ts` 中的 `writeFile` 调用确认已通过 `atomic_write` 获得保护

## 7. 清理 suppressNextWatcherRefresh

- [x] 7.1 确认 `suppressNextWatcherRefresh` 继续用于避免保存触发的 UI 刷新（保留现有行为）
- [x] 7.2 移除 `suppressNextWatcherRefresh` 中与保存安全性相关的隐式依赖注释（如有），明确其仅为 UI 优化

## 8. 测试

- [x] 8.1 为串行化 auto-save 编写测试：模拟慢保存 + 快速编辑，验证无重叠写入
- [x] 8.2 为 revision 追踪编写测试：保存期间编辑，验证 dirty 状态正确保持
- [x] 8.3 为 mtime 校验编写测试：外部修改文件后触发保存，验证冲突检测
- [x] 8.4 运行完整测试套件（`npm test` + `cargo test`），确保无回归
