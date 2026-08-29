# Validation Run Record — P4B task 7.2a final candidate

状态：FAIL (sealed; autosave wrote A while discard decision dialog was open)

| Field | Value |
| --- | --- |
| Run ID | `20260830-054951-p4b-6432059` |
| Date/time | 2026-08-30T05:49:51+0800 |
| Operator | Codex main `/root` |
| Branch / start | `test/issue-255-lossless-byte-contract` / `6432059d29455ee8a4b7a4515ffff3aab371e2d0` |
| Environment | `./ENVIRONMENT.md` |
| Environment SHA-256 | `5be6b7efae0711540c97b0e1c1efbcd67422620c9238b45c515a407fdd0d0cf4` |

## Gates

| ID | Gate | Status | Log |
| --- | --- | --- | --- |
| C00 | P4B fixture Node | PASS | `gates/C00-p4b-fixtures.log` |
| C01 | focused Vitest | PASS (238) | `gates/C01-focused-vitest.log` |
| C02 | all Vitest | PASS (826) | `gates/C02-npm-test.log` |
| C03 | TypeScript | PASS | `gates/C03-tsc.log` |
| C04 | build | PASS | `gates/C04-build.log` |
| C05 | Core rustfmt | PASS | `gates/C05-core-fmt.log` |
| C06 | Core clippy | PASS | `gates/C06-core-clippy.log` |
| C06b | Tauri clippy | PASS | `gates/C06b-tauri-clippy.log` |
| C07 | Core tests | PASS (96) | `gates/C07-core-test.log` |
| C08 | Tauri tests | PASS | `gates/C08-tauri-test.log` |
| C09 | byte contract | PASS | `gates/C09-byte-contract.log` |
| C10 | OpenSpec strict | PASS | `gates/C10-openspec-strict.log` |
| C11 | OpenSpec all | PASS (61) | `gates/C11-openspec-all.log` |
| C12 | archive sync | PASS | `gates/C12-archive-sync.log` |
| C13 | E2E build | PASS | `gates/C13-e2e-build.log` |
| C14 | desktop lossless | PASS (15/15) | `gates/C14-e2e-lossless.log` |
| C15 | desktop smoke | PASS (5/5) | `gates/C15-e2e-smoke.log` |
| C16 | desktop regression | PASS (two native PDFs) | `gates/C16-e2e-regression.log` |
| C17 | desktop p0s | FAIL (dialog shown; autosave wrote A before discard) | `gates/C17-e2e-p0s.log` |
| C18 | diff check | PASS | `gates/C18-diff-check.log` |

Every gate records command, UTC start/end, exit and raw output. Any failure seals the run. Fresh independent review is required before commit.

- AI gate: FAIL
- Human acceptance: PENDING-MANUAL for later P4B substrate candidate
- Program decision: NOT STARTED; 7.2a does not grant `P4B-SUBSTRATE-GO`
