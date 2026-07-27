# ADR: Performance Baseline And Budgets

- Status: Accepted for M0 baseline
- Date: 2026-07-27
- Evidence: `reports/performance-baseline.md`, `reports/parser-benchmark.json`, `reports/ipc-patch-report.md`

## Decision

M0 performance decisions must use recorded machine facts, reproducible commands, fixture sizes, p50, p95, and peak memory where measurable.

Initial budgets for Core-backed stages:

| Scenario | First editable state p95 | Local input commit p95 | Core patch ack p95 |
| --- | ---: | ---: | ---: |
| <= 1MB | <= 500ms | <= 16ms | <= 30ms |
| 10MB | <= 2s | <= 33ms | <= 50ms |
| 50MB | <= 5s | <= 50ms | <= 100ms |

## Required Report Fields

- Machine name or model.
- Operating system.
- CPU.
- Memory.
- Rust version.
- Node version.
- Fixture path.
- Fixture byte size.
- Command.
- Candidate/parser/engine.
- p50.
- p95.
- Peak memory where measurable.
- Failure list and allowlist reason.
- ADR reference.

## Adjustment Rule

If M0 or later M1/M3 benchmark evidence shows a budget is unrealistic, the ADR must be updated with the measured value, fixture, command, and reason. Subjective labels such as "smooth" are not sufficient.

## M0 Evidence

`reports/performance-baseline.md` records the benchmark machine and current results. The 10MB IPC patch simulation measured p95 around 9.5ms in release profile, below the initial 50ms target, but it is not a native Tauri IPC measurement. Parser size benchmarks remain unfrozen because release opt-in did not complete in the bounded apply window. Bekoedit reference size benchmarks completed in release mode.
