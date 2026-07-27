# Validation Results

Date: 2026-07-27

## Commands

| Task | Command | Result |
| --- | --- | --- |
| 10.1 | `openspec validate define-m0-architecture-baseline --strict` | Passed: `Change 'define-m0-architecture-baseline' is valid`. |
| 10.2 | `npm test` | Passed: 31 test files, 339 tests. One stderr log from a mocked Tauri `invoke` logger path in `plantuml-lazy.test.ts`; no test failed. |
| 10.3 | `npx tsc --noEmit` | Passed. |
| 10.4 | `cargo test --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml` | Passed: 0 tests in isolated spike binary. |
| 10.4 | `cargo run --release --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- ipc --output .../reports/ipc-patch.json` | Passed. |
| 10.4 | `M0_RUN_BEKOEDIT_BENCH=1 cargo run --release --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- bekoedit --output .../reports/bekoedit-reference.json` | Passed. |
| 10.4 | `M0_RUN_BEKOEDIT_BENCH=1 cargo run --release --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- all --output .../reports/all-spikes.json` | Passed. Parser p95 remains skipped/unfrozen; bekoedit benchmark completed. |
| 10.4 | `M0_RUN_PARSER_BENCH=1 cargo run --release --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- parser --output .../reports/parser-comparison.json` | Interrupted after exceeding the bounded apply window; parser p50/p95 are not frozen. |
| 10.5 | `cargo test --manifest-path src-tauri/Cargo.toml` | Passed after replacing redirect acceptance test hostnames with public IP fixtures that do not require DNS: 122 passed, 0 failed. |
| 11.3 | `npx openspec validate --all` | Passed: 59 passed, 0 failed. |

## Rust Network Independence Resolution

Initial `cargo test --manifest-path src-tauri/Cargo.toml` failed:

- `http::tests::accepts_redirect_with_standard_port`
- `http::tests::allows_same_scheme_redirect`

Both failing tests called `validate_redirect_url()` with public hostnames such as `other.com`, which depended on environment DNS. The tests now use public IP fixtures (`93.184.216.34`) so redirect acceptance still validates public destinations and standard ports without public DNS.

## Network Independence Finding

TypeScript tests passed and network-like behavior is mocked in the observed test files, especially PlantUML/image/storage tests. Rust HTTP redirect acceptance tests no longer require hostname DNS resolution. Localhost and local HTTP fixture coverage remains local-only.
