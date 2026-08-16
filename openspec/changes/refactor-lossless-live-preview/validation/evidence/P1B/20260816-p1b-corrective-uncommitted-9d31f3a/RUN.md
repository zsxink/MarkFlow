# P1B corrective automated run

## Result

Automated non-desktop gates: **PASS**. Desktop lossless E2E: **BLOCKED (test
infrastructure)**. Therefore this run is evidence for a follow-up independent
review, not a P1B Go decision.

## Commands

| Command | Result | Log |
| --- | --- | --- |
| `npm test` | PASS — 34 files, 402 tests | `logs/npm-test.log` |
| `npx tsc --noEmit` | PASS | `logs/typecheck.log` |
| `npm run build` | PASS — 2496 modules | `logs/build.log` |
| `npm run test:byte-contract` | PASS — L0 24/23, L1 95/93 | `logs/byte-contract.log` |
| `cargo test --manifest-path markflow-core/Cargo.toml` | PASS | `logs/core-tests.log` |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS — 139 tests | `logs/tauri-tests.log` |
| `npx openspec validate refactor-lossless-live-preview --strict` | PASS | `logs/openspec.log` |
| `npx openspec validate --all` | PASS — 61 items | `logs/openspec.log` |
| `git diff --check` | PASS | `logs/diff-check.log` |
| `npm run test:e2e:build && node e2e/run.mjs lossless` | **BLOCKED** — missing `tauri-driver` | `logs/desktop-e2e.log` |

## Required re-review mapping

1. Mutable resync and blocked dirty: PASS in `sourceSyncController.test.ts` and
   real-CM `lifecycle.test.ts`.
2. Blocked reload refusal: PASS in real-CM lifecycle test.
3. Timeout and late ack: PASS in controller test.
4. Operation/target mismatch and malicious ID: PASS in Rust dispatcher test.
5. Write/commit response loss after mutation: PASS in lifecycle and Rust
   dispatcher tests.
6. Save As response-loss rebind: PASS in lifecycle test.
7. Startup receipt states and path gate: PASS in Rust tests.
8. Explicit EOL paste provenance: PASS in lifecycle LF/CRLF/CR/mixed cases and
   Core EOL tests; desktop browser exercise remains BLOCKED with E2E.
9. Normal automated gates: PASS as listed above; desktop portion remains
   BLOCKED.
