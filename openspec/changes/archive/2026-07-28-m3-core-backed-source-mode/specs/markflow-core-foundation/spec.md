## MODIFIED Requirements

### Requirement: Core foundation is an independent Rust crate
The system SHALL provide a top-level independent `markflow-core` Rust crate for the M1 document kernel.

**MODIFIED**: Core's DocumentSession, TextPatch, save_payload, and coordinate conversion capabilities are now formally integrated into the product path via `markflow-runtime` and Tauri Bridge.

#### Scenario: Product editing path now uses Core for Source Mode
- **WHEN** Source Mode is active with Core-backed mode enabled
- **THEN** open/edit/save flow routes through `markflow-core` `DocumentSession`
- **THEN** `apply_patch` produces the authoritative document revision
- **THEN** `save_payload` produces the only content used for disk writes

#### Scenario: Core tests still run host-independently
- **WHEN** Core unit and fixture tests are executed
- **THEN** they SHALL continue to run without Tauri, Vite, WebView, or frontend code
- **THEN** M3 integration does not add any host dependency to the Core crate