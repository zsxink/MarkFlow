# Validation Run Record — P4B task 7.2a

状态：FAIL（superseded by corrective run；历史证据不回写）

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P4B — task 7.2a structural interaction ADR harness |
| Run ID | `20260830-043257-p4b-6432059` |
| Date/time | 2026-08-30T04:32:57+0800 |
| Agent/operator | Codex main session `/root` |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` (GOAL-recorded exception) |
| Start commit SHA | `6432059d29455ee8a4b7a4515ffff3aab371e2d0` |
| Candidate state | Uncommitted 7.2a diff; user GOAL file excluded |
| Feature flags | `headingStrong` / `quoteLists` default OFF; explicitly ON only in tests; no table widget |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | `511604f6b7062afb5abde6e003adac990e80c060a8252ff76124323f83052119` |

## Scope

- Design/ADR: `adr-typora-structural-interaction-matrix.md`, parser/source-map trust ADR, `design/phases/P4B-widgets-cohorts.md`.
- Child Issue/change: Issue #254 umbrella, task 7.2a of `refactor-lossless-live-preview`.
- Changed modules: structural CodeMirror commands/tests, table contract types/fixtures, SourceSync selection transport, Tauri/Core post-change UTF-16 mapping and retry ledger contracts.
- Excluded modules: table widget implementation/rendering, P6 hidden-marker output, real IME task 7.3, visual/a11y/manual acceptance.

## Commands

| ID | Command | Status | Output path |
| --- | --- | --- | --- |
| C01 | focused Vitest (structural/command/source-sync) | PASS (200) | `gates/C01-focused-vitest.log` |
| C02 | `npm test` | PASS (826) | `gates/C02-npm-test.log` |
| C03 | `npx tsc --noEmit` | PASS | `gates/C03-tsc.log` |
| C04 | `npm run build` | PASS | `gates/C04-build.log` |
| C05 | `cargo fmt --manifest-path markflow-core/Cargo.toml -- --check` | **FAIL (exit 1)** | `gates/C05-core-fmt.log` |
| C06 | `cargo clippy --manifest-path markflow-core/Cargo.toml --all-targets --all-features -- -D warnings` | PASS | `gates/C06-core-clippy.log` |
| C07 | `cargo test --manifest-path markflow-core/Cargo.toml` | PASS (96) | `gates/C07-core-test.log` |
| C08 | `cargo test --manifest-path src-tauri/Cargo.toml` | PASS (159) | `gates/C08-tauri-test.log` |
| C09 | `npm run test:byte-contract` | PASS (L0 24/23; L1 95/93) | `gates/C09-byte-contract.log` |
| C10 | `npx openspec validate refactor-lossless-live-preview --strict` | PASS | `gates/C10-openspec-strict.log` |
| C11 | `npx openspec validate --all` | PASS (61/61) | `gates/C11-openspec-all.log` |
| C12 | `bash scripts/check-archive-synced.sh` | PASS | `gates/C12-archive-sync.log` |
| C13 | `npm run test:e2e:build` | NOT STARTED | `gates/C13-e2e-build.log` |
| C14 | `node e2e/run.mjs lossless` | NOT STARTED | `gates/C14-e2e-lossless.log` |
| C15 | `node e2e/run.mjs smoke` | NOT STARTED | `gates/C15-e2e-smoke.log` |
| C16 | `node e2e/run.mjs regression` | NOT STARTED | `gates/C16-e2e-regression.log` |
| C17 | `node e2e/run.mjs p0s` | NOT STARTED | `gates/C17-e2e-p0s.log` |
| C18 | `git diff --check` | PASS | `gates/C18-diff-check.log` |

Command timestamps, exit codes, test counts, failures and retries will be frozen after execution. Each command has a separate raw output file.

## Fixtures and byte results

- Canonical byte harness output: pending C09.
- Structural CRLF/CR/Mixed bridge evidence: pending C08 (`bridge_structural_heading_patch_preserves_untouched_eol_bytes` and post-selection dispatcher cases).
- Table append contract freezes LF logical changes plus inherit provenance and CRLF/CR/Mixed raw surviving bytes; pending C01.

## Desktop workflows

| Workflow | Expected | Status | Evidence |
| --- | --- | --- | --- |
| Embedded WebDriver lossless/smoke/regression/p0s | Existing desktop semantic suites remain green | NOT STARTED | C14–C17 |
| Real Chinese/Japanese IME | Deferred by task boundary to 7.3 | PENDING-MANUAL | Future 7.3 evidence |
| Visual/focus/a11y | Deferred to later P4B acceptance | PENDING-MANUAL | Future P4B candidate evidence |

## Failures and retries

| Issue | First run | Retry run | Final state |
| --- | --- | --- | --- |
| Core rustfmt mismatch in `markflow-core/src/session.rs` | C05 exit 1; exact diff retained in `gates/C05-core-fmt.log` | New corrective run-id after mechanical `cargo fmt` | OPEN in this run; superseded |

Historical implementation/reviewer corrective loops occurred before this immutable candidate run and were not rewritten as run evidence. C13–C17 were deliberately not run after C05 failed; the corrective candidate reruns C01–C18 from a new immutable environment snapshot.

## Data and privacy

- Log redaction checked: YES
- No user document used: YES
- No credential/token captured: YES
- Test workspace isolated: YES

## AI conclusion

- AI gate: **FAIL** (C05 formatting)
- Go/No-Go recommendation: NO-GO for this candidate; use corrective run
- Unrun items: C13–C17 (stopped after deterministic formatting failure)
- Risks: real IME/visual/focus/a11y remain explicitly outside 7.2a and cannot be claimed by this run.

## Independent review

- Reviewer: fresh Sol reviewer `/root/review_p4b_7_2a_v4`
- Review status: PASS before run sealing; final report will be copied to `REVIEW.md`
- Earlier corrective reviews: V1 FAIL, V2 FAIL, V3 PASS then superseded; V4 reviewed the final candidate after all corrective changes.

## Human acceptance

- Human validator: Program Owner / user
- Status: PENDING-MANUAL
- Record: not yet requested for 7.2a; P4B desktop acceptance follows 7.3/remaining substrate work.

## Program decision

- Owner: Program Owner / user
- Decision: NOT STARTED
- Date: not recorded
- Conditions: 7.2a code checkpoint does not itself grant `P4B-SUBSTRATE-GO`.
