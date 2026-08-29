# Validation Run Record — P4B task 7.2a semantic-E2E corrective

状态：FAIL (sealed; superseded by a fresh corrective run)

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P4B task 7.2a |
| Run ID | `20260830-050013-p4b-6432059` |
| Date/time | 2026-08-30T05:00:13+0800 |
| Agent/operator | Codex main `/root` |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` (GOAL exception) |
| Start commit | `6432059d29455ee8a4b7a4515ffff3aab371e2d0` |
| Predecessor failures | rustfmt; missing P4B fixtures; toolbar/DOM-span semantic assertions — all preserved |
| Immutable environment | `./ENVIRONMENT.md` |
| Environment SHA-256 | `6a521f6b57ea16027130ee0ccc57e0b4fd3d9105cb4d83b7c92d2c3af0b4427f` |
| Flags | P4B cohorts default OFF; explicit test-only ON; no table widget |

## Scope

- Complete ADR-driven heading/list/quote source interaction harness, table P7 typed fixture contract, selection transport/Core retry evidence, and deterministic desktop fixture setup.
- Correct the desktop reveal suite to use the lossless semantic mode and decoration hooks.
- No table widget implementation, P6 hidden-marker implementation, real IME, visual or a11y acceptance.

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
| C14 | desktop lossless | FAIL (14 passed, 1 failed) | `gates/C14-e2e-lossless.log` |
| C15 | desktop smoke | NOT RUN (blocked by C14) | no log |
| C16 | desktop regression | NOT RUN (blocked by C14) | no log |
| C17 | desktop p0s | NOT RUN (blocked by C14) | no log |
| C18 | `git diff --check` | PASS | `gates/C18-diff-check.log` |

All commands record raw output, UTC start/end and exit separately.

## Fixtures and byte results

- C00 freezes five desktop fixture names/content/critical offsets.
- C09 records canonical L0/L1 totals; C08 covers real dispatcher CRLF/CR/Mixed surviving spans and post-change UTF-16 selection.
- Table contract: 36 fixtures with typed ranges/actions, post-change cell points, history/undo, inherit provenance and CRLF/CR/Mixed raw append expectations.

## Desktop workflows

| Workflow | Expected | Status | Evidence |
| --- | --- | --- | --- |
| lossless | lifecycle/P2/P4B reveal all pass | FAIL (14/15 pass; all P4B pass) | C14 |
| smoke | existing smoke remains green | NOT RUN | C15 |
| regression | existing regression remains green | NOT RUN | C16 |
| p0s | byte/lifecycle guard remains green | NOT RUN | C17 |
| Chinese/Japanese IME | deferred to 7.3 | PENDING-MANUAL | future run |
| visual/focus/a11y | deferred | PENDING-MANUAL | future P4B run |

## Failures and retries

- All five corrected P4B desktop semantic cases passed.
- C14 failed the pre-existing P2 decoration test because it read `decorations()` immediately after a toolbar click; the failure screenshot shows the projected constructs already visible, demonstrating an observation race rather than missing projection behavior.
- The corrective candidate will switch through the semantic mode hook and wait for `projectionState() === 'rendered'` plus the expected semantic counts before asserting.
- This run and all raw logs are sealed; no retries are written into this run-id.

## Data and privacy

- Redaction: COMPLETE (generated fixture workspace only; no credentials observed)
- User documents: NONE
- Credentials/tokens: NONE
- Workspace: isolated generated E2E root

## Independent review

- Product/contract reviewer: fresh Sol `/root/review_p4b_7_2a_v4`, PASS before test-harness-only correction.
- E2E harness correction requires a final independent read after all gates pass and before commit.

## AI conclusion / Human / Program

- AI gate: FAIL
- Human acceptance: PENDING-MANUAL for later P4B substrate candidate
- Program decision: NOT STARTED; 7.2a checkpoint does not grant `P4B-SUBSTRATE-GO`
