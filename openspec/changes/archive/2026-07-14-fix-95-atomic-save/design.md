## Context

MarkFlow 是 Tauri v2 桌面 Markdown 编辑器。当前所有文件写入（文档、settings、图片导出）均使用 `fs::write` 直接覆盖目标文件。前端自动保存基于 `setInterval`，无 in-flight 锁。文件监视器通过 3 秒 TTL 的 `suppressNextWatcherRefresh` 避免自身写入触发的事件循环。

**当前问题**：
- `fs::write` 是 truncate-then-write，崩溃/断电时文件可能被截断
- `setInterval` 不检查前次保存是否完成，可导致重叠写入
- `suppressNextWatcherRefresh` 仅延迟 3 秒，无法可靠覆盖慢写入

**涉及的关键文件**：
- `src-tauri/src/commands/files.rs` — 7 个 `fs::write` 调用
- `src-tauri/src/commands/settings.rs` — 1 个 `fs::write` 调用
- `src/components/sidebar.fileops.ts` — `saveActiveDocument()`
- `src/main.ts` — auto-save timer + file-changed listener
- `src/lib/editor.ts` — `markDocumentPersisted()`

## Goals / Non-Goals

**Goals:**
- 保存失败不会截断或清空已有文档
- 同一文档不会并发写入
- 旧 revision 完成后不会错误清除新内容的 dirty 状态
- 外部修改不会被静默覆盖
- settings.json 保存同样具备原子性

**Non-Goals:**
- 跨文件事务（同时保存多个文件作为原子操作）
- 保存历史/版本回滚（不属于本次修复范围）
- 修改文件监视器的核心架构（仅在保存前增加 mtime 校验）
- 图片导出（`save_image_export` 等）的原子化（非关键路径，可后续处理）

## Decisions

### D1: Rust 端原子写入

**选择**：在 Rust 端实现 `atomic_write(path, content)` 函数，所有保存调用迁移至此。

**流程**：
1. 在目标文件同目录创建临时文件（`.tmp` 后缀，如 `{filename}.md.{pid}.tmp`）
2. 写入内容到临时文件
3. 调用 `file.sync_all()` 确保数据落盘
4. 使用 `fs::rename()` 原子替换目标文件
5. 失败时删除临时文件，旧文件保持完整

**备选方案**：
- 前端 JS 端原子写入：不可行，Tauri IPC 是异步的，rename 需要在同一进程完成
- 写入后读回验证：增加延迟但不解决崩溃时的截断问题
- 使用 `copy` + `remove_all`：非原子，rename 在所有 OS 上都是原子操作

**关键选择**：临时文件命名 `{basename}.{pid}.{counter}.tmp`，避免多实例冲突。rename 在 macOS/Linux 上是原子操作（POSIX 保证），在 Windows 上通过 `MOVEFILE_REPLACE_EXISTING` 实现。

### D2: 串行化自动保存

**选择**：使用 Promise 链 + boolean flag 实现串行调度。

**流程**：
1. 维护 `savingInProgress: boolean` 标志
2. `setInterval` 触发时，如果 `savingInProgress` 为 true，跳过本次触发
3. 保存开始时设置 flag，完成时清除
4. 保存期间新编辑仅标记 dirty，不触发额外保存

**备选方案**：
- Promise 队列（p-queue）：引入外部依赖，过度设计
- Worker 线程：Tauri 已经在 Rust 端处理 I/O，前端无需额外线程

### D3: Revision 追踪

**选择**：在 editor 模块维护递增 `revision` 计数器。

**流程**：
1. 每次 `getMarkdown()` 产生新内容时递增 revision
2. 保存时快照当前 revision
3. 保存完成后，仅当 persisted revision 与当前 revision 一致时才标记 `dirty: false`
4. 如果保存期间有新编辑（revision 变化），dirty 保持 true

**关键细节**：revision 存储在 `editor` 模块的模块级变量中，不需要持久化。

### D4: 保存前 mtime + size 校验

**选择**：在 `saveActiveDocument` 中，保存前读取文件的 `mtime` 和 `size`，与上次读取时的值对比。

**流程**：
1. 打开/读取文件时记录 `{ mtime, size }` 快照
2. 保存前重新 stat 文件，对比快照
3. 如果 mtime 或 size 变化，说明有外部修改
4. 交互模式下提示用户确认；非交互模式下跳过本次保存

**备选方案**：
- 文件哈希：开销过大，不适合频繁检查
- 仅依赖 watcher 事件：watcher 可能丢失事件（已在 issue 中指出）

### D5: 清理 suppressNextWatcherRefresh

**选择**：`suppressNextWatcherRefresh` 仍然保留，但不再作为保存安全性的主要依赖。它继续用于避免保存触发的 watcher 事件导致不必要的 UI 刷新。mtime 校验作为外部修改检测的主要机制。

## Risks / Trade-offs

- **[磁盘空间不足时 rename 可能失败]** → `atomic_write` 在 rename 失败时清理临时文件并返回错误；前端保持 dirty 状态
- **[Windows 上 rename 替换非空文件]** → 使用 `fs_extra::move_items` 或 Windows API 的 `MOVEFILE_REPLACE_EXISTING` 标志
- **[临时文件残留（进程异常退出）]** → 启动时扫描工作目录下的 `*.tmp` 文件并清理；临时文件名包含 PID 以避免误删其他进程的文件
- **[revision 计数器溢出]** → 使用 `u64`，实际不可能溢出（每秒 10 万次编辑也需数百年）
- **[mtime 精度问题（某些文件系统仅秒级）]** → 同时检查 size；如果 mtime 和 size 都相同，大概率未被修改
