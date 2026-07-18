## 1. 后端统一错误与锁访问

- [x] 1.1 新增 `src-tauri/src/error.rs`：定义 `AppError`（含 `code` 枚举与 `message`）及 `AppErrorCode`（LockPoisoned / WatcherStartFailed / Io / Serialization / WorkspaceInvalid 等），实现 `Serialize` + `Display`。
- [x] 1.2 新增锁访问 helper（`state.rs` 内或 `lock.rs`）：`lock_mutex` 对 `PoisonError` 取 `into_inner` 并转结构化错误；可恢复状态恢复后仍继续。
- [x] 1.3 迁移 `state.rs`（`workspace_root`、`watcher`、`pending_file`、`cli_file` 的 `lock().unwrap()`）使用 helper，缩小 `set_workspace` 持锁范围（先 `take` 旧 watcher 再起新）。
- [x] 1.4 迁移 `commands/settings.rs`（`settings_cache()` 三处 `lock().unwrap()`），文件 IO 保持在锁外。
- [x] 1.5 迁移 `lib.rs` 命令（`take_pending_file`、`take_cli_file`、`setup` 中的 cli/watcher 初始化）使用 helper，命令返回 `Result<_, AppError>` 并保持 `message` 字符串兼容。

## 2. 可取消的 watcher 生命周期

- [x] 2.1 改造 `fs/watcher.rs`：新增 `JoinHandle` + 停止标志，`FileWatcher` 增加 `stop()`（置标志 + drop + join）。
- [x] 2.2 `watcher.rs` 改用有界队列 `sync_channel(CAP)`，`try_send` 失败记 overflow/drop 计数并触发一次受控重扫。
- [x] 2.3 `watcher.rs` 工作线程对 notify 运行时错误从静默 `recv` 改为 `warn` 日志并确保存活。
- [x] 2.4 `AppState` 增加 `stop_all()`：停止 watcher；在 Tauri `RunEvent::Exit` 收尾处调用，确保退出时清理。

## 3. 前端错误分类与空 catch 清理

- [x] 3.1 新增 `src/lib/error.ts`：`classifyError(err)` → `{ kind: 'retry'|'conflict'|'degrade'|'fatal', code }`，解析后端错误码。
- [x] 3.2 清理 `contextMenu.ts` / `imageContextMenu.ts` 的 `.catch(()=>showToast)`：改为 `reportUserActionError` 分类后给出可恢复提示。
- [x] 3.3 将 `main.ts` 中 best-effort 忽略点（`mark_initial_file_handled`、`beforeunload` 保存）改为结构化 `logDebug`（仍不阻断用户）。
- [x] 3.4 接 `file-changed` 接收端关闭：将 `emit` 失败视为 best-effort 并日志（后端 `set_workspace` 中 `let _ = emit`）。

## 4. 自动保存持久状态

- [x] 4.1 `src/main.ts`：自动保存非交互失败时用 `store` 维护连续失败计数（≥2 才持久显示）。
- [x] 4.2 `statusbar` 组件：渲染持久自动保存失败指示条；成功一次即清除。
- [x] 4.3 确认 `saveActiveDocument` 失败路径不清除 dirty（`editor` 模块行为，测试验证）。

## 5. 崩溃日志与脱敏

- [x] 5.1 `logger.rs`：注册 `std::panic::set_hook`，记录 panic 位置与消息（脱敏）后调用默认 hook；仅初始化一次。
- [x] 5.2 新增 `redact()` 工具：截断/遮蔽文档正文、URL secret/query。
- [x] 5.3 前后端 `log` 调用统一经脱敏处理敏感 payload（重点：settings 路径、文件内容、URL）。

## 6. 自动化测试

- [x] 6.1 Rust 单测：模拟 poisoned mutex 经 helper 恢复；`settings_cache` 在损坏锁下仍返回默认值。
- [x] 6.2 Rust 单测：watcher 启动失败返回 `WatcherStartFailed` 错误码；运行时错误不静默。
- [x] 6.3 集成/单测：workspace 快速切换不泄漏线程（`stop()` 后 `JoinHandle` 已结束）。
- [x] 6.4 前端测试：模拟自动保存连续失败 → 持久状态可见且 dirty 保留；成功一次 → 清除。
- [x] 6.5 脱敏测试：含 secret 的 URL、长文档正文经 `redact()` 后不泄露原始内容。
- [x] 6.6 `openspec validate harden-runtime-panic` 通过，运行 `npm test` 与 `npm run build` 全绿。
