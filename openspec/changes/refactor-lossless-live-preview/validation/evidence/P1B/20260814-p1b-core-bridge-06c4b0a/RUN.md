# P1B AI coding evidence run — lossless Core bridge + Source vertical slice

## Identity and scope

- Run ID: `20260814-p1b-core-bridge-06c4b0a`
- Candidate HEAD: `06c4b0a793f152f5441294ef98670f7a13af5b77`
- Branch: `test/issue-255-lossless-byte-contract`
- Scope: P1B tasks 3.1–3.10 (AI coding). Human acceptance and independent
  Reviewer are separate (see `validation/phases/P1B.md`).
- Flags: `losslessCoreSession=false` (product default). Tests/E2E enable it
  explicitly; the flag stays off on any byte-fixture failure.

## What this run proves (AI coding, machine-verifiable)

| Layer | Evidence | Result |
| --- | --- | --- |
| P2 transaction-id freeze | `markflow-core` high-water mark + `retry_window_evicts_oldest` | PASS |
| Real dispatcher bridge | `dispatcher_contract.rs` (real commands + real State + real fs) | 10/10 PASS |
| Bridge identity matrix | stale-revision / wrong-identity / duplicate-mismatch rejection | PASS |
| Guarded atomic write | L0 clean-save bytes preserved; conflict on mismatched identity; duplicate operation rejected; reconcile | PASS |
| SourceSyncController | 10 unit tests: batch/retry/resync/blocked/flush/dispose/late-ack-drop/in-flight | PASS |
| Lossless lifecycle (frontend) | lifecycle.test.ts 6 + sourceSyncController.test.ts 10 integration tests: open→edit→dirty→save→persist→reload→close, A/B, audit, reconcile, 3.10 | PASS |
| 3.9.2 audit | lossless open/dirty/autosave/save/reload/close never call setMarkdown/getMarkdown/normalizeImageMarkdown/PM serializer | PASS |
| 3.10 renderer/parser isolation | renderer/parser command failure does not block lossless open/edit/save | PASS |
| Desktop E2E (lossless) | real Tauri WebKit: zero-edit lifecycle, clean Cmd+S, edit→save→reopen hash, A/B switch, CRLF/BOM survival | PASS |
| P0S inheritance (desktop) | legacy p0s E2E 4/4 (zero-edit, immediate save, A/B, clean Cmd+S) | PASS |
| Frontend regression | `npm test` | 390/390 PASS |
| TypeScript | `npx tsc --noEmit` | PASS |
| Build | `npm run build` | PASS |
| Byte contract | `npm run test:byte-contract` (L0/L1 harness self-check) | PASS |
| Core tests | `cargo test --manifest-path markflow-core/Cargo.toml` | 93 PASS |
| Tauri tests | `cargo test --manifest-path src-tauri/Cargo.toml` | 132 PASS |
| OpenSpec | `npx openspec validate refactor-lossless-live-preview --strict` | PASS |
| Desktop smoke | `node e2e/run.mjs smoke` | 5/5 PASS |

## Gate logs

Each gate log is captured in this run directory (`gate_*.log`). The desktop E2E
suites (lossless / p0s / smoke / regression) run against isolated workspaces
under `MARKFLOW_E2E_DATA_DIR` / `MARKFLOW_E2E_WORKSPACE`; their wdio artifacts
are preserved under `validation/evidence/P1B/<run-id>/e2e/` where captured.

## Environment

See `ENVIRONMENT.md` in this directory (SHA-256 recorded below).

## Honest limitations

- The lossless frontend integration test double re-implements a minimal session
  in JS for orchestration; it does NOT claim byte fidelity (the Rust
  dispatcher + Core golden tests + desktop E2E own that).
- Byte L0/L1 across ALL 24 canonical fixtures is proven by the Core golden
  tests (fixture_l0/fixture_l1) and sampled on desktop; the desktop E2E covers
  13 fixtures zero-edit and edit-save-reopen on LF/CRLF/BOM representatives.
- Human acceptance (manual desktop workflow) is NOT performed by this run.
