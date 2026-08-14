# P1A corrective Core evidence run

- Run ID: `20260814-p1a-corrective-core`
- Date: 2026-08-14
- Branch: `test/issue-255-lossless-byte-contract`
- Base commit: `0103e377797ab824055bef4bce92c8b5a8567b7f`
- Candidate commit: **PENDING** (implementation was uncommitted while this run was recorded)
- Scope: `markflow-core/**` and P1A validation/task status only.

## Trigger and root cause

An independent P1A review found four defects:

1. `open` and `reload` left `persisted_revision=None`, so an unedited document was dirty.
2. `TextPatch` lacked binding/session/document identity and `reload` did not advance a binding generation, allowing a delayed pre-reload patch to match revision zero.
3. Multi-change patch application resolved `Inherit` EOL provenance during reverse mutation, allowing a later change to alter an earlier change's neighbor.
4. Public `PositionMap` accepted an arbitrary `TextBuffer`; mismatched line geometry could index its precomputed arrays incorrectly.

## Implemented corrective behavior

- Fresh open and reload establish `persisted_revision == revision == Revision(0)`; `is_dirty()` is false until an accepted edit.
- `TextPatch` now carries and is verified against `binding_generation`, `session_id`, and `document_id`; reload advances generation and rejects old work with `wrong-identity`.
- All replacement EOLs are resolved from the immutable base snapshot before any reverse application. This follows the design-02 requirement that every change is in the base revision's coordinates and the design-01 surviving-boundary inheritance order.
- `PositionMap` stores an O(1) TextBuffer geometry identity from construction and all public mapping methods reject mismatched text with `position-map-mismatch`.

## Automated gates

| Gate | Command | Exit | Evidence |
| --- | --- | ---: | --- |
| Rust format | `cargo fmt --all -- --check` | 0 | `gate_core_fmt.log` |
| Rust lint | `cargo clippy --all-targets --all-features -- -D warnings` | 0 | `gate_core_clippy.log` |
| Core tests | `cargo test` | 0 | `gate_core_test.log` |
| P0 byte harness | `npm run test:byte-contract` | 0 | `gate_bytecontract_p0.log` |
| Frontend tests | `npm test` | 0 | `gate_npm_test.log` |
| Type check | `npx tsc --noEmit` | 0 | `gate_tsc.log` |
| OpenSpec | `npx openspec validate --all` | 0 | `gate_openspec_all.log` |
| P1A benchmark | `cargo run --example bench_large_inputs --release` | 0 | `gate_core_bench.log` |

Added coverage is included in `gate_core_test.log`: clean fresh/reload lifecycle,
stale patch after reload, wrong session/document identity, the supplied
`A\nB → X\nA\r\nB` multi-change regression, adjacent mixed-EOL golden, and all
public PositionMap mismatch methods under `catch_unwind`.
The changed public API/error-code mapping is in `CORE-API-MAPPING.md`.

## Go/No-Go

Automated result: **PASS**.

P1A decision: **NO-GO / PENDING**. A new independent reviewer must inspect this
candidate and rerun the required static/test gates. Human byte-contract acceptance
and Program Owner Go/No-Go remain unperformed; this record does not claim either.

## Not run / residual risk

- Miri/sanitizer was not run: `cargo miri --version` exited 1 because the `miri` component is unavailable for `stable-aarch64-apple-darwin`; see `gate_miri_availability.log`.
- No desktop/manual workflow was run because P1A Core has no product entrypoint; human P1A acceptance remains required by the phase design.
