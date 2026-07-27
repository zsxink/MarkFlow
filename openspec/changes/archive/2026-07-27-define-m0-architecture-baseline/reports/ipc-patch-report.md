# IPC Patch Report

- JSON: `reports/ipc-patch.json`
- Command: `cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- ipc --output openspec/changes/define-m0-architecture-baseline/reports/ipc-patch.json`
- ADRs: `adr/adr-document-truth-save-owner.md`, `adr/adr-performance-baseline.md`

## Result

The IPC spike simulates CodeMirror-shaped UTF-16 transactions against a Rust-side revision ack path using the generated 10MB fixture.

Observed release-profile metrics:

| Metric | Value |
| --- | ---: |
| Fixture bytes after patches | 10,485,791 |
| Batch size | 30 |
| p50 | 5,241 us |
| p95 | 9,500 us |
| max | 12,319 us |

Duplicate transaction id returned `duplicate` without applying a second mutation. Stale `base_revision` returned `revisionMismatch` with confirmed revision `31` and `resyncRequired: true`.

## Budget Finding

The simulated 10MB release patch p95 is below the initial 50ms target. This is still not a production Tauri IPC measurement, so M1/M3 must remeasure through native Tauri IPC before promising 10MB patch ack budgets.

## 50MB Transport Note

The current report documents the 50MB first-text strategy rather than measuring real Tauri transport. JSON string transport must be remeasured in a native Tauri IPC harness; chunking remains the fallback if first-text p95 exceeds 5s or memory doubles.
