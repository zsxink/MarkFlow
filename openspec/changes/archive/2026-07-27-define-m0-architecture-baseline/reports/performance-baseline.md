# M0 Performance Baseline

- Date: 2026-07-27
- ADR: `adr/adr-performance-baseline.md`

## Benchmark Machine

| Field | Value |
| --- | --- |
| OS | macOS 26.5.2 (25F84) |
| CPU | Apple M5 |
| Memory | 34,359,738,368 bytes |
| Rust | rustc 1.96.0 (ac68faa20 2026-05-25) |
| Cargo | cargo 1.96.0 (30a34c682 2026-05-25) |
| Node | v24.17.0 |

## Recorded Results

| Scenario | Fixture | p50 | p95 | Status |
| --- | --- | ---: | ---: | --- |
| IPC patch simulation | generated 10MB | 5,241 us | 9,500 us | Release simulation passes initial 50ms target; native IPC still must be measured. |
| Position/EOL | all small fixtures | n/a | n/a | Passed round-trip and patch-preservation checks. |
| Parser differential | all small fixtures | n/a | n/a | Passed report generation. |
| Parser 1/10/50MB | generated fixtures | n/a | n/a | Dev and release apply runs were interrupted; parser p95 not frozen. |
| bekoedit 1MB | generated fixture | 11,548 us | 12,890 us | Release benchmark completed. |
| bekoedit 10MB | generated fixture | 104,339 us | 111,267 us | Release benchmark completed. |
| bekoedit 50MB | generated fixture | 693,452 us | 693,452 us | Release benchmark completed with 1 iteration. |

## Budgets

Initial budgets remain the planning target, but the IPC spike creates a risk flag for the 10MB patch ack target:

| Scenario | First editable state p95 | Local input commit p95 | Core patch ack p95 |
| --- | ---: | ---: | ---: |
| <= 1MB | <= 500ms | <= 16ms | <= 30ms |
| 10MB | <= 2s | <= 33ms | <= 50ms |
| 50MB | <= 5s | <= 50ms | <= 100ms |

M1 must not treat parser budgets as confirmed until release/native parser benchmarks complete. The bekoedit reference benchmark provides useful comparison data but does not make bekoedit a production dependency. The IPC result is a Rust simulation, not a Tauri IPC measurement.
