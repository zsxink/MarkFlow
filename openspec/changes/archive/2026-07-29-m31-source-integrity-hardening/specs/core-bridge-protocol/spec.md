# core-bridge-protocol Specification (Delta for M3.1)

## ADDED Requirements

### Requirement: 全命令 versioned Envelope

所有 Bridge 命令（不仅仅是 patch）SHALL 使用统一的 `ProtocolEnvelope` 封装，包含 `protocol_version`、`request_id`、`client_id`、`window_label`、`session_id` 和 `payload`。

#### Scenario: 所有命令含 Envelope

- **WHEN** 前端调用 `save_document`、`resync_document`、`flush_document`、`reload_document`、`close_document` 等命令
- **THEN** 请求包含 `protocol_version` 字段
- **THEN** 版本不匹配时返回 `PROTOCOL_VERSION_UNSUPPORTED`

### Requirement: 异步命令 + spawn_blocking

open/save/reload 命令 SHALL 使用 async Tauri command，阻塞 IO 放入 `spawn_blocking`。常规 patch 保留同步以降低延迟。

#### Scenario: open 大文件不阻塞 UI

- **WHEN** 打开 50MB 文件
- **THEN** 命令通过 async channel 执行
- **THEN** 文件读取 IO 在 `spawn_blocking` 线程池中执行
- **THEN** UI 线程不被阻塞

## MODIFIED Requirements

### Requirement: 统一的 ProtocolEnvelope（修改）

所有 Bridge 命令 SHALL 使用统一的 `ProtocolEnvelope` 封装，包含 `protocol_version`、`request_id`、`client_id`、`window_label`、`session_id` 和 `payload`。返回的响应同样使用统一 Envelope，包含 `success`、`error_code`、`error_detail` 字段。

#### Scenario: 响应包含 error_code（修改 — 增加 error_code 字段）

- **WHEN** 任何 Bridge 命令返回错误
- **THEN** 响应 Envelope 包含 `error_code`（字符串枚举值）
- **THEN** `error_detail` 包含人类可读的描述
- **THEN** 前端可通过 `error_code` 做精确的恢复决策

### Requirement: 错误码映射（修改 — 完整映射）

Bridge SHALL 将所有 Core/Runtime 错误映射为稳定的错误码，错误码与 Core/Runtime 枚举 1:1。

#### Scenario: 错误码枚举包含（增强）

- **WHEN** 任何错误发生
- **THEN** 返回的错误码来自以下完整集合：`REVISION_MISMATCH`, `INVALID_RANGE`, `INVALID_UTF16_BOUNDARY`, `TRANSACTION_CONFLICT`, `UNSUPPORTED_ENCODING`, `PENDING_QUEUE_FULL`, `SAVE_FLUSH_TIMEOUT`（新增）, `CONFLICT`, `CANCELLED`, `SESSION_NOT_FOUND`, `PROTOCOL_VERSION_UNSUPPORTED`, `SAVE_IN_PROGRESS`（新增）, `RELOAD_DIRTY`（新增）

### Requirement: flush_document 命令（修改 — 需后端 barrier）

系统 SHALL 提供 `flush_document` 命令，等待所有 pending patch 确认后返回。实现 SHALL 包含超时机制。

#### Scenario: flush_document 成功

- **WHEN** 所有 pending patch 在超时前得到确认
- **THEN** `flush_document` 返回成功
- **THEN** confirmedRevision 为最新的 flush 后 revision

#### Scenario: flush_document 超时返回 SAVE_FLUSH_TIMEOUT

- **WHEN** 超过超时时间仍有 pending patch
- **THEN** `flush_document` 返回 `SAVE_FLUSH_TIMEOUT`
- **THEN** session 内容不受影响
- **THEN** 调用方可重试

### Requirement: resync_document 命令（修改 — 增加 transaction IDs）

系统 SHALL 提供 `resync_document` 命令，在 revision mismatch 或 IPC 超时后恢复 Adapter 与 Core 的同步状态。请求携带 `last_confirmed_revision` 和 `pending_transaction_ids`。

#### Scenario: resync_document 返回 snapshot + 接收状态

- **WHEN** `resync_document(session_id, last_confirmed_revision, pending_transaction_ids)` 调用
- **THEN** 返回 Core confirmed snapshot 文本和当前 revision
- **THEN** 返回每个 pending_transaction_id 的接收状态（confirmed/unknown）
- **THEN** Adapter 可基于此重建 optimistic mirror 并重放未确认 transaction

### Requirement: save_document 命令（修改 — 错误码细化）

系统 SHALL 提供 `save_document` 命令，返回 `SaveResult`。

#### Scenario: save_document conflict 返回 CONFLICT（未改动）

- **WHEN** 保存时 FileIdentity 不匹配
- **THEN** 返回 `CONFLICT` 错误
- **THEN** 不写入磁盘

#### Scenario: save_document save_in_progress 返回 SAVE_IN_PROGRESS

- **WHEN** 同一 session 的保存操作正在进行
- **THEN** 返回 `SAVE_IN_PROGRESS` 错误
- **THEN** 调用方可等待后重试
