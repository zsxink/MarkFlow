# Validation Run Record — P4B task 7.2a corrective

状态：FAIL（superseded；历史证据不回写）

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P4B — task 7.2a structural interaction ADR harness |
| Run ID | `20260830-043642-p4b-6432059` |
| Date/time | 2026-08-30T04:36:42+0800 |
| Agent/operator | Codex main session `/root` |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` (GOAL-recorded exception) |
| Start commit SHA | `6432059d29455ee8a4b7a4515ffff3aab371e2d0` |
| Corrective predecessor | `../20260830-043257-p4b-6432059/` — C05 rustfmt FAIL |
| Candidate correction | Mechanical rustfmt only; all behavior diff otherwise identical |
| Feature flags | `headingStrong` / `quoteLists` default OFF; test-only ON; no table widget |
| Immutable environment | `./ENVIRONMENT.md` |
| Environment SHA-256 | `e423dc91725ff0f8e5b4cddc16e83f93adc1650c4ed49970c7edcba87ce3902d` |

## Scope

- ADR rows for heading/list/quote, trusted Lezer owner/fallback, one transaction/Undo, post-selection Core transport, and table P7 typed fixture freeze.
- Excludes table widget implementation, P6 hidden markers, real IME 7.3, final visual/a11y/manual acceptance.

## Commands

| ID | Command | Status | Output path |
| --- | --- | --- | --- |
| C01 | focused Vitest (4 files) | PASS (200) | `gates/C01-focused-vitest.log` |
| C02 | `npm test` | PASS (826) | `gates/C02-npm-test.log` |
| C03 | `npx tsc --noEmit` | PASS | `gates/C03-tsc.log` |
| C04 | `npm run build` | PASS | `gates/C04-build.log` |
| C05 | Core rustfmt check | PASS | `gates/C05-core-fmt.log` |
| C06 | Core clippy `-D warnings` | PASS | `gates/C06-core-clippy.log` |
| C07 | Core cargo test | PASS (96) | `gates/C07-core-test.log` |
| C08 | Tauri cargo test | PASS (159) | `gates/C08-tauri-test.log` |
| C09 | byte contract | PASS (L0 24/23; L1 95/93) | `gates/C09-byte-contract.log` |
| C10 | OpenSpec strict | PASS | `gates/C10-openspec-strict.log` |
| C11 | OpenSpec all | PASS (61/61) | `gates/C11-openspec-all.log` |
| C12 | archive sync gate | PASS | `gates/C12-archive-sync.log` |
| C13 | E2E app build | PASS | `gates/C13-e2e-build.log` |
| C14 | desktop lossless | **FAIL (10 passing, 5 fixture-not-found)** | `gates/C14-e2e-lossless.log` |
| C15 | desktop smoke | NOT STARTED | `gates/C15-e2e-smoke.log` |
| C16 | desktop regression | NOT STARTED | `gates/C16-e2e-regression.log` |
| C17 | desktop p0s | NOT STARTED | `gates/C17-e2e-p0s.log` |
| C18 | `git diff --check` | PASS | `gates/C18-diff-check.log` |

Each gate has a separate raw log with command, UTC start/end and exit code.

## Fixtures and byte results

- Pending C09 canonical L0/L1 counts and C08 dispatcher CRLF/CR/Mixed surviving-span cases.
- Table contract includes 36 typed fixtures, post-change cell ranges, EOL provenance and raw CRLF/CR/Mixed append expectations; pending C01.

## Desktop workflows

| Workflow | Expected | Status | Evidence |
| --- | --- | --- | --- |
| Embedded WebDriver lossless/smoke/regression/p0s | Existing desktop semantic suites remain green | NOT STARTED | C14–C17 |
| Real Chinese/Japanese IME | Deferred to task 7.3 | PENDING-MANUAL | future run |
| Visual/focus/a11y | Deferred to later P4B acceptance | PENDING-MANUAL | future run |

## Failures and retries

- Corrected predecessor C05 by mechanical rustfmt; C01–C13 and C18 passed.
- C14 failed after 10 lifecycle/live-preview cases passed: all 5 P4B reveal cases could not find fixture files. Root cause is deterministic harness setup: `e2e/run.mjs` never creates the five filenames consumed by `p4b-cohort-reveal.e2e.mjs`.
- C15–C17 were not run after C14 failed. The harness fix receives a third immutable run-id; this run and its raw failure stay unchanged.

## Data and privacy

- Log redaction: YES
- User documents used: NO
- Credentials/tokens captured: NO
- Test workspace isolated: YES

## AI conclusion

- AI gate: **FAIL** (C14 harness fixture setup)
- Recommendation: NO-GO for this candidate evidence; fix harness and create new run
- Risks: real IME/visual/focus/a11y remain outside 7.2a.

## Independent review

- Final reviewer: fresh Sol `/root/review_p4b_7_2a_v4`
- Static/adversarial result: PASS on final behavior candidate before rustfmt-only correction
- Review report: will be frozen as `REVIEW.md`

## Human acceptance / Program decision

- Human acceptance: PENDING-MANUAL for later P4B substrate candidate
- Program decision: NOT STARTED; this checkpoint does not grant `P4B-SUBSTRATE-GO`
