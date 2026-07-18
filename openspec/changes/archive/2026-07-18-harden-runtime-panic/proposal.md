## Why

核心状态多处使用 `Mutex::lock().unwrap()`（见 `src-tauri/src/state.rs:58`、`lib.rs:127/136/142/332/375`、`commands/settings.rs` 的 `settings_cache()`），任一持锁代码 panic 后会造成锁中毒，使文件监听、工作区状态、最近文件和窗口流程后续命令继续 panic，可能不可恢复。文件 watcher 使用无界 channel + 独立线程（`src-tauri/src/fs/watcher.rs:56,63`），缺少显式停止、积压与线程异常态。前端存在多处 `.catch(() => {})` 或仅 toast 的空处理（如 `main.ts:86/153/154`、`sidebar.fileops.ts:130`），自动保存失败在非交互模式下静默无提示。需要在不引入外部行为破坏的前提下，消除预期内的 panic 与静默失败，并统一后台任务生命周期。

## What Changes

- 引入统一的 Rust 锁访问 helper：poisoned lock 转为结构化错误（`Result`），不再 `unwrap()` 泄漏 panic；对可安全恢复的状态（如 settings 缓存）明确恢复策略。
- 缩小持锁范围：禁止在锁内执行文件 IO、事件发送或回调（重审 `AppState::set_workspace`、`load_settings_inner`/`save_settings_inner`）。
- 后台任务可取消生命周期：workspace 切换、窗口关闭、应用退出时显式停止 watcher / 定时器 / 网络任务；watcher 线程改为 join-handle 可管理、可停止。
- watcher 改用有界队列，记录 overflow/drop，溢出后触发一次受控重扫。
- 统一后端错误类型与错误码；前端依类型决定重试 / 冲突处理 / 降级 / 退出。
- 清点所有空 catch：仅“best effort”操作允许忽略，且至少写结构化 debug/warn 日志。
- 自动保存连续失败时显示持久状态条（非短暂 toast），并保留 dirty 状态。
- 设置 panic hook 记录崩溃上下文与日志；日志字段脱敏，禁止写入完整文档内容、URL secret、私人路径内容。

## Capabilities

### New Capabilities
- `error-handling`：统一的后端错误类型与错误码、poisoned-lock helper、前端错误分类（重试 / 冲突 / 降级 / 退出），替代散落的 `Result<_, String>` 与空 catch。
- `background-task-lifecycle`：watcher / 定时器 / 网络任务的统一可取消生命周期与退出语义，含有界队列与溢出重扫。
- `autosave-reliability`：自动保存失败时的持久可见状态与非静默重试，保留 dirty 状态。
- `crash-logging`：panic hook 与结构化崩溃上下文，以及日志脱敏规则（不记录完整文档 / URL secret / 私人路径）。

### Modified Capabilities
<!-- 本变更不修改既有 spec 的对外需求，仅在新增 capability 中引入行为；如实现中确实触及 archive/active-document 的 dirty 保留语义，将以 delta 追加。 -->

## Impact

- 后端：`src-tauri/src/state.rs`、`lib.rs` 命令、`commands/settings.rs`、`fs/watcher.rs`、`logger.rs`，可能新增 `src-tauri/src/error.rs`（统一错误类型）。
- 前端：`src/main.ts`（autosave、窗口关闭、CLI 文件）、`src/components/sidebar.fileops.ts`（保存失败状态）、`src/components/contextMenu.ts` / `imageContextMenu.ts`（错误分类）、`src/lib/logger.ts`（脱敏与错误上报）。
- 依赖：watcher 有界队列可选用 `std::sync::mpsc::sync_channel` 或 `crossbeam`，不引入新 crate（优先标准库）。
- 风险面：命令返回类型可能从 `Result<_, String>` 调整为统一错误类型；前端调用点需适配错误码分类。属于重构，不应改变用户可见的常规行为，验收以“故障路径不 panic、状态持续可见”为准。
