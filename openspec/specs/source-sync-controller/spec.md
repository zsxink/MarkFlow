> DEPRECATED: This spec has been merged into [source-mode-core](../source-mode-core/spec.md).

# source-sync-controller Specification

## Purpose
定义前端 SourceSyncController 深模块的行为：使用单 in-flight 并发模型 + ChangeSet.compose + 有界队列 + 严格 flush barrier + recovery replay，替换并行 fire-and-forget 模型。

## Requirements

### Requirement: 单 in-flight patch 发送

Controller SHALL 维护最多一个 in-flight patch 请求。新 patch 在 in-flight 确认前排队等待，不并行发送。

#### Scenario: in-flight 时新更改排队

- **WHEN** 一个 patch 正在等待 ack
- **WHEN** 新编辑产生 transaction
- **THEN** transaction 进入 pending queue
- **THEN** 不发送新 patch 请求
- **WHEN** ack 到达
- **THEN** pending queue 中所有 transaction 合并为一个 patch 发送

#### Scenario: 同一 batch 内的 ChangeSet.compose

- **WHEN** 同一 animation frame 内有多个 transaction
- **THEN** Controller 使用 CodeMirror `ChangeSet.compose` 将其合成为单个 change set
- **THEN** 序列化为单个 `Utf16TextPatchDto`
- **THEN** base revision 为当前 `confirmedRevision`

### Requirement: 有界 pending queue

Controller SHALL 对 pending unacknowledged transaction 维护有界队列，数量和字节数超限时进入 backpressure 状态。

#### Scenario: backpressure 由 ack 自动唤醒

- **WHEN** pending queue 满触发 backpressure
- **THEN** 暂停新 transaction 入队
- **WHEN** ack 到达释放队列容量
- **THEN** backpressure 自动解除
- **THEN** 队列恢复处理（不需外部唤醒）

#### Scenario: retry exhaustion 进入 blocked

- **WHEN** patch 发送失败超过最大重试次数
- **THEN** Controller 进入 `blocked` 状态
- **THEN** 保留所有 pending transaction（不丢弃）
- **THEN** 返回明确错误给调用方
- **THEN** 不假装 flush 成功

### Requirement: 严格 flush barrier

`flush()` SHALL 仅在 retained batch、queue、in-flight 全为空，且 backend receipt revision 等于预期 revision 时返回成功。

#### Scenario: flush 等待所有 pending

- **WHEN** 调用 `flush()`
- **THEN** 等待当前 batch 被发送
- **THEN** 等待所有 in-flight 得到 ack
- **THEN** 等待 queue 中所有 transaction 被发送并确认
- **WHEN** backend receipt revision == 预期 revision
- **THEN** flush 返回成功

#### Scenario: flush timeout 返回错误

- **WHEN** `flush()` 在超时内未完成
- **THEN** 返回 `SAVE_FLUSH_TIMEOUT` 错误
- **THEN** 不清空 pending queue
- **THEN** 不写入磁盘
- **THEN** 调用方可决定重试或提示用户

### Requirement: resync replay 恢复

resync SHALL 使用 authoritative snapshot + transaction status + deterministic replay，而非直接覆盖本地内容。

#### Scenario: resync 携带 pending transaction IDs

- **WHEN** revision mismatch 触发 resync
- **THEN** Controller 调用 `resync_document(session_id, lastConfirmedRevision, pendingTransactionIds)`
- **THEN** 响应包含 authoritative text/revision + 每 transaction 的接收状态

#### Scenario: 删除已确认前缀，重放未确认

- **WHEN** resync 响应到达
- **THEN** 前端在 authoritative text 上删除已被 backend 接收的 transaction 前缀
- **THEN** 按原序重放未被 backend 接收的 pending transaction
- **THEN** 如果状态不连续或无法证明，进入 `blocked`
- **THEN** 展示冲突/恢复操作，不覆盖编辑器内容

### Requirement: 实例化对象而非 module globals

Controller SHALL 以实例化对象存在，而非 module 级函数，以支持多 session 隔离。

#### Scenario: multi-instance 隔离

- **WHEN** 创建两个 Controller 实例
- **THEN** 每个实例有独立的 confirmedRevision、pending queue、in-flight state
- **THEN** 实例间互不干扰
