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

### Requirement: Semantic edit command patch result
The Bridge SHALL provide semantic edit command, undo, and redo commands whose successful result includes `session_id`, `transaction_id`, `revision`, UTF-16 `patch`, UTF-16 `affected_ranges`, and UTF-16 `selection_after`. The normal command path SHALL NOT require a whole-document resync to update the editor.

#### Scenario: execute_edit_command returns patch-first result
- **WHEN** the frontend calls `execute_edit_command` with a live session, matching `base_revision`, semantic command, and transaction id
- **THEN** the Bridge applies the Core command through Core history ownership
- **THEN** the result includes the applied UTF-16 patch, affected ranges, selection_after, and new revision

#### Scenario: undo redo return patch-first result
- **WHEN** the frontend calls `undo_document` or `redo_document` for a live session
- **THEN** Core performs the history operation
- **THEN** the result includes the UTF-16 patch needed to update the editor surface and the new revision

#### Scenario: link command preserves dialog display text
- **WHEN** the frontend calls `execute_edit_command` with `InsertLink`, an empty selection, and display text
- **THEN** Core inserts a Markdown link using that display text
- **THEN** the returned patch does not contain an empty link label

#### Scenario: code fence command wraps selected text
- **WHEN** the frontend calls `execute_edit_command` with `InsertCodeFence` and a non-empty UTF-16 selection
- **THEN** Core wraps the selected text in a code fence
- **THEN** the returned patch replaces the selected range instead of inserting an empty fence at the cursor only

### Requirement: undo redo IPC is single-step
The Bridge SHALL expose `undo_document` and `redo_document` as single-step operations while `CommandResultDto` contains one patch. Requests with `max_steps` other than `1` or omitted SHALL be rejected with a stable error until the protocol supports ordered patch sequences.

#### Scenario: multi-step undo is rejected
- **WHEN** the frontend calls `undo_document` with `max_steps=2`
- **THEN** the Bridge returns a stable error
- **THEN** the session history and document text are not changed

### Requirement: Semantic command transaction idempotency
The Bridge SHALL treat `session_id + frontend_txn_id` as an idempotency key for semantic command, undo, and redo requests. A repeated request with the same fingerprint SHALL return the same result. A repeated transaction id with a different fingerprint SHALL return `TRANSACTION_CONFLICT`.

#### Scenario: repeated command returns cached result
- **WHEN** a semantic edit command succeeds
- **WHEN** the same session sends the same `frontend_txn_id` and identical request again
- **THEN** the Bridge returns the original command result without applying the command a second time

#### Scenario: conflicting command retry is rejected
- **WHEN** a semantic edit command succeeds
- **WHEN** the same session sends the same `frontend_txn_id` with a different command or revision
- **THEN** the Bridge returns `TRANSACTION_CONFLICT`

#### Scenario: stale semantic command is rejected
- **WHEN** the frontend sends a new semantic command with `base_revision` lower than the session revision
- **THEN** the Bridge returns `REVISION_MISMATCH`

#### Scenario: unknown session is rejected
- **WHEN** the frontend sends a semantic command, undo, or redo for a closed or unknown session
- **THEN** the Bridge returns `SESSION_NOT_FOUND`

### Requirement: Host Bridge context DTO

The Bridge SHALL expose or internally construct Host-bound request DTOs that include protocol version, stable request id, client id, window label, session id, document id, base revision, and Host capability. Window-related results SHALL validate `client_id + window_label`; document-related results SHALL validate `session_id + base_revision + request_id`.

#### Scenario: Host-bound export validates request identity

- **WHEN** the frontend initiates an export for a focused document
- **THEN** the Bridge flushes the target session and captures confirmed revision
- **THEN** the Host-bound request carries `request_id`, `client_id`, `window_label`, `session_id`, `document_id`, and `base_revision`
- **THEN** the result is applied only if the same identity still matches the initiating window/session

#### Scenario: Host-bound result mismatch is rejected

- **WHEN** a Host result returns with a mismatched `request_id`, `window_label`, `session_id`, or `base_revision`
- **THEN** the Bridge rejects the result with a stable mismatch or stale error
- **THEN** UI state and Core revision are not updated from that result

### Requirement: Host error code mapping

The Bridge SHALL map Host stable error codes to frontend-visible errors without collapsing capability, permission, cancellation, timeout, stale session, stale revision, and unsupported format into a generic internal error.

#### Scenario: Permission error remains user-visible

- **WHEN** Host returns `HOST_PERMISSION_DENIED` or `EXPORT_HOST_PERMISSION_DENIED`
- **THEN** the Bridge returns a frontend-visible permission error code
- **THEN** UI does not treat the operation as a silent fallback success

#### Scenario: Stale export revision remains distinct

- **WHEN** Host or Runtime detects an export request for an unavailable or stale revision
- **THEN** the Bridge returns `EXPORT_STALE_REVISION`
- **THEN** UI may offer an explicit retry after refreshing session state

### Requirement: Host protocol compatibility tests

The Bridge SHALL include compatibility tests for Host protocol versioning, request id serialization, client/window/session/revision fields, capability negotiation payloads, and stable Host/export error codes.

#### Scenario: Older Host protocol is rejected predictably

- **WHEN** a test sends a Host-bound request with an unsupported protocol version
- **THEN** the Bridge or Host contract returns `HOST_PROTOCOL_VERSION_UNSUPPORTED`

#### Scenario: Error code serialization roundtrips

- **WHEN** stable Host/export error codes are serialized and deserialized
- **THEN** the resulting values match the registry exactly

### Requirement: Tauri command argument naming is explicit
Every direct Tauri Core Bridge command argument SHALL use camelCase on the wire to match the Tauri dispatcher default. Versioned envelope and nested Serde DTO casing SHALL be declared explicitly in their schema and MUST NOT inherit an accidental command-level convention. Frontend payloads, generated command handlers, request identity, revision fields, and optional values MUST follow this rule.

#### Scenario: Real invoke deserializes every command
- **WHEN** the contract suite invokes each registered Core Bridge command through the real Tauri invoke dispatcher
- **THEN** valid arguments reach the command handler
- **THEN** missing or mis-cased fields fail the contract suite before product E2E
- **THEN** snake_case direct arguments fail unless a reviewed command explicitly declares a compatibility alias

### Requirement: Render IR v2 command lifecycle
The Bridge SHALL provide versioned Render IR v2 requests with session, document, confirmed revision, viewport, schema support, request identity, and cancellation identity. The response SHALL echo routing identity and source hash.

#### Scenario: New revision cancels obsolete render
- **WHEN** a newer confirmed revision or viewport request supersedes an in-flight render
- **THEN** Runtime cancels or marks the old request obsolete
- **THEN** the frontend cannot apply the obsolete response

### Requirement: Confirmed revision notifications drive projection
An accepted patch or resync SHALL produce a confirmed revision event that the active Editor Adapter can consume without waiting for a new user input or viewport event.

#### Scenario: Patch acknowledgment invalidates projection
- **WHEN** Core acknowledges a patch at revision N
- **THEN** the adapter receives a revision-confirmed effect for N
- **THEN** stale projection is mapped or cleared and a matching render request is scheduled

### Requirement: Bridge degradation uses stable errors
Render, command, History, widget, and mode-transition failures SHALL use stable error codes and include session, revision, request, capability, and retry classification where available.

#### Scenario: Render argument mismatch
- **WHEN** render command arguments cannot be deserialized
- **THEN** the error is logged with command and request identity
- **THEN** WYSIWYG enters degraded state instead of silently displaying source
