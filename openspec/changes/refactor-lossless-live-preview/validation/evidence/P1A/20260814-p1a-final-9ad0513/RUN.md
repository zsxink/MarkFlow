# P1A corrective final independent review run

## Identity and scope

- Run ID: `20260814-p1a-final-9ad0513`
- Review target: fixed code commit `9ad05131fd3bebd938cf2700a30169889f3dac86`
- Parent: `0103e377797ab824055bef4bce92c8b5a8567b7f`
- Reviewer authority: read-only for product code and historical P1A evidence.
- Files created by this review are confined to this run directory.
- Human acceptance: **PENDING / NOT PERFORMED**.
- Program Owner decision: **PENDING / NOT PERFORMED**.

At execution time `HEAD` exactly matched the candidate. `git diff --quiet <candidate> -- markflow-core src src-tauri tests package.json package-lock.json` exited 0. The only pre-existing worktree differences were uncommitted P1A corrective documentation/evidence, recorded in `candidate_identity.log`; they were neither reviewed as candidate code nor modified by this reviewer.

## Design and specification basis

The review used CodeGraph before textual search, then read the candidate versions of:

- `design/phases/P1A-lossless-core.md`;
- `design/01-byte-fidelity-and-position.md`;
- `design/02-core-session-and-sync.md`;
- `specs/lossless-markdown-session/spec.md`;
- `specs/lossless-refactor-validation/spec.md`.

The four corrective behaviors were additionally exercised through the independent Rust harness under `harness/`, rather than relying only on implementation-authored tests.

## Commands and results

| Gate | Command | Exit | Result |
| --- | --- | ---: | --- |
| Candidate identity | `git rev-parse HEAD` + candidate/product diff check | 0 | HEAD is the fixed candidate; no candidate/product worktree difference |
| Independent corrective harness | `cargo run --manifest-path <run>/harness/Cargo.toml` | 0 | Four corrective cases pass; injected failure remains atomic; bounded transaction-window P2 reproduced |
| Rust format | `cargo fmt --all -- --check` in `markflow-core` | 0 | PASS |
| Rust lint | `cargo clippy --all-targets --all-features -- -D warnings` in `markflow-core` | 0 | PASS |
| Core tests | `cargo test` in `markflow-core` | 0 | 92 passed, 0 failed |
| P0 byte contract | `npm run test:byte-contract` | 0 | fixture generation stable; L0 24/24; L1 95/95; negative self-checks pass |
| Frontend regression | `npm test` | 0 | 32 files, 375 tests passed |
| TypeScript | `npx tsc --noEmit` | 0 | PASS |
| OpenSpec strict | `npx openspec validate refactor-lossless-live-preview --strict` | 0 | PASS |
| OpenSpec all | `npx openspec validate --all` | 0 | 61 passed, 0 failed |
| Archive sync | `bash scripts/check-archive-synced.sh` | 0 | PASS; 70 legacy archives before cutoff skipped by the gate's documented policy |
| Random fixture hashes | independent Node SHA-256 sample | 0 | 7/7 hash and byte-length matches |
| Miri availability | `cargo miri --version` | 1 | UNAVAILABLE, not counted as a pass |
| Panic/unwrap audit | `rg` over `markflow-core/src` | 0 | Two non-test `expect` sites in PositionMap plus one snapshot `expect`; all follow validated UTF-8/boundary invariants; mismatch paths return errors |

The OpenSpec commands necessarily observed the shared worktree's uncommitted P1A status-document edits. This does not contaminate the code-gate result because the candidate/product diff check was clean, but those OpenSpec logs are honestly evidence for the then-current worktree, not a separately materialized pristine candidate tree.

The frontend test log contains expected stderr from a mocked Tauri logger path (`window.__TAURI_INTERNALS__` absent in Vitest); the suite nevertheless completed with exit 0 and 375/375 tests passed.

## Corrective verification summary

1. Fresh open and reload both establish `persisted_revision == revision == 0`, so zero-edit sessions are clean.
2. Reload advances `binding_generation`; a delayed patch from the prior generation returns `WrongIdentity` without changing revision, text, hash, or dirty state.
3. Every change's inherited EOLs are resolved against the immutable base `TextBuffer` before reverse mutation; the discriminator produces `X\nA\r\nB`, not a neighbor polluted by the later change.
4. Every public PositionMap conversion validates `geometry_id` first and returns `PositionMapMismatch`; all four mismatch calls completed under `catch_unwind` without panic.
5. An injected overlapping-change patch left text, revision, confirmed hash, retry ledger, and dirty state unchanged.

## Decision

- P0 findings: **0**
- P1 findings: **0**
- P2 findings: **1** (bounded transaction-id dedupe window; fully recorded in `REVIEW.md`)
- Independent Reviewer recommendation: **GO** for the fixed code candidate and proceed to the required human acceptance / Program Owner decision.
- Overall P1A program state: **PENDING**, because this review does not and must not sign the human checklist or Program Owner Go/No-Go.
