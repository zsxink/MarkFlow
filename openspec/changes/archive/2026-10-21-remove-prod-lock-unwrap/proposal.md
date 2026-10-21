# Proposal

## Why

生产路径仍有两处 `Mutex::lock().unwrap()`：`src-tauri/src/fs/ignore.rs:42`（`matcher_snapshot` 的全局 `OnceLock<Mutex<IgnoreMatcher>>`）与 `src-tauri/src/fs/watcher.rs:209`/`:263`（watcher 生产者回调与 worker 的 `producer_recovery_scope`）。一旦持锁线程 panic 导致 mutex 中毒，这些位置会在同一路径上二次 panic，使文件树过滤或 watcher 线程直接崩溃。项目已提供 `crate::error::lock_mutex`（poisoned 时 `warn` 并 `into_inner()` 恢复），但这两处尚未迁移。

## What Changes

- `error.rs`：新增 infallible 变体 `crate::error::lock_mutex_infallible`（中毒时 `warn` 并 `into_inner()` 恢复，直接返回 guard，永不失败）；`lock_mutex` 改为委托给它，签名与既有调用点行为不变。
- `fs/ignore.rs`：`matcher_snapshot` 改用 `crate::error::lock_mutex_infallible`；取得 guard 后检测中毒标记，记录结构化警告、清除毒标记并恢复内部 snapshot，随后沿用既有 patterns 语义（有效则应用新规则，无效则保留上次有效值，fail-safe）。
- `fs/watcher.rs`：生产者溢出回调与 worker 溢出恢复改用 `lock_mutex_infallible`；取得 guard 后检测中毒标记，中毒时跳过 scope 合并/读取，退化为根路径 `rescan`，复用现有「无法确定范围则退化为根恢复」逻辑。
- 为 poisoned 场景补充 Rust 单元测试（含 `lock_mutex_infallible` 的独立测试）。
- 清理 `src-tauri/src` 生产路径中残留的 `lock().unwrap()`（`error.rs` 测试内用于主动造毒，保留）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `error-handling`: 新增「生产路径锁获取不得 panic」要求，明确生产路径 SHALL NOT 使用会 panic 的锁获取方式，保护可恢复状态的锁点 SHALL 使用统一 helper（`lock_mutex` 或 infallible 变体 `lock_mutex_infallible`），并规定 ignore/watcher 在中毒时的降级语义。
- `file-tree-architecture`: 补充 watcher 与忽略匹配器在锁中毒时的恢复行为——忽略规则恢复后按 patterns 有效性应用或保留，并将恢复范围退化为根路径重扫。

## Impact

- 代码：`src-tauri/src/error.rs`、`src-tauri/src/fs/ignore.rs`、`src-tauri/src/fs/watcher.rs`（及其测试模块）。
- 依赖：复用现有 `crate::error` 模块，新增函数而不引入新依赖。
- 行为：仅在 mutex 中毒这一异常路径上改变行为（从 panic 变为受控降级），正常路径与 API 不变。
