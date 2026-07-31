## ADDED Requirements

### Requirement: Host refuses legacy fallback after removal
After M8C removal, Host-facing file, render, and export side effects SHALL reject requests that lack required session, revision, request, capability, or window scope. Host and Bridge layers MUST NOT recover by using active editor, active file path, current WebView DOM, or current active window content.

#### Scenario: Missing export scope is rejected
- **WHEN** an export request reaches Host without `session_id`, `base_revision`, `request_id`, or `window_label`
- **THEN** Host SHALL return a stable mismatch or stale revision error
- **THEN** Host MUST NOT infer the missing target from the active window

#### Scenario: Permission failure has no fallback
- **WHEN** export, render, network, shell, or file capability is denied
- **THEN** Host SHALL return the stable permission error
- **THEN** Runtime SHALL surface the error instead of using a legacy side-effect path

### Requirement: Host legacy allowlist is empty at M8C removal
The Host capability matrix and migration evidence SHALL show an empty legacy allowlist before M8C removal is archived.

#### Scenario: Allowlist gate passes
- **WHEN** the removal audit runs
- **THEN** Host legacy fallback entries SHALL be empty or limited to non-product historical notes
- **THEN** active Host capability entries SHALL have stable error codes, timeout, cancellation, and permission mapping
