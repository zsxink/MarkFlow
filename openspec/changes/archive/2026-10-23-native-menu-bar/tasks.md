# Tasks

## 1. Native Menu Construction

- [x] 1.1 Build the macOS and Windows/Linux top-level menus, Chinese labels, predefined system items, submenu ordering, accelerators, and disabled placeholders; verify Rust formatting and compilation with `cargo check --manifest-path src-tauri/Cargo.toml`.
- [x] 1.2 Add Rust-side `menu:action` event dispatch for implemented application menu items and implement recent-history menu actions; verify action identifiers and event payloads with targeted Rust tests or a menu construction smoke test.
- [x] 1.3 Implement native menu enablement updates for workspace, active-document, and recent-file state; verify no-workspace, no-document, and empty-recents states disable the specified items.

## 2. Frontend Menu Integration

- [x] 2.1 Add a centralized frontend menu action dispatcher that invokes existing commands for supported actions; add unit tests covering action mappings and unknown actions.
- [x] 2.2 Connect dispatcher initialization and frontend-to-Rust menu-state updates to application lifecycle and workspace/document/recent-history changes; verify state updates after opening and closing documents/workspaces.
- [x] 2.3 Align DOM keyboard handling with native accelerators while preserving modal protections and unsupported shortcuts; verify shared shortcuts execute exactly once and existing keyboard shortcut tests pass.

## 3. Integration and Validation

- [x] 3.1 Verify the complete macOS and Windows/Linux menu structure, labels, ordering, accelerators, and disabled placeholders against the `native-menu-bar` scenarios.
- [x] 3.2 Run `npx tsc --noEmit`, `npm run build`, `npm test`, `npm run validate:openspec`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`, and `cargo test --manifest-path src-tauri/Cargo.toml`; resolve any failures.
