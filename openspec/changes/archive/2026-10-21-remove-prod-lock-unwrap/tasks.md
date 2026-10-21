# Tasks

## 1. 统一锁助手

- [x] 1.1 在 `src-tauri/src/error.rs` 新增 `pub fn lock_mutex_infallible<T>(&Mutex<T>) -> MutexGuard<'_, T>`：中毒时记录 `warn`（target: `backend.lock`）并 `into_inner()` 恢复，永不失败
- [x] 1.2 将 `lock_mutex` 改为委托 `lock_mutex_infallible`，保持签名 `Result<MutexGuard, AppError>` 与「永不返回 `Err`」的既有行为，19 个既有调用点不受影响
- [x] 1.3 在 `error.rs` 测试模块新增 `lock_mutex_infallible_recovers_poisoned_state_without_panicking`：造毒后断言返回内部值且不 panic；保留既有 `lock_mutex_recovers_poisoned_state`

## 2. 忽略匹配器锁中毒容错

- [x] 2.1 在 `src-tauri/src/fs/ignore.rs` 引入 `crate::error::lock_mutex_infallible`，把 `matcher_snapshot` 的锁获取改为 `lock_mutex_infallible`
- [x] 2.2 抽出 `update_snapshot(&Mutex<IgnoreMatcher>, &[String]) -> IgnoreMatcher`：有效 patterns 写入并返回新 matcher，无效 patterns 返回旧值；锁获取直写成无失败分支的形式，不留死代码
- [x] 2.3 在**取得 guard 之后**用 `Mutex::is_poisoned()` 采样中毒状态，命中时记录结构化 `warn` 日志（target: `backend.lock`）并 `clear_poison()`
- [x] 2.4 在 `ignore.rs` 测试模块新增中毒场景测试：造毒后调用不 panic、返回旧 matcher、有效 patterns 仍可更新

## 3. Watcher 恢复范围锁中毒降级

- [x] 3.1 在 `src-tauri/src/fs/watcher.rs` 引入 `crate::error::lock_mutex_infallible`
- [x] 3.2 抽出 `acquire_recovery_scope(&Mutex<Option<PathBuf>>) -> Option<MutexGuard<Option<PathBuf>>>`：先取得 guard（无条件、无 `.ok()?`），再检测中毒标记；中毒时清空值、`clear_poison()` 并返回 `None`
- [x] 3.3 生产者回调改用 `acquire_recovery_scope`；返回 `None` 时跳过范围合并，但仍设置溢出标志
- [x] 3.4 消费端溢出恢复改用 `acquire_recovery_scope`；取不到范围时退化为根路径 `rescan`，复用既有 `queue-overflow` 恢复与去重路径
- [x] 3.5 在 `watcher.rs` 测试模块新增中毒场景测试：`acquire_recovery_scope` 在中毒时返回 `None`、内部值清空、毒标记复位；未中毒时返回可 `take` 的 guard

## 4. 验证

- [x] 4.1 `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
- [x] 4.2 `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- [x] 4.3 `cargo test --manifest-path src-tauri/Cargo.toml`
- [x] 4.4 grep 确认 `src-tauri/src` 生产路径（排除 `#[cfg(test)]` 模块）不再出现 `lock().unwrap()` / `lock().expect(`；`error.rs` 测试内主动造毒的调用保留
- [x] 4.5 `npm run validate:openspec`
