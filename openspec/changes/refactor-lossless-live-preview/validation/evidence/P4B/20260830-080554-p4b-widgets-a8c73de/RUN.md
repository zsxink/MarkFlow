# P4B Widget/Policy Candidate Validation Run

状态：IN PROGRESS

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P4B |
| Run ID | `20260830-080554-p4b-widgets-a8c73de` |
| Date/time | started 2026-08-30T08:05:54+08:00 |
| Agent/operator | Codex root executor |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Base commit SHA | `a8c73de70eb07ae374eed8ae227ad0097815db0b` |
| Dirty status | Expected candidate implementation/tests/evidence; user GOAL file excluded |
| Feature flags | lossless Core + Live Preview ON; P4B cohorts tested independently OFF/ON |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | PENDING FINAL MANIFEST |

## Scope

- Design: `design/phases/P4B-widgets-cohorts.md` and frozen P4B interaction ADR.
- Candidate: visibility contract, common interaction harness extensions, widget protocol, child-slot owner arbitration, task/fence pilots, FrontMatter/raw HTML policies, and exact-source fallbacks for deferred rich constructs.
- Excluded: P6 hidden-marker behavior; P7 image/table/Mermaid/PlantUML widgets; real IME completion; P4B substrate/item GO decisions.

## Pre-candidate exploratory evidence

- Focused unit suite: 8 files / 279 tests PASS.
- TypeScript: `npx tsc --noEmit` PASS.
- Desktop lossless suite: final exploratory result 22/22 PASS.
- Independent reviewer: PASS on the candidate implementation; no remaining 7.1/7.2/7.4–7.8 code blocker.
- These observations are rerun or explicitly separated from formal candidate gates below.

## Commands

| ID | Command | Status | Output |
| --- | --- | --- | --- |
| C01 | focused P4B unit suite | NOT STARTED | `gates/C01-focused-unit.log` |
| C02 | `npx tsc --noEmit` | NOT STARTED | `gates/C02-tsc.log` |
| C03 | `npm test` | NOT STARTED | `gates/C03-npm-test.log` |
| C04 | `npm run build` | NOT STARTED | `gates/C04-npm-build.log` |
| C05 | `cargo test --manifest-path crates/markflow-core/Cargo.toml` | NOT STARTED | `gates/C05-core-test.log` |
| C06 | `cargo test --manifest-path src-tauri/Cargo.toml` | NOT STARTED | `gates/C06-tauri-test.log` |
| C07 | byte-contract harness | NOT STARTED | `gates/C07-byte-contract.log` |
| C08 | `npx openspec validate refactor-lossless-live-preview --strict` | NOT STARTED | `gates/C08-openspec-strict.log` |
| C09 | `npx openspec validate --all` | NOT STARTED | `gates/C09-openspec-all.log` |
| C10 | `bash scripts/check-archive-synced.sh` | NOT STARTED | `gates/C10-archive-sync.log` |
| C11 | E2E build | NOT STARTED | `gates/C11-e2e-build.log` |
| C12 | `node e2e/run.mjs lossless` | NOT STARTED | `gates/C12-e2e-lossless.log` |
| C13 | `node e2e/run.mjs smoke` | NOT STARTED | `gates/C13-e2e-smoke.log` |
| C14 | `node e2e/run.mjs regression` | NOT STARTED | `gates/C14-e2e-regression.log` |
| C15 | `node e2e/run.mjs p0s` | NOT STARTED | `gates/C15-e2e-p0s.log` |
| C16 | `git diff --check` | NOT STARTED | `gates/C16-diff-check.log` |

## Desktop workflows

| Workflow | Expected | Current state | Evidence |
| --- | --- | --- | --- |
| task checkbox | ARIA state, Space/click local patch, one Undo, exact bytes, read-only no-op | exploratory PASS; formal pending | C12 |
| fence controls | language badge, exact source clipboard, local patch, one Undo, exact bytes, read-only no-op | exploratory PASS after boundary correction; formal pending | C12 + `FAILURES.md` |
| owner arbitration | parent local + independent child widget/fallback, no dual owner | exploratory PASS | C01/C12 |
| FrontMatter/raw HTML | parser-gap exact source; raw HTML inert/source-only | exploratory PASS | C01/C12 |
| real Chinese/Japanese IME | real composition start/update/end + commit + one Undo | FAIL / environment-limited | `FAILURES.md`, `ime/` |

## Failures and retries

See `FAILURES.md`. No failure has been converted into a pass by documentation.

## Data and privacy

- Generated fixtures only; no user document.
- No credential, token, or document content in the logs.
- IME files contain only the fixed strings `# marker\n` and `> marker\n`.
- User-supplied GOAL file is excluded from artifacts and commits.

## Current conclusion

- 7.1/7.2/7.4–7.8 implementation candidate: independent reviewer PASS; formal gates pending.
- 7.3: NOT COMPLETE because no real unlocked GUI composition run has passed.
- 7.9/7.10 and all P4B GO decisions: NOT COMPLETE.
- Program decision: NOT STARTED.
