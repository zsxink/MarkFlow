# Validation Run — P4B 7.2a final candidate

状态：REVIEW-FAIL（已封存；自动化通过但独立审查发现生命周期竞态）

| Field | Value |
| --- | --- |
| Run ID | `20260830-060711-p4b-6432059` |
| Environment | `./ENVIRONMENT.md` |
| Environment SHA-256 | `d1b99e12b5d5f05d3ac426871ccad72eef5e95d27428d5a90729fb5e4e06b63e` |
| Operator | `/root` |

| ID | Gate | Status | Log |
| --- | --- | --- | --- |
| C00 | P4B fixture Node | PASS (1) | `gates/C00-p4b-fixtures.log` |
| C01 | focused Vitest | PASS (238) | `gates/C01-focused-vitest.log` |
| C02 | all Vitest | PASS (830) | `gates/C02-npm-test.log` |
| C03 | TypeScript | PASS | `gates/C03-tsc.log` |
| C04 | build | PASS | `gates/C04-build.log` |
| C05 | Core rustfmt | PASS | `gates/C05-core-fmt.log` |
| C06 | Core clippy | PASS | `gates/C06-core-clippy.log` |
| C06b | Tauri clippy | PASS | `gates/C06b-tauri-clippy.log` |
| C07 | Core tests | PASS (96 total) | `gates/C07-core-test.log` |
| C08 | Tauri tests | PASS (161) | `gates/C08-tauri-test.log` |
| C09 | byte contract | PASS (L0 24+/23-; L1 95+/93-) | `gates/C09-byte-contract.log` |
| C10 | OpenSpec strict | PASS | `gates/C10-openspec-strict.log` |
| C11 | OpenSpec all | PASS (61) | `gates/C11-openspec-all.log` |
| C12 | archive sync | PASS | `gates/C12-archive-sync.log` |
| C13 | E2E build | PASS | `gates/C13-e2e-build.log` |
| C14 | desktop lossless | PASS (15) | `gates/C14-e2e-lossless.log` |
| C15 | desktop smoke | PASS (5) | `gates/C15-e2e-smoke.log` |
| C16 | desktop regression | PASS (2 validated PDFs) | `gates/C16-e2e-regression.log` |
| C17 | desktop p0s | PASS (4) | `gates/C17-e2e-p0s.log` |
| C18 | diff check | PASS | `gates/C18-diff-check.log` |

Each log is immutable raw output. The independent review found a blocking lifecycle race after all automated gates passed, so this run is sealed and must not be reused as release evidence. See `REVIEW.md`.

- AI gate: FAIL — transition guard ends after the discard decision instead of covering the complete asynchronous document switch; overlapping transitions can also clear a shared boolean prematurely
- Human acceptance: PENDING-MANUAL (later P4B)
- Program decision: NOT STARTED; no `P4B-SUBSTRATE-GO`
