## ADDED Requirements

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

