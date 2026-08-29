# Validation Run Record — P4B task 7.2a final candidate

状态：FAIL (sealed; autosave unit mock omitted new transition query)

| Field | Value |
| --- | --- |
| Run ID | `20260830-060325-p4b-6432059` |
| Date/time | 2026-08-30T06:03:25+0800 |
| Operator | Codex main `/root` |
| Branch / start | `test/issue-255-lossless-byte-contract` / `6432059d29455ee8a4b7a4515ffff3aab371e2d0` |
| Environment | `./ENVIRONMENT.md` |
| Environment SHA-256 | `7ec4325624c679a7b81e9af592489ed6d7bcce66235b883193409025f4124939` |

## Gates

| ID | Gate | Status | Log |
| --- | --- | --- | --- |
| C00 | P4B fixture Node | PASS | `gates/C00-p4b-fixtures.log` |
| C01 | focused Vitest | PASS (238) | `gates/C01-focused-vitest.log` |
| C02 | all Vitest | FAIL (7 mock-export errors; 822 passed) | `gates/C02-npm-test.log` |
| C03 | TypeScript | NOT STARTED | `gates/C03-tsc.log` |
| C04 | build | NOT STARTED | `gates/C04-build.log` |
| C05 | Core rustfmt | NOT STARTED | `gates/C05-core-fmt.log` |
| C06 | Core clippy | NOT STARTED | `gates/C06-core-clippy.log` |
| C06b | Tauri clippy | NOT STARTED | `gates/C06b-tauri-clippy.log` |
| C07 | Core tests | NOT STARTED | `gates/C07-core-test.log` |
| C08 | Tauri tests | NOT STARTED | `gates/C08-tauri-test.log` |
| C09 | byte contract | NOT STARTED | `gates/C09-byte-contract.log` |
| C10 | OpenSpec strict | NOT STARTED | `gates/C10-openspec-strict.log` |
| C11 | OpenSpec all | NOT STARTED | `gates/C11-openspec-all.log` |
| C12 | archive sync | NOT STARTED | `gates/C12-archive-sync.log` |
| C13 | E2E build | NOT STARTED | `gates/C13-e2e-build.log` |
| C14 | desktop lossless | NOT STARTED | `gates/C14-e2e-lossless.log` |
| C15 | desktop smoke | NOT STARTED | `gates/C15-e2e-smoke.log` |
| C16 | desktop regression | NOT STARTED | `gates/C16-e2e-regression.log` |
| C17 | desktop p0s | NOT STARTED | `gates/C17-e2e-p0s.log` |
| C18 | diff check | NOT STARTED | `gates/C18-diff-check.log` |

Every gate records command, UTC start/end, exit and raw output. Any failure seals the run. Fresh independent review is required before commit.

- AI gate: FAIL
- Human acceptance: PENDING-MANUAL for later P4B substrate candidate
- Program decision: NOT STARTED; 7.2a does not grant `P4B-SUBSTRATE-GO`
