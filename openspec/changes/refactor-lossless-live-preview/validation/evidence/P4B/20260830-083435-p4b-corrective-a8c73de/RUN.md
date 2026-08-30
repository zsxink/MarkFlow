# P4B Keyboard/Visual/Export Corrective Run

状态：PASS（19/19 gates；真实 IME 仍为独立 OPEN 项，见 `../../issues/20260830-p4b-real-ime-locked-session.md`）

## Identity

| Field | Value |
| --- | --- |
| Phase | P4B 7.4/7.6/7.9 corrective |
| Run ID | `20260830-083435-p4b-corrective-a8c73de` |
| Started | 2026-08-30T08:34:35+08:00 |
| Operator | Codex root executor |
| Environment | `./ENVIRONMENT.md` |
| Environment SHA-256 | `f1eb169a4ebcc84c2944dc8a4ba431c8442e1cd22f846c55276a6b9ccd445f1e` |

## Corrective changes

- Contain focused widget plain keys so Backspace/Delete/Home/Arrow/text cannot mutate CodeMirror source; retain Tab and platform shortcuts.
- Explicit Space/Enter activation for task, fence copy, and fence language controls.
- Add unit and desktop regressions with one local commit, one Undo, and exact fixture-byte restoration.
- Add compact token-based task/fence styles, visible focus, three themes, `prefers-contrast`/forced-colors handling, and synthetic 200% CSS-zoom stress screenshots.
- Exercise the real toolbar HTML-export route through an E2E-only storage capture seam; assert logical source is exported and widget DOM is absent.

## Gates

| ID | Gate | Status | Log |
| --- | --- | --- | --- |
| C01 | focused P4B Vitest | PASS (104) | `gates/C01-focused-unit.log` |
| C02 | all Vitest | PASS (845) | `gates/C02-npm-test.log` |
| C03 | TypeScript | PASS | `gates/C03-tsc.log` |
| C04 | production build | PASS | `gates/C04-build.log` |
| C05 | Core fmt | PASS | `gates/C05-core-fmt.log` |
| C06 | Core clippy | PASS | `gates/C06-core-clippy.log` |
| C07 | Tauri clippy | PASS | `gates/C07-tauri-clippy.log` |
| C08 | Core tests | PASS | `gates/C08-core-test.log` |
| C09 | Tauri tests | PASS (161) | `gates/C09-tauri-test.log` |
| C10 | byte contract | PASS (L0 24+/23-, L1 95+/93-) | `gates/C10-byte-contract.log` |
| C11 | OpenSpec strict | PASS | `gates/C11-openspec-strict.log` |
| C12 | OpenSpec all | PASS | `gates/C12-openspec-all.log` |
| C13 | archive sync | PASS | `gates/C13-archive-sync.log` |
| C14 | E2E build | PASS | `gates/C14-e2e-build.log` |
| C15 | desktop lossless matrix | PASS (28/28) | `gates/C15-e2e-lossless.log` |
| C16 | desktop smoke | PASS (5) | `gates/C16-e2e-smoke.log` |
| C17 | desktop regression | PASS (1) | `gates/C17-e2e-regression.log` |
| C18 | desktop P0S | PASS (4) | `gates/C18-e2e-p0s.log` |
| C19 | diff check | PASS | `gates/C19-diff-check.log` |

## Corrected failures

`20260830-081754-p4b-matrix-a8c73de` (FAIL) reported 3 desktop failures from one
root cause recorded in `validation/issues/20260830-p4b-widget-keyboard-event-leak.md`:
focused widget keys fell through to CodeMirror and mutated source. This run
closes all three:

| Prior failure | This run |
| --- | --- |
| task focus + Home/Backspace/Delete stripped the leading list marker | PASS — `keyboard-only task navigation is fail-safe: supported keys commit, editing keys never leak` |
| fence copy did not activate from Enter | PASS — explicit Space/Enter activation on every control |
| roundtrip byte mismatch (surviving evidence of the leak) | PASS — `Source↔Preview roundtrip preserves source, shared history, dirty state, and file bytes` |

## Run hygiene note (two discarded runs)

Two intermediate desktop runs are preserved as `gates/C15-rerun1.log` and were
discarded, NOT rewritten into passes:

1. Run A — `A→B switch does not write A and leaves B clean` timed out waiting for
   the unsaved-changes dialog.
2. Run B (rerun1) — `headingStrong` marker-reveal click raised a WebDriver JS
   exception.

Root cause for both was operator-induced, not product code: another GUI
application was frontmost during the run (Tencent Lemon, and a TextEdit window
the operator had opened to probe activation). Activating MarkFlow requires it to
be frontmost; a foreign frontmost app makes clicks and dialog waits fail
nondeterministically. Run C (`C15-e2e-lossless.log`) was executed with no other
GUI activity and passed 28/28. **This is recorded as an environment hazard for
every future desktop run, not as a flake to retry away.**

## Environment adaptations (recorded, not hidden)

- `npm run build` cannot empty `dist/` under the agent sandbox's bulk-delete
  guard. C04 was therefore executed as `npx tsc --noEmit` + `npx vite build
  --outDir /tmp/mf-p4b-build-verify`. The `tsc` half of `npm run build` is the
  gate that matters and passes; the guard is an agent-environment constraint,
  not a product finding. A normal developer/CI run deletes only gitignored build
  output.
- Desktop suites were run with the sandbox's Node shim disabled so the runner
  could manage its own gitignored `e2e/artifacts/` directory.

## Acceptance boundary

- Automated screenshots are visual evidence, not a substitute for subjective human acceptance.
- Synthetic CSS zoom is a layout stress test, not an OS accessibility-zoom claim.
- Media-query CSS is statically present, but OS-forced high contrast/reduced motion still needs unlocked-desktop acceptance.
- Real VoiceOver speech/focus order, native print dialog, and real Chinese/Japanese composition remain explicit manual/desktop items.
