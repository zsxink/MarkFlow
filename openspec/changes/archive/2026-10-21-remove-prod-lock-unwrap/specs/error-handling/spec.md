# Spec Delta

## ADDED Requirements

### Requirement: 生产路径锁获取不得 panic
后端 SHALL NOT 在 `src-tauri/src` 的生产路径上使用会因中毒而 panic 的锁获取方式（例如 `lock().unwrap()` / `lock().expect(...)`）。凡保护可恢复状态、且中毒后必须继续服务的锁点，SHALL 通过统一锁助手（`crate::error::lock_mutex` 或其 infallible 变体 `crate::error::lock_mutex_infallible`）获取锁；中毒时助手 MUST 记录 `warn` 级结构化日志并通过 `into_inner()` 恢复内部值。仅用于主动制造中毒场景的测试代码 MAY 直接调用 `lock().unwrap()`。不 panic 但静默吞掉中毒的一次性尽力型获取为允许的例外，但 MUST NOT 用于保护必须恢复的共享状态。

#### Scenario: 生产路径扫描无裸 unwrap
- **WHEN** 对 `src-tauri/src`（排除 `#[cfg(test)]` 模块）执行 `lock().unwrap()` 扫描
- **THEN** 结果为空，所有锁点均经由统一助手获取

#### Scenario: 中毒锁在文件树过滤路径上恢复
- **WHEN** 忽略匹配器 snapshot 的锁因前持有者 panic 而中毒
- **THEN** 后续调用在取得 guard 后检测到中毒标记，记录 `warn` 日志、清除中毒标记并恢复内部 snapshot，不 panic 调用线程
- **THEN** 恢复后若本次 patterns 有效，则应用并返回新的匹配器 snapshot
- **THEN** 恢复后若本次 patterns 无效，则保留并返回上一次有效的匹配器 snapshot
- **THEN** 文件树读取与事件过滤继续按恢复后的有效规则工作

#### Scenario: 中毒锁在 watcher 溢出恢复路径上降级
- **WHEN** watcher 的恢复范围锁因前持有者 panic 而中毒
- **THEN** 生产者在取得 guard 后检测到中毒标记，跳过该次范围合并，仍标记溢出
- **THEN** 消费端读取恢复范围时退化为根路径 `rescan`，不 panic watcher 线程
- **THEN** 文件树通过该受控重扫恢复一致状态
