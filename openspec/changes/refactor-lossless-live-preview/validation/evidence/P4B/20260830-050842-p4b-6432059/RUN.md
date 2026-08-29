# Validation Run Record — P4B task 7.2a projection-observation corrective

状态：FAIL (sealed; superseded by a fresh corrective run)

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P4B task 7.2a |
| Run ID | `20260830-050842-p4b-6432059` |
| Date/time | 2026-08-30T05:08:42+0800 |
| Agent/operator | Codex main `/root` |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` (GOAL exception) |
| Start commit | `6432059d29455ee8a4b7a4515ffff3aab371e2d0` |
| Immutable environment | `./ENVIRONMENT.md` |
| Environment SHA-256 | `860eaddb1f8b635276c57f3724c6c9bdb916978a053aa88b81a51ef1bbffc5fc` |
| Flags | P4B cohorts default OFF; explicit test-only ON; no table widget |

## Scope

- 7.2a structural interaction, table P7 fixture contract, selection transport/Core retry, and deterministic desktop semantic coverage.
- No table widget, P6 hidden-marker implementation, real IME, visual or a11y acceptance.

## Commands

| ID | Command | Status | Output |
| --- | --- | --- | --- |
| C00 | P4B E2E fixture contract Node test | PASS | `gates/C00-p4b-fixtures.log` |
| C01 | focused Vitest (4 files) | PASS (238) | `gates/C01-focused-vitest.log` |
| C02 | `npm test` | PASS (826) | `gates/C02-npm-test.log` |
| C03 | `npx tsc --noEmit` | PASS | `gates/C03-tsc.log` |
| C04 | `npm run build` | PASS | `gates/C04-build.log` |
| C05 | Core rustfmt check | PASS | `gates/C05-core-fmt.log` |
| C06 | Core clippy `-D warnings` | PASS | `gates/C06-core-clippy.log` |
| C07 | Core cargo test | PASS (96) | `gates/C07-core-test.log` |
| C08 | Tauri cargo test | PASS | `gates/C08-tauri-test.log` |
| C09 | byte contract | PASS | `gates/C09-byte-contract.log` |
| C10 | OpenSpec strict | PASS | `gates/C10-openspec-strict.log` |
| C11 | OpenSpec all | PASS (61) | `gates/C11-openspec-all.log` |
| C12 | archive sync gate | PASS | `gates/C12-archive-sync.log` |
| C13 | E2E build | PASS | `gates/C13-e2e-build.log` |
| C14 | desktop lossless | PASS (15/15) | `gates/C14-e2e-lossless.log` |
| C15 | desktop smoke | FAIL (4 passed, 1 failed) | `gates/C15-e2e-smoke.log` |
| C16 | desktop regression | NOT RUN (blocked by C15) | no log |
| C17 | desktop p0s | NOT RUN (blocked by C15) | no log |
| C18 | `git diff --check` | PASS | `gates/C18-diff-check.log` |

All commands record raw output, UTC start/end and exit separately.

## Desktop workflows

| Workflow | Expected | Status | Evidence |
| --- | --- | --- | --- |
| lossless | lifecycle/P2/P4B reveal all pass | PASS (15/15) | C14 |
| smoke | existing smoke remains green | FAIL (4/5 pass) | C15 |
| regression | existing regression remains green | NOT RUN | C16 |
| p0s | byte/lifecycle guard remains green | NOT RUN | C17 |
| Chinese/Japanese IME | deferred to 7.3 | PENDING-MANUAL | future run |
| visual/focus/a11y | deferred | PENDING-MANUAL | future P4B run |

## Failures and retries

- C14 is fully green: lifecycle, P2 and all five P4B desktop semantic cases passed.
- C15's editor-mode smoke assertion expected a fresh lossless document to begin in Source, but the product's explicit persisted preference contract defaults to Preview (`DEFAULT_MODE = 'preview'`). The test will explicitly switch to Source before editing, then switch back to Preview, preserving the intended round-trip coverage without asserting the wrong initial state.
- This run and all raw logs are sealed; no retries are written into this run-id.

## Data and privacy

- Redaction: COMPLETE (generated fixture workspace only; no credentials observed)
- User documents: NONE
- Credentials/tokens: NONE
- Workspace: isolated generated E2E root

## Independent review

- Product/contract reviewer V4: PASS before harness-only corrections.
- A fresh final reviewer will inspect all harness corrections and this run before commit.

## AI conclusion / Human / Program

- AI gate: FAIL
- Human acceptance: PENDING-MANUAL for later P4B substrate candidate
- Program decision: NOT STARTED; 7.2a checkpoint does not grant `P4B-SUBSTRATE-GO`
