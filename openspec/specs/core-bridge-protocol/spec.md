# core-bridge-protocol Specification

## Purpose
定义前端与 Runtime/Core 之间的 Bridge protocol、命令集合、稳定 DTO 和错误码映射，确保 Core-backed Source Mode 的同步、保存和恢复路径可测试可演进。
## Requirements
### Requirement: apply_text_patch versioned Envelope

`apply_text_patch` SHALL use `ProtocolEnvelope<Utf16TextPatchDto>` with `protocol_version`, `session_id`, and `payload`. Other Core Bridge commands remain on their current stable DTO arguments until a later ADR-backed protocol migration implements full-command envelopes and compatibility tests.

#### Scenario: apply_text_patch request contains protocol version

- **WHEN** the frontend calls `apply_text_patch`
- **THEN** the request contains `protocol_version`
- **THEN** an unsupported version returns `PROTOCOL_VERSION_UNSUPPORTED`

### Requirement: 非 patch 命令保持稳定 DTO 兼容

`open_document`、`save_document`、`resync_document`、`flush_document`、`get_document_text`、`get_outline`、`get_document_stats`、`reload_document`、`close_document` SHALL keep their current stable DTO arguments until a later ADR-backed protocol migration. Document commands must carry or return explicit session identity and must not infer the target document from `activeFilePath`.

#### Scenario: save/resync/flush use current stable DTOs

- **WHEN** the frontend calls `save_document(session_id)`、`resync_document(session_id, confirmed_revision)` or `flush_document(session_id)`
- **THEN** the Runtime targets the provided session
- **THEN** the command does not require `ProtocolEnvelope` in the current implementation

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

### Requirement: get_render_blocks command
The Bridge SHALL provide a `get_render_blocks` command for Core-backed WYSIWYG. The request SHALL include `session_id`, `revision`, `viewport`, and `request_id`. The response SHALL include Render IR tagged with the same `session_id`, `revision`, `request_id`, document identity, viewport, blocks, inline spans, and UTF-16 ranges. The command SHALL reject missing sessions and stale revisions with stable Bridge errors.

#### Scenario: get_render_blocks returns matching Render IR
- **WHEN** the frontend requests render blocks for a live session revision and viewport
- **THEN** Runtime generates Render IR from that session's confirmed snapshot
- **THEN** the response carries the same `session_id`, `revision`, `request_id`, and viewport

#### Scenario: stale revision is rejected
- **WHEN** the frontend requests render blocks for a revision lower than the session current revision
- **THEN** the command returns a `REVISION_MISMATCH` error
- **THEN** no render blocks for the stale revision are applied

#### Scenario: closed session is rejected
- **WHEN** the frontend requests render blocks for a closed or unknown session
- **THEN** the command returns `SESSION_NOT_FOUND`
- **THEN** the frontend keeps editable source fallback state

