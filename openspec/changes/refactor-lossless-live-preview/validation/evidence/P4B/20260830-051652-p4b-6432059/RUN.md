# Validation Run Record — P4B task 7.2a final candidate

状态：FAIL (sealed; blocked by stable native-PDF readiness defect)

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P4B task 7.2a |
| Run ID | `20260830-051652-p4b-6432059` |
| Date/time | 2026-08-30T05:16:52+0800 |
| Agent/operator | Codex main `/root` |
| Branch | `test/issue-255-lossless-byte-contract` (GOAL exception) |
| Start commit | `6432059d29455ee8a4b7a4515ffff3aab371e2d0` |
| Immutable environment | `./ENVIRONMENT.md` |
| Environment SHA-256 | `8a4cbeff5a61a869912de6610263e014902721ad1a630c874632d5320e9308f7` |

## Scope

- 7.2a structural interaction, table P7 fixture contract, selection transport/Core retry, and deterministic desktop semantic coverage.
- No table widget, P6 hidden-marker implementation, real IME, visual or a11y acceptance.

## Commands

| ID | Command | Status | Output |
| --- | --- | --- | --- |
| C00 | P4B fixture Node test | PASS | `gates/C00-p4b-fixtures.log` |
| C01 | focused Vitest | PASS (238) | `gates/C01-focused-vitest.log` |
| C02 | `npm test` | PASS (826) | `gates/C02-npm-test.log` |
| C03 | TypeScript | PASS | `gates/C03-tsc.log` |
| C04 | production build | PASS | `gates/C04-build.log` |
| C05 | Core rustfmt | PASS | `gates/C05-core-fmt.log` |
| C06 | Core clippy | PASS | `gates/C06-core-clippy.log` |
| C07 | Core tests | PASS (96) | `gates/C07-core-test.log` |
| C08 | Tauri tests | PASS | `gates/C08-tauri-test.log` |
| C09 | byte contract | PASS | `gates/C09-byte-contract.log` |
| C10 | OpenSpec strict | PASS | `gates/C10-openspec-strict.log` |
| C11 | OpenSpec all | PASS (61) | `gates/C11-openspec-all.log` |
| C12 | archive sync | PASS | `gates/C12-archive-sync.log` |
| C13 | E2E build | PASS | `gates/C13-e2e-build.log` |
| C14 | desktop lossless | PASS (15/15) | `gates/C14-e2e-lossless.log` |
| C15 | desktop smoke | PASS (5/5) | `gates/C15-e2e-smoke.log` |
| C16 | desktop regression | FAIL (native PDF ready timeout) | `gates/C16-e2e-regression.log` |
| C17 | desktop p0s | NOT RUN (blocked by C16) | no log |
| C18 | diff check | PASS | `gates/C18-diff-check.log` |

## Desktop workflows

| Workflow | Status |
| --- | --- |
| lossless | PASS (15/15) |
| smoke | PASS (5/5) |
| regression | FAIL (stable native PDF ready timeout) |
| p0s | NOT RUN |
| Chinese/Japanese IME | PENDING-MANUAL (7.3) |
| visual/focus/a11y | PENDING-MANUAL (later P4B) |

## Evidence policy

- Every command records command, UTC start/end, exit and raw output in its own log.
- Any failure seals this run; no logs are overwritten.
- Final fresh independent review is required before commit.

## AI conclusion / Human / Program

- AI gate: FAIL
- Human acceptance: PENDING-MANUAL for later P4B substrate candidate
- Program decision: NOT STARTED; 7.2a does not grant `P4B-SUBSTRATE-GO`
