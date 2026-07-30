## ADDED Requirements

### Requirement: Versioned Host request context

Host side effect calls SHALL carry a `HostRequestContext` with `protocol_version`, `request_id`, `client_id`, optional `window_label`, optional `session_id`, optional `document_id`, optional `base_revision`, and `capability`.

#### Scenario: Host request carries stable routing identity

- **WHEN** Runtime calls a Host side effect for a document-bound export job
- **THEN** the request context includes `protocol_version`, `request_id`, `client_id`, `window_label`, `session_id`, `document_id`, `base_revision`, and `capability`
- **THEN** Host does not infer the target from the current active editor, current active path, or active window

#### Scenario: Unsupported Host protocol version is rejected

- **WHEN** Host receives a request with an unsupported `protocol_version`
- **THEN** Host returns `HOST_PROTOCOL_VERSION_UNSUPPORTED`
- **THEN** no side effect is performed

### Requirement: Host capability negotiation

Host SHALL expose capability negotiation for `file_system`, `clipboard`, `dialogs`, `windows`, `notifications`, `shell`, `network`, `render`, and `export`. Capability status SHALL distinguish available, missing, permission denied, user denied, temporary failure, and unsupported platform.

#### Scenario: Missing capability is explicit

- **WHEN** Runtime requests a capability that Host does not provide
- **THEN** Host returns `HOST_MISSING_CAPABILITY`
- **THEN** Runtime does not silently fall back to another side-effect path

#### Scenario: Permission denied is explicit

- **WHEN** a window or webview lacks the permission required for a Host capability
- **THEN** Host returns `HOST_PERMISSION_DENIED`
- **THEN** UI can show a recoverable permission error

### Requirement: Host scope validation

Document-related Host side effects SHALL require `session_id`. Window, dialog, notification, shell, clipboard, and export results SHALL require `window_label`. File system, render, and export result routing SHALL require `base_revision`.

#### Scenario: Document side effect without session is rejected

- **WHEN** Runtime sends a file, network, render, or export request without `session_id`
- **THEN** Host returns `HOST_SESSION_MISMATCH`
- **THEN** no side effect result is applied

#### Scenario: Window side effect without window label is rejected

- **WHEN** Runtime sends a dialog, clipboard, window, notification, shell, or export request without `window_label`
- **THEN** Host returns `HOST_WINDOW_MISMATCH`
- **THEN** Host does not route the request to the active window implicitly

#### Scenario: Revision-bound result without revision is rejected

- **WHEN** Runtime sends a file, render, or export request without `base_revision`
- **THEN** Host returns `HOST_STALE_REVISION`
- **THEN** Runtime keeps the session state unchanged

### Requirement: Stable Host and export error codes

Host SHALL return stable machine-readable error codes for protocol, capability, permission, mismatch, stale session, stale revision, cancellation, timeout, and write/export failures.

#### Scenario: Export unsupported format is stable

- **WHEN** a platform or build does not support the requested export format
- **THEN** Host returns `EXPORT_UNSUPPORTED_FORMAT`
- **THEN** UI displays the disabled or unsupported reason instead of reporting success

#### Scenario: Export cancellation is stable

- **WHEN** the user cancels an export or Runtime cancels a bound export job
- **THEN** Host returns `EXPORT_CANCELLED`
- **THEN** Runtime cleans up the job without retrying automatically

### Requirement: Mock Host harness

The project SHALL provide a deterministic non-Tauri mock Host harness that can validate Host protocol behavior without Tauri runtime, DOM, or platform windows.

#### Scenario: Mock Host covers capability failure

- **WHEN** a test requests a capability absent from the mock Host matrix
- **THEN** the harness returns `HOST_MISSING_CAPABILITY`

#### Scenario: Mock Host covers stale routing

- **WHEN** a test sends a request for a closed or unknown session
- **THEN** the harness returns `HOST_STALE_SESSION`

#### Scenario: Mock Host covers cancellation

- **WHEN** a test cancels a request id before a Host operation completes
- **THEN** the harness returns `HOST_REQUEST_CANCELLED` or `EXPORT_CANCELLED` according to the capability

### Requirement: Host capability matrix

Every Host capability SHALL be documented with capability name, allowed windows/webviews, parameter range, resource range, timeout, cancellation semantics, stable error codes, cross-platform support status, and Tauri permission mapping.

#### Scenario: New Host command requires matrix entry

- **WHEN** a new Host-facing command is added
- **THEN** the Host capability matrix is updated in the same change
- **THEN** protocol tests cover the new capability before UI exposure

#### Scenario: Tauri permission drift is detected

- **WHEN** Tauri capability or permission configuration changes
- **THEN** automated validation compares it with the Host capability matrix
- **THEN** mismatches fail the test or gate

### Requirement: Non-Tauri portability harness

The project SHALL provide a non-Tauri harness that can run inspect, search, diagnostics, and HTML export using Core/Runtime boundaries without relying on Tauri commands or editor DOM.

#### Scenario: HTML export runs without Tauri

- **WHEN** the non-Tauri harness exports a Markdown file to HTML
- **THEN** it opens a Runtime session, builds Export IR for a confirmed revision, renders HTML from that IR, and writes through a mock or file Host
- **THEN** it does not read the current editor DOM

#### Scenario: Search runs without Tauri

- **WHEN** the non-Tauri harness searches a Markdown file
- **THEN** it uses Core search through a Runtime-owned session
- **THEN** results carry session and revision identity

