# core-bridge-protocol Specification

## Purpose
定义前端与 Runtime/Core 之间的 Bridge protocol、命令集合、稳定 DTO 和错误码映射，确保 Core-backed Source Mode 的同步、保存和恢复路径可测试可演进。
## Requirements
### Requirement: apply_text_patch versioned Envelope

`apply_text_patch` SHALL 使用 `ProtocolEnvelope<Utf16TextPatchDto>` 封装，包含 `protocol_version`、`session_id` 和 `payload`。版本不匹配时必须返回 `PROTOCOL_VERSION_UNSUPPORTED`，session 缺失时必须返回稳定错误。

#### Scenario: apply_text_patch 请求包含版本号

- **WHEN** 前端调用 `apply_text_patch`
- **THEN** 请求包含 `protocol_version` 字段
- **THEN** 版本不匹配时返回 `PROTOCOL_VERSION_UNSUPPORTED`

### Requirement: 非 patch 命令保持稳定 DTO 兼容

`open_document`、`save_document`、`resync_document`、`flush_document`、`get_document_text`、`get_outline`、`get_document_stats`、`reload_document`、`close_document` SHALL 保持当前稳定 DTO 兼容，直到后续阶段通过 ADR 和协议兼容测试迁移到统一 Envelope。文档相关命令必须显式携带 `session_id` 或返回 `sessionId`；不得通过 `activeFilePath` 或当前窗口隐式推断文档。

#### Scenario: 当前非 patch 命令不要求 Envelope

- **WHEN** 前端调用 `save_document(session_id)`、`resync_document(session_id, confirmed_revision)` 或 `flush_document(session_id)`
- **THEN** 请求使用当前稳定 DTO 参数
- **THEN** Runtime 按传入 session 定位文档，不读取全局 active file path

#### Scenario: 响应包含 error_code

- **WHEN** 任何 Bridge 命令返回错误
- **THEN** 响应错误包含 `error_code`（字符串枚举值）
- **THEN** `error_detail` 包含人类可读的描述
- **THEN** 前端可通过 `error_code` 做精确的恢复决策

#### Scenario: 窗口相关请求包含 window_label

- **WHEN** 前端调用窗口、对话框、通知或关闭流程相关 Bridge 命令
- **THEN** 请求包含发起窗口的 `window_label`
- **THEN** Runtime/Host 只把结果投递回匹配窗口

### Requirement: open_document 命令

系统 SHALL 提供 `open_document` 命令，接收文件路径，返回 `DocumentOpened`（含 sessionId、documentId、revision、text、outline、stats、fileIdentity、sizeClass、capabilities）。

#### Scenario: open_document 返回完整的文档信息

- **WHEN** `open_document(path)` 调用
- **THEN** 返回的数据包含 sessionId、documentId、初始 revision（>=0）、文档文本、outline、stats、sizeClass、fileIdentity、capabilities

### Requirement: apply_text_patch 命令

系统 SHALL 提供 `apply_text_patch` 命令，接收 Utf16TextPatchDto，返回 ApplyPatchAck。

#### Scenario: apply_text_patch 正常应用

- **WHEN** 在正确的 baseRevision 上发送有效的 patch
- **THEN** 返回 `ApplyPatchAck`（含 transactionId、new revision、affectedRanges）

#### Scenario: apply_text_patch stale revision 返回 REVISION_MISMATCH

- **WHEN** `baseRevision` 不等于当前 session revision
- **THEN** 返回 `REVISION_MISMATCH` 错误
- **THEN** session 内容不变

#### Scenario: apply_text_patch invalid range 返回 INVALID_RANGE

- **WHEN** patch 的 range 超出文档范围或拆分 UTF-16 surrogate pair
- **THEN** 返回 `INVALID_RANGE` 或 `INVALID_UTF16_BOUNDARY` 错误
- **THEN** session 内容不变

### Requirement: save_document 命令

系统 SHALL 提供 `save_document` 命令，返回 `SaveResult`。

#### Scenario: save_document 成功返回

- **WHEN** `save_document(session_id)` 成功
- **THEN** 返回 `SaveResult(revision, fileIdentity)`
- **THEN** 磁盘文件已更新

#### Scenario: save_document conflict 返回 CONFLICT

- **WHEN** 保存时 FileIdentity 不匹配
- **THEN** 返回 `CONFLICT` 错误
- **THEN** 不写入磁盘

#### Scenario: save_document save_in_progress 返回 SAVE_IN_PROGRESS

- **WHEN** 同一 session 的保存操作正在进行
- **THEN** 返回 `SAVE_IN_PROGRESS` 错误
- **THEN** 调用方可等待后重试

### Requirement: resync_document 命令

系统 SHALL 提供 `resync_document` 命令，在 revision mismatch 或 IPC 超时后恢复 Adapter 与 Core 的同步状态。请求携带 `last_confirmed_revision` 和 `pending_transaction_ids`。

#### Scenario: resync_document 返回 snapshot + 接收状态

- **WHEN** `resync_document(session_id, last_confirmed_revision, pending_transaction_ids)` 调用
- **THEN** 返回 Core confirmed snapshot 文本和当前 revision
- **THEN** 返回每个 pending_transaction_id 的接收状态（confirmed/unknown）
- **THEN** Adapter 可基于此重建 optimistic mirror 并重放未确认 transaction

### Requirement: flush_document 命令

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

### Requirement: 异步命令 + spawn_blocking

open/save/reload 命令 SHALL 使用 async Tauri command，阻塞 IO 放入 `spawn_blocking`。常规 patch 保留同步以降低延迟。

#### Scenario: open 大文件不阻塞 UI

- **WHEN** 打开 50 MiB 文件
- **THEN** 命令通过 async channel 执行
- **THEN** 文件读取 IO 在 `spawn_blocking` 线程池中执行
- **THEN** UI 线程不被阻塞

### Requirement: 其他命令

系统 SHALL 提供 `get_document_text`、`get_outline`、`get_document_stats`、`reload_document`、`close_document` 命令。

#### Scenario: close_document 后 session 不可访问

- **WHEN** `close_document(session_id)` 调用
- **THEN** session 从 registry 移除
- **THEN** 后续对同一 session 的操作返回 `SESSION_NOT_FOUND`

### Requirement: 错误码映射

Bridge SHALL 将所有 Core/Runtime 错误映射为稳定的错误码，错误码与 Core/Runtime 枚举 1:1。

#### Scenario: 错误码枚举包含完整集合

- **WHEN** 任何错误发生
- **THEN** 返回的错误码来自以下完整集合：`REVISION_MISMATCH`, `INVALID_RANGE`, `INVALID_UTF16_BOUNDARY`, `TRANSACTION_CONFLICT`, `UNSUPPORTED_ENCODING`, `PENDING_QUEUE_FULL`, `SAVE_FLUSH_TIMEOUT`, `CONFLICT`, `CANCELLED`, `SESSION_NOT_FOUND`, `PROTOCOL_VERSION_UNSUPPORTED`, `SAVE_IN_PROGRESS`, `RELOAD_DIRTY`

### Requirement: resync_document validates confirmed_revision

The `resync_document` RPC SHALL use the `confirmed_revision` parameter sent by the frontend to verify staleness. If the confirmed revision is outdated relative to the session's current revision, the backend SHALL reject the resync.

#### Scenario: stale resync rejected

- **WHEN** the frontend sends a resync with a `confirmed_revision` lower than the current session revision
- **THEN** the backend SHALL reject the request and signal the frontend to re-sync from the current state

