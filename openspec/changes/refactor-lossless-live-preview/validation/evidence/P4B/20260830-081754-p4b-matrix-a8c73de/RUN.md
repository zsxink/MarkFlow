# P4B 7.9 Expanded Matrix Corrective Run

状态：FAIL（corrective required；历史 run 已封存）

## Identity

| Field | Value |
| --- | --- |
| Phase | P4B |
| Run ID | `20260830-081754-p4b-matrix-a8c73de` |
| Started | 2026-08-30T08:17:54+08:00 |
| Operator | Codex root executor |
| Branch / base | `test/issue-255-lossless-byte-contract` / `a8c73de` |
| Environment | `./ENVIRONMENT.md` |
| Environment SHA-256 | `d5a4622ce3dd52daaeb8a79a0add179e299670c78b5a85b74ec52fc8246a694f` |

## Corrective scope

Supersedes the desktop-matrix coverage of `20260830-080554-p4b-widgets-a8c73de` without rewriting that historical run. Adds keyboard-only/focus/a11y DOM semantics, Source↔Preview/shared-History/dirty/bytes, three-theme + 200% zoom observability, media-query observability, projection dispose/recreate, and flag cleanup. Real OS IME, screen-reader speech output, OS-forced contrast/motion, subjective visual quality, and export/print source selection remain explicit acceptance items.

## Gates

| ID | Gate | Status | Log |
| --- | --- | --- | --- |
| C01 | focused P4B Vitest | PASS (279) | `gates/C01-focused-unit.log` |
| C02 | all Vitest | PASS (843) | `gates/C02-npm-test.log` |
| C03 | TypeScript | PASS | `gates/C03-tsc.log` |
| C04 | production build | PASS | `gates/C04-build.log` |
| C05 | Core fmt | PASS | `gates/C05-core-fmt.log` |
| C06 | Core clippy | PASS | `gates/C06-core-clippy.log` |
| C07 | Tauri clippy | PASS | `gates/C07-tauri-clippy.log` |
| C08 | Core tests | PASS | `gates/C08-core-test.log` |
| C09 | Tauri tests | PASS (161) | `gates/C09-tauri-test.log` |
| C10 | byte contract | PASS (L0 24+/23-; L1 95+/93-) | `gates/C10-byte-contract.log` |
| C11 | OpenSpec strict | PASS | `gates/C11-openspec-strict.log` |
| C12 | OpenSpec all | PASS (61) | `gates/C12-openspec-all.log` |
| C13 | archive sync | PASS | `gates/C13-archive-sync.log` |
| C14 | E2E build | PASS | `gates/C14-e2e-build.log` |
| C15 | desktop lossless expanded matrix | **FAIL (24 pass / 3 fail)** | `gates/C15-e2e-lossless.log`, `failures/` |
| C16 | desktop smoke | NOT RUN after C15 fail | — |
| C17 | desktop regression/export | NOT RUN after C15 fail | — |
| C18 | desktop P0S | NOT RUN after C15 fail | — |
| C19 | diff check | PASS | `gates/C19-diff-check.log` |

## Decision boundary

- AI gate: **FAIL / NO-GO**. The expanded matrix found focused widget keys could mutate source and fence Enter did not activate copy. The later byte mismatch was the surviving evidence of the task-key leak, not a harmless Buffer comparison.
- Issue: `validation/issues/20260830-p4b-widget-keyboard-event-leak.md`.
- Failure screenshots and redacted desktop logs: `failures/`.
- Corrective candidate: new run required; this run is not rewritten after the fix.
- Independent reviewer/human/Program decision: NOT STARTED for this failed candidate.
- Task 7.3 and substrate/item GO decisions remain open.
