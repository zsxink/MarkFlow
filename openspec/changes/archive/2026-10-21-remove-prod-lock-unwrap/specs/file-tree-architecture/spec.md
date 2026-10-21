# Spec Delta

## ADDED Requirements

### Requirement: 忽略规则与 watcher 恢复的锁中毒容错
忽略匹配器与 watcher 恢复范围所共享的锁 SHALL 在中毒时被安全恢复，不得使文件树过滤或 watcher 线程崩溃。这两个锁点 SHALL 通过统一锁助手（`crate::error::lock_mutex` 或其 infallible 变体 `crate::error::lock_mutex_infallible`）获取锁，并在取得 guard 之后检测中毒状态。恢复后 MUST 保持既有的 fail-safe 语义：忽略规则在本次 patterns 有效时应用新规则、无效时保留上一次有效 snapshot；无法确定恢复范围时退化为根路径重扫。

#### Scenario: 忽略规则更新遇到中毒锁
- **WHEN** 应用新的忽略模式时 snapshot 锁处于中毒状态
- **THEN** 系统在取得 guard 后检测到中毒标记，记录 `warn` 日志、清除中毒标记并恢复内部 snapshot
- **THEN** 本次 patterns 有效时应用并返回新的规则集
- **THEN** 本次 patterns 无效时继续使用上一次有效 snapshot
- **THEN** 本次更新不 panic，也不产生部分更新的规则集

#### Scenario: 队列溢出期间锁中毒
- **WHEN** watcher 队列溢出且恢复范围锁处于中毒状态
- **THEN** 系统在取得 guard 后检测到中毒标记，仍记录一次溢出并为根路径安排去重的 `rescan`
- **THEN** 该 `rescan` 与其他恢复请求按既有去重规则合并
