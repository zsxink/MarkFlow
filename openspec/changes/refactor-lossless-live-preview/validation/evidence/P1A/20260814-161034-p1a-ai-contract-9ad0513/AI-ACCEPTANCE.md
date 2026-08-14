# AI Core Contract Acceptance — PASS

Program Owner explicitly delegated non-UI review to Codex on 2026-08-14 and reserved
manual interaction for final product UI stages. P1A has no product entrypoint, so no
human UI action is applicable here.

## Acceptance checks

| Required check | Evidence | Result |
| --- | --- | --- |
| Core scope stays below draft/UI scope | `markflow-core/Cargo.toml`, public API mapping, independent review | PASS — snapshot/text/EOL/position/patch/session only; no parser, DOM, Tauri, network or History |
| L0 source replay | Core 92-test suite; P0 byte harness L0 24/24 | PASS |
| L1 surviving bytes and trailing boundaries | Core fixture L1 + P0 byte harness L1 95/95 | PASS |
| BOM, LF/CRLF/CR/Mixed EOL and EOL provenance | Core EOL/property tests and independent discriminator | PASS |
| UTF-16/UTF-8/source boundaries and invalid UTF-8 | property/negative tests; stable `invalid-encoding` error | PASS |
| Reload/patch consistency and failure atomicity | independent final review harness | PASS |
| PositionMap public failure safety | all four mismatch conversions under `catch_unwind` | PASS — stable `position-map-mismatch`, no panic |
| P1B entry performance evidence | 50 MiB benchmark: open 311.90ms, patch 148.22ms, save 23.17ms | PASS for P1A; P1B must remeasure bridge/UI behavior |

## Residual condition

The independent reviewer recorded one P2: 256-entry transaction-id dedupe retention.
P1B must freeze a session-lifetime ID uniqueness/retry-window protocol before its bridge
integration; this P1A acceptance does not waive or hide it.

## Decision

**AI Core contract acceptance: PASS.** Candidate `9ad0513` is technically ready for
Program Owner to decide whether P1B may begin. No assertion is made about UI behavior;
that remains the user's final-product review responsibility in a later UI stage.
