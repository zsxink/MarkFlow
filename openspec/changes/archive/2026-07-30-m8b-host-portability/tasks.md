## 1. Host Contract Foundation

- [x] 1.1 Add Runtime-owned Host protocol version constant, HostRequestContext DTO, HostCapability registry, HostCapabilities DTO, and stable Host/export error code registry.
- [x] 1.2 Add serialization compatibility tests for Host protocol version, request id, client id, window label, session id, document id, base revision, capabilities, and stable error codes.
- [x] 1.3 Add Host context validation for required session, window, and revision scope.
- [x] 1.4 Add deterministic MockHostHarness covering missing capability, permission denied, window mismatch, stale session, stale revision, cancellation, and capability matrix status.

## 2. Capability Matrix and Permission Drift Gates

- [x] 2.1 Create Host capability matrix documentation for file_system, clipboard, dialogs, windows, notifications, shell, network, render, and export.
- [x] 2.2 Record parameter range, resource range, allowed windows/webviews, timeout, cancellation semantics, stable error codes, and platform support for each capability.
- [x] 2.3 Add tests or fixtures comparing the Host capability matrix with Tauri v2 capability / permission configuration.
- [x] 2.4 Require new Host-facing commands to update the matrix and protocol fixtures before UI exposure.

## 3. Filesystem, Dialog, Window, Clipboard, Notification, and Shell Ports

- [x] 3.1 Migrate Runtime filesystem Host operations to accept HostRequestContext while preserving FileIdentity, SaveLease, PathSaveCoordinator, atomic write, and conflict behavior.
- [x] 3.2 Migrate open/save dialog operations to Host dialog port with window label validation and cancellation semantics.
- [x] 3.3 Migrate clipboard text, Markdown, and image operations to Host clipboard port with explicit capability checks.
- [x] 3.4 Migrate window lifecycle to Host `windows` port and route App Service toast side effects with stable request/window/session validation; keep OS-level Host `notifications` `not_configured` until a Tauri notification capability/plugin is added.
- [x] 3.5 Migrate shell/open path operations to Host shell port with minimal permission and resource range checks.

## 4. Network, Render, and Export Ports

- [x] 4.1 Migrate network/image fetch operations to Host network port with SSRF, size, MIME, timeout, and cancellation gates.
- [x] 4.2 Migrate Mermaid/PlantUML rendering to Host render port bound to session, revision, request id, sandbox policy, and timeout.
- [x] 4.3 Migrate PDF/print/export platform output to Host export port while keeping input from Export IR-rendered content.
- [x] 4.4 Ensure Host export does not read active editor DOM, active path, or current window content as document truth.
- [x] 4.5 Add export cancellation, stale revision, unsupported format, permission denied, timeout, and write failure tests.

## 5. Non-Tauri Harness

- [x] 5.1 Add a non-Tauri harness entry for inspecting Markdown through Runtime/Core boundaries.
- [x] 5.2 Add non-Tauri search harness coverage using Runtime sessions and confirmed revisions.
- [x] 5.3 Add non-Tauri diagnostics harness coverage using Runtime sessions and confirmed revisions.
- [x] 5.4 Add non-Tauri HTML export harness coverage using Runtime session lifecycle, Export IR, and Host output.
- [x] 5.5 Add protocol tests for same-path multi-session conflict and same-path export session isolation.

## 6. Bridge and Frontend Contract

- [x] 6.1 Extend Bridge DTOs or internal construction so Host-bound requests include protocol version, request id, client id, window label, session id, document id, base revision, and capability.
- [x] 6.2 Map Host/export stable error codes to frontend-visible errors without collapsing permission, capability, cancellation, timeout, stale session, stale revision, and unsupported format into generic internal errors.
- [x] 6.3 Ensure UI applies Host results only when request/window/session/revision identity still matches the initiating operation.

## 7. Evidence and Verification

- [x] 7.1 Update feature migration matrix for each migrated Host capability group.
- [x] 7.2 Update M8B evidence with issue, implementation scope, automated test commands, known fallbacks, and unverified platforms.
- [x] 7.3 Run `cargo test --manifest-path src-tauri/crates/runtime/Cargo.toml`.
- [x] 7.4 Run `cargo test --manifest-path src-tauri/Cargo.toml`.
- [x] 7.5 Run `npx tsc --noEmit`.
- [x] 7.6 Run `npm test` or targeted frontend tests for affected Bridge/export/asset paths.
- [x] 7.7 Run `git diff --check`.
- [x] 7.8 Before merge/archive, dispatch an independent review agent for static review and runnable tests as required by project policy.
