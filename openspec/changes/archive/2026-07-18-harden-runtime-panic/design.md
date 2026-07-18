## Context

当前后端核心状态（`AppState`、`settings_cache`）用 `Mutex` + `.lock().unwrap()` 保护。Rust 的 `Mutex::lock()` 在持锁线程 panic 后返回 `PoisonError`，现有代码一律 `unwrap()`，意味着一次 panic 会沿线传染到所有后续持锁命令（文件监听、工作区状态、最近文件、窗口流程）。文件 watcher（`fs/watcher.rs`）用 `mpsc::channel`（无界）+ 独立 `thread::spawn`，既无停止信号也无积压上限，线程 panic 后 `rx.recv()` 静默返回，watcher 静默失效。前端 `main.ts`、`sidebar.fileops.ts` 等多处 `.catch(() => {})` 或仅 toast，自动保存在非交互模式失败即静默，dirty 状态虽保留但用户无感知。

约束：本变更为重构，禁止改变常规用户可见行为；命令仍经 Tauri `invoke` 返回，错误需能被前端分类处理。优先使用标准库，避免引入新 crate。

## Goals / Non-Goals

**Goals:**
- 后端不再因预期内的锁 / IO 错误而 panic（poisoned lock 转为结构化 `Result`）。
- watcher / 定时器 / 网络任务具备显式停止与退出语义（workspace 切换、窗口关闭、应用退出）。
- 前端错误分类化：重试 / 冲突处理 / 降级 / 退出，不再有无说明空 catch。
- 自动保存连续失败以持久状态可见，并保留 dirty 状态。
- 崩溃上下文可诊断，且日志脱敏（无完整文档 / URL secret / 私人路径内容）。

**Non-Goals:**
- 不改变编辑器引擎（ProseMirror / CodeMirror）本身的行为或快捷键。
- 不引入新的外部异步运行时（继续用 `std::thread` + `mpsc`，或 Tauri 现有的异步上下文）。
- 不重写既有产品功能；仅加固其故障路径与生命周期。
- 不在本次统一所有 `Result<_, String>` 到全新错误类型的同时改动外部网络协议字段（保持前端 `invoke` 错误字符串向后可读，新错误码作为附加结构）。

## Decisions

### D1: 统一的 poisoned-lock helper
新增 `src-tauri/src/state/lock.rs`（或 `error.rs`），提供 `lock_mutex<T>(m: &Mutex<T>) -> Result<MutexGuard<T>, AppError>`：在 `PoisonError` 时调用 `into_inner()` 取出（多数状态在 panic 后仍自洽，可恢复），返回结构化错误而非 panic。调用点用 `?` 传播。
- 替代：直接 `.lock().expect(...)` —— 仍会因 panic 传染，且丢失结构化上下文。
- 仅对真正不可恢复的状态（如 `AppState::new` 中 HTTP client 构建）保留 `expect`，并加清晰文案。

### D2: 缩小持锁范围
重审 `set_workspace`：先 `take()` 旧 watcher（释放锁）再起新 watcher；`load_settings_inner`/`save_settings_inner` 仅在缓存读写瞬间持锁，文件 IO 在锁外完成。锁内禁止 `emit` 或回调。

### D3: 可取消的 watcher 生命周期
- `FileWatcher` 持 `JoinHandle<()>` 与 `Arc<AtomicBool>` 停止标志（或 `mpsc::sync_channel` 关闭作为停止信号），新增 `stop()`：置标志 + `drop` watcher 并 `join` 线程。
- `AppState` 的 `watcher: Mutex<Option<FileWatcher>>` 在 `set_workspace` 切换、`AppState` 析构前统一 `stop()`。
- 应用退出：在 Tauri `RunEvent::ExitRequested` / `app.run` 收尾处触发 `state.stop_all()`（watcher + 取消在途网络信号）。

### D4: 有界队列 + 溢出重扫
`watcher.rs` 改用 `mpsc::sync_channel::<notify::Result<Event>>(CAP)`（如 1024）。`try_send` 失败记 `warn`（overflow/drop 计数），并置“需重扫”标志；收到足够空闲或队列回落后触发一次受控 `read_dir_recursive` 重扫（通过 callback 的批量事件）。

### D5: 统一错误类型与错误码
新增 `src-tauri/src/error.rs` 定义 `AppError { code: AppErrorCode, message: String, source: Option<Box<dyn Error>> }` 与 `AppErrorCode` 枚举（如 `LockPoisoned`、`WatcherStartFailed`、`Io`、`Serialization`、`WorkspaceInvalid`）。`#[tauri::command]` 返回 `Result<T, AppError>`，经 `Serialize`/`Display` 返回前端（保持 `message` 可读字符串以向后兼容）。

### D6: 前端错误分类
`src/lib/error.ts` 新增 `classifyError(err)` → `{ kind: 'retry'|'conflict'|'degrade'|'fatal', code }`。`contextMenu.ts` / `imageContextMenu.ts` 的 `.catch` 改为调用 `classifyError` 后给出可恢复提示或降级；仅 `best effort` 处（如 `mark_initial_file_handled`、beforeunload 保存）保留忽略并补结构化 `logDebug`。

### D7: 自动保存持久状态
`src/main.ts` 自动保存回调在非交互失败时用 `store` 标记 `autosaveError` 并渲染持久状态条（`statusbar` 组件）+ 计数连续失败；成功一次即清除。dirty 状态由现有 `editor` 模块保留，本变更仅确保失败不清除它。

### D8: panic hook 与脱敏
`logger.rs` 注册 `std::panic::set_hook`：记录 `panic` 发生点与消息（脱敏），再调用默认 hook。新增 `redact()` 工具：截断并遮蔽文档正文、URL query/secret、私人绝对路径文件名（保留目录层级提示）。前后端 `log` 调用统一经 `redact` 处理敏感 payload。

## Risks / Trade-offs

- [R] poisoned lock 取 `into_inner()` 可能读到半更新状态 → 仅对幂等 / 可重建状态（settings 缓存、pending/cli 文件 map）采用；不可恢复状态保留 `expect` 并明确文案。
- [R] 有界队列在高频写入目录可能频繁溢出重扫 → 设合理 `CAP` 并对重扫做去抖（与 `debouncedRefreshFileTree` 对齐）。
- [R] 统一错误类型改动命令签名面较广 → 用向后兼容的 `message` 字符串，前端新增 `code` 解析，旧调用点逐步迁移；不一次性重写所有命令。
- [R] panic hook 影响全局 → 仅在 `main.rs` 初始化一次，避免重复注册；测试用 `std::panic::catch_unwind` 隔离。
- [R] 前端持久错误条可能过度打扰 → 仅自动保存连续失败（≥2 次）才显示，单次失败仍用 toast。

## Migration Plan

1. 后端先落地 `error.rs` + `lock` helper，迁移 `state.rs` / `settings.rs` / `lib.rs` 命令（保持 `message` 字符串兼容）。
2. 改造 `watcher.rs` 为有界 + 可停止，接 `AppState::stop_all()`。
3. 前端加 `error.ts` 分类，清理空 catch，接 `statusbar` 持久状态。
4. 注册 panic hook + 脱敏。
5. 补充自动化测试（见 specs 场景）。
6. 回滚：任一阶段都可独立 revert；因保持 `message` 兼容，前端/后端可分步合入。

## Open Questions

- 是否将 `AppState` 析构（`Drop`）用于退出清理，还是显式 `RunEvent::ExitRequested` 钩子更稳妥？（倾向显式钩子，因 Tauri 退出顺序可控。）
- 有界队列容量 `CAP` 的默认值是否按平台/工作区规模可调？（初版固定 1024，后续可观测后调。）
