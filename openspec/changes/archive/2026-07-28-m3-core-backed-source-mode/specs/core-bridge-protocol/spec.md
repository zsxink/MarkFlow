## ADDED Requirements

### Requirement: 统一的 ProtocolEnvelope

所有 Bridge 命令 SHALL 使用统一的 `ProtocolEnvelope` 封装，包含 protocol_version、request_id、client_id、session_id 和 payload。

#### Scenario: 请求包含版本号

- **WHEN** 前端调用任何 Core Bridge 命令
- **THEN** 请求包含 `protocol_version` 字段
- **THEN** 版本不匹配时返回 `PROTOCOL_VERSION_UNSUPPORTED`

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

### Requirement: resync_document 命令

系统 SHALL 提供 `resync_document` 命令，在 revision mismatch 或 IPC 超时后恢复 Adapter 与 Core 的同步状态。

#### Scenario: resync_document 返回 confirmed snapshot

- **WHEN** `resync_document(session_id, last_confirmed_revision)` 调用
- **THEN** 返回 Core confirmed snapshot 文本和当前 revision
- **THEN** Adapter 可基于此重建 optimistic mirror

### Requirement: flush_document 命令

系统 SHALL 提供 `flush_document` 命令，等待所有 pending patch 确认后返回。

#### Scenario: flush_document 成功

- **WHEN** 所有 pending patch 在超时前得到确认
- **THEN** `flush_document` 返回成功
- **THEN** confirmedRevision 为最新的 flush 后 revision

### Requirement: 其他命令

系统 SHALL 提供 `get_document_text`、`get_outline`、`get_document_stats`、`reload_document`、`close_document` 命令。

#### Scenario: close_document 后 session 不可访问

- **WHEN** `close_document(session_id)` 调用
- **THEN** session 从 registry 移除
- **THEN** 后续对同一 session 的操作返回 `SESSION_NOT_FOUND`

### Requirement: 错误码映射

Bridge SHALL 将所有 Core/Runtime 错误映射为稳定的错误码。

#### Scenario: 错误码枚举包含

- **WHEN** 任何错误发生
- **THEN** 返回的错误码来自以下集合：`REVISION_MISMATCH`, `INVALID_RANGE`, `INVALID_UTF16_BOUNDARY`, `TRANSACTION_CONFLICT`, `UNSUPPORTED_ENCODING`, `PENDING_QUEUE_FULL`, `SAVE_FLUSH_TIMEOUT`, `CONFLICT`, `CANCELLED`, `SESSION_NOT_FOUND`, `PROTOCOL_VERSION_UNSUPPORTED`