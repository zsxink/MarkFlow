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

