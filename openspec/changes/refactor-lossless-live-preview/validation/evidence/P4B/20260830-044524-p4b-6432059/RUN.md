# Validation Run Record — P4B task 7.2a final corrective

状态：FAIL (sealed; superseded by a fresh corrective run)

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P4B task 7.2a |
| Run ID | `20260830-044524-p4b-6432059` |
| Date/time | 2026-08-30T04:45:24+0800 |
| Agent/operator | Codex main `/root` |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` (GOAL exception) |
| Start commit | `6432059d29455ee8a4b7a4515ffff3aab371e2d0` |
| Predecessor failures | rustfmt C05; lossless E2E missing-fixture C14 — both preserved |
| Immutable environment | `./ENVIRONMENT.md` |
| Environment SHA-256 | `82b987e319f94fa16e7fd8569aebd73347212b8908d75ba33921c4ba435cae1d` |
| Flags | P4B cohorts default OFF; explicit test-only ON; no table widget |

## Scope

- Complete ADR-driven heading/list/quote source interaction harness, table P7 typed fixture contract, selection transport/Core retry evidence, and deterministic desktop fixture setup.
- No table widget implementation, P6 hidden-marker implementation, real IME, visual or a11y acceptance.

## Commands

| ID | Command | Status | Output |
| --- | --- | --- | --- |
| C00 | P4B E2E fixture contract Node test | PASS | `gates/C00-p4b-fixtures.log` |
| C01 | focused Vitest (4 files) | PASS (200) | `gates/C01-focused-vitest.log` |
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
| C14 | desktop lossless | FAIL (13 passed, 2 failed) | `gates/C14-e2e-lossless.log` |
| C15 | desktop smoke | NOT RUN (blocked by C14) | no log |
| C16 | desktop regression | NOT RUN (blocked by C14) | no log |
| C17 | desktop p0s | NOT RUN (blocked by C14) | no log |
| C18 | `git diff --check` | PASS | `gates/C18-diff-check.log` |

All commands record raw output, UTC start/end and exit separately.

## Fixtures and byte results

- C00 freezes five desktop fixture names/content/critical offsets.
- C09 will record canonical L0/L1 totals; C08 covers real dispatcher CRLF/CR/Mixed surviving spans and post-change UTF-16 selection.
- Table contract: 36 fixtures with typed ranges/actions, post-change cell points, history/undo, inherit provenance and CRLF/CR/Mixed raw append expectations.

## Desktop workflows

| Workflow | Expected | Status | Evidence |
| --- | --- | --- | --- |
| lossless | lifecycle/P2/P4B reveal all pass | FAIL (13/15 pass) | C14 |
| smoke | existing smoke remains green | NOT RUN | C15 |
| regression | existing regression remains green | NOT RUN | C16 |
| p0s | byte/lifecycle guard remains green | NOT RUN | C17 |
| Chinese/Japanese IME | deferred to 7.3 | PENDING-MANUAL | future run |
| visual/focus/a11y | deferred | PENDING-MANUAL | future P4B run |

## Failures and retries

- C14 heading case failed while clicking the toolbar WYSIWYG element with a WebDriver JavaScript exception. The P4B suite already has the real lossless `setMode` hook, so the corrective candidate will set and verify preview mode through that stable semantic surface.
- C14 fence case counted three DOM spans for one multiline CodeMirror mark. CodeMirror legitimately splits a single semantic decoration at line boundaries; the corrective assertion will use the existing semantic `decorations()` snapshot and keep a separate raw-source assertion.
- This run and all raw logs are sealed. The fixes and all gates will use a new run-id.

## Data and privacy

- Redaction: COMPLETE (generated fixture workspace only; no credentials observed)
- User documents: NONE
- Credentials/tokens: NONE
- Workspace: isolated generated E2E root

## Independent review

- Product/contract reviewer: fresh Sol `/root/review_p4b_7_2a_v4`, PASS before test-harness-only correction.
- E2E harness correction requires a final independent read after this run before commit.

## AI conclusion / Human / Program

- AI gate: FAIL
- Human acceptance: PENDING-MANUAL for later P4B substrate candidate
- Program decision: NOT STARTED; 7.2a checkpoint does not grant `P4B-SUBSTRATE-GO`
