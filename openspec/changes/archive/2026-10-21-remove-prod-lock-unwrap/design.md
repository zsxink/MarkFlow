# Design

## Context

`crate::error::lock_mutex` 已存在并被 `state.rs`、`lib.rs`、`commands/settings.rs` 使用：它把 `PoisonError` 转为 `warn` 日志并 `into_inner()`，因此正常路径与中毒路径都会返回 `Ok(guard)`。两个待迁移点都是全局/长生命周期 mutex：

- `fs/ignore.rs`：`OnceLock<Mutex<IgnoreMatcher>>`，`matcher_snapshot` 用参数生成新 matcher 并写回；无效参数时返回旧值。
- `fs/watcher.rs`：`Arc<Mutex<Option<PathBuf>>>` 共享给 notify 生产者回调与消费线程，分别用于累积和取出溢出后的最小恢复范围。

关键约束：锁助手不暴露「本次是否发生过中毒」，而这两个场景在中毒时需要选择与正常路径不同的 fail-safe 行为。为此新增 infallible 变体 `lock_mutex_infallible`，并把中毒状态的采样移到取得 guard 之后。

## Goals / Non-Goals

**Goals:**
- 生产路径锁获取不再 panic。
- 忽略规则更新在中毒时安全恢复（清除毒标记），并沿用既有 patterns 语义：有效则应用新规则，无效则保留上一次有效 snapshot。
- watcher 溢出恢复在中毒时退化为根路径 `rescan`，复用既有恢复与去重路径。
- 中毒场景可被单元测试覆盖，且测试不污染全局静态状态。

**Non-Goals:**
- 不改变 `lock_mutex` 的现有签名与 19 个既有调用点。
- 不引入新的锁类型或重试/超时机制。
- 不改变 watcher 事件管线、队列容量、合并窗口或前端协议。

## Decisions

### D1: 以 `Mutex::is_poisoned()` 区分恢复路径，而非修改 `lock_mutex`

新增 infallible 变体 `crate::error::lock_mutex_infallible(&Mutex<T>) -> MutexGuard<'_, T>`：中毒时同样记录 `warn` 并 `into_inner()` 恢复，但直接返回 guard，不会失败。`lock_mutex` 改为委托给它，签名与行为（`Result<MutexGuard, AppError>`，永不 `Err`）保持不变，既有 19 个调用点不受影响。

中毒状态在**取得 guard 之后**再采样：先 `lock_mutex_infallible` 拿 guard，再 `is_poisoned()` 判断，最后 `clear_poison()` 复位状态。

- 理由：保持 `lock_mutex` 契约（永不因中毒失败）不变，避免影响既有调用点；`is_poisoned` 是标准库 API，无新依赖。
- 已考虑的替代：新增 `lock_mutex_recovering() -> (Guard, bool)`。可行，但为两个调用点新增公共 API 收益不足；`is_poisoned` 与 `clear_poison` 已足够表达意图。
- 竞争说明：中毒标记在被 `clear_poison()` 之前一直为真，因此在加锁前中毒的情形依然会在取得 guard 后被检测到，不会漏掉降级路径；加锁之后才发生的中毒无法在此观察到，但那时本线程已持有 guard，锁本身仍被安全恢复，不会 panic。

### D2: `ignore.rs` 抽出 `update_snapshot(&Mutex<IgnoreMatcher>, patterns)`

`matcher_snapshot` 只负责取得 `OnceLock` 中的 mutex 并委托给 `update_snapshot`。`update_snapshot` 通过 `lock_mutex_infallible` 获取 guard（获取必然成功，无失败分支）：

- 有效 patterns：写入并返回新 matcher。
- 无效 patterns：返回当前 snapshot 的克隆。
- 中毒：取得 guard 后检测到中毒标记，记录 `warn`、`clear_poison()`，然后沿用既有 patterns 语义——有效 patterns 应用新规则，无效 patterns 才保留上一次有效 snapshot。

抽出后可用局部 `Mutex` 构造中毒场景做测试，无需污染 `OnceLock` 全局状态。

### D3: `watcher.rs` 抽出 `acquire_recovery_scope(&Mutex<Option<PathBuf>>)`

- 正常：返回 `Some(guard)`，调用方自行 `merge` 或 `take`。
- 中毒：通过 `lock_mutex_infallible` 取回 guard（获取必然成功），在取得 guard 后检测到中毒标记则将值清为 `None` 并 `clear_poison()`，返回 `None`。
- 生产者回调：`acquire` 返回 `None` 时跳过范围合并，但仍设置溢出标志。
- 消费端：`acquire` 后 `take()`；为 `None`（中毒或本就为空）时 `unwrap_or_else(|| watch_path.clone())`，即根路径 `rescan`，复用现有 `reason: "queue-overflow"` 路径与前端去重。

清空并复位中毒状态保证下一次溢出可以从干净状态重新累积范围，不永久禁用范围优化。

### D4: 测试覆盖中毒场景

- `ignore.rs`：局部 `Mutex<IgnoreMatcher>` 持锁 panic 造毒，断言随后 `update_snapshot` 不 panic、返回旧 matcher；再断言有效 patterns 在中毒后仍能更新。
- `error.rs`：已有 `lock_mutex_recovers_poisoned_state` 覆盖 helper 本体；新增 `lock_mutex_infallible_recovers_poisoned_state_without_panicking` 覆盖 infallible 变体。
- `watcher.rs`：局部 `Mutex<Option<PathBuf>>` 造毒，断言 `acquire_recovery_scope` 返回 `None`、内部值被清空且中毒标记被复位；未中毒时返回可 `take` 的 guard。

## Risks / Trade-offs

- **中毒后丢失累积的恢复范围** → 退化为根路径 `rescan`，由既有去重与最小重扫逻辑兜底；根重扫是正确性优先的保守选择。
- **中毒状态采样与加锁的时序** → 中毒标记在 `clear_poison()` 前一直为真，故在取得 guard 后采样不会漏掉「加锁前中毒」的情形；加锁后中毒无法观察但也无须观察（guard 已持有，锁被安全恢复）。
- **`clear_poison()` 掩盖了历史 panic** → panic 本身已由 `warn` 日志记录，且该 mutex 仅承载可重建状态，接受此权衡。
- **全局 snapshot 测试相互影响** → 通过抽出 `update_snapshot` 使用局部 mutex 测试，避免污染 `OnceLock`。

## Migration Plan

单次提交即可：改动仅限两个文件及其测试，无数据迁移、无配置变更、无前端协议变更。回滚即还原这两处锁获取方式。
