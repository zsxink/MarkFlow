# core-bridge-protocol Specification (Delta)

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: 全命令 versioned Envelope

**Reason**: 当前实现只有 `apply_text_patch` 使用 `ProtocolEnvelope`；把所有 Bridge 命令写成当前 requirement 会夸大 M3/M3.1 的协议落地状态。
**Migration**: 后续全命令 Envelope 需要独立 ADR、兼容策略和协议测试，不能作为本次主规范事实。

### Requirement: 统一的 ProtocolEnvelope

**Reason**: 当前非 patch 命令仍使用稳定 DTO 参数。统一 request/response Envelope 是后续协议演进，不是当前 source-of-truth。
**Migration**: 保留稳定 DTO 兼容，并在 M8 Host/Bridge contract 稳定阶段重新评估全命令 Envelope。
