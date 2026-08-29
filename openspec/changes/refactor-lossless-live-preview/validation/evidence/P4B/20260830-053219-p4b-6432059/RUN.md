# Validation Run Record — P4B task 7.2a final corrective candidate

状态：FAIL (sealed; P0S test opened A without waiting for active binding)

| Field | Value |
| --- | --- |
| Phase | P4B task 7.2a |
| Run ID | `20260830-053219-p4b-6432059` |
| Date/time | 2026-08-30T05:32:19+0800 |
| Operator | Codex main `/root` |
| Branch / start | `test/issue-255-lossless-byte-contract` / `6432059d29455ee8a4b7a4515ffff3aab371e2d0` |
| Immutable environment | `./ENVIRONMENT.md` |
| Environment SHA-256 | `f5d8bd991178a93173cb44b08e408cd95f72de0ee6045f18a85ec378af0a93df` |

## Gate matrix

| ID | Gate | Status | Log |
| --- | --- | --- | --- |
| C00 | P4B fixture Node test | PASS | `gates/C00-p4b-fixtures.log` |
| C01 | focused Vitest | PASS (238) | `gates/C01-focused-vitest.log` |
| C02 | all Vitest | PASS (826) | `gates/C02-npm-test.log` |
| C03 | TypeScript | PASS | `gates/C03-tsc.log` |
| C04 | production build | PASS | `gates/C04-build.log` |
| C05 | Core rustfmt | PASS | `gates/C05-core-fmt.log` |
| C06 | Core clippy | PASS | `gates/C06-core-clippy.log` |
| C06b | Tauri clippy (PDF/Core bridge) | PASS | `gates/C06b-tauri-clippy.log` |
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
| C17 | desktop p0s | FAIL (3 passed, 1 harness race) | `gates/C17-e2e-p0s.log` |
| C18 | diff check | PASS | `gates/C18-diff-check.log` |

Each gate records command, UTC start/end, exit and raw output in its own immutable log. Any failure seals this run.

## Acceptance boundary

- 7.2a code/contract and all automated desktop regression gates are in scope.
- Real Chinese/Japanese IME remains 7.3; visual/focus/a11y remain later P4B human evidence.
- A fresh independent reviewer must pass before commit.

## Conclusion

- AI gate: FAIL
- Human acceptance: PENDING-MANUAL for later P4B substrate candidate
- Program decision: NOT STARTED; this checkpoint does not grant `P4B-SUBSTRATE-GO`
