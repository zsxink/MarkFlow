# P0S A→B test types before A binding is active

- Severity: Lifecycle test-harness race (no demonstrated product data loss)
- Run: `evidence/P4B/20260830-053219-p4b-6432059/`
- Command: `node e2e/run.mjs p0s`
- Result: 3 passed; A→B case timed out waiting for an unsaved-changes dialog
- Root cause: the test calls `openFileInTree(A)` and immediately types through the global active-binding hook, although its own `openFileAndWaitActive` helper documents that the tree click starts an asynchronous read/open and early input targets the previous document
- Corrective action: wait for A path and binding, dispatch the edit, wait for semantic dirty, then click B; retain discard and A-byte assertions and add B-active/B-not-contaminated checks
- Constraint: no fixed sleep and no weaker dialog/data-integrity expectations
- Harness correction outcome: run `20260830-054951-p4b-6432059` correctly dirtied A and displayed the discard dialog, but while the dialog was awaiting the choice the 2-second autosave wrote `Y# Title` to A. This reveals a product lifecycle race rather than another binding race.
- Product corrective action: make the dirty/conflict transition decision window mutually exclusive with new autosave ticks; always release the guard on save/discard/cancel/error, while allowing the dialog's explicit manual Save branch.
- Unit harness correction: run `20260830-060325-p4b-6432059` exposed that `main.autosave.test.ts` mocked `./components/sidebar` without the new query export. The mock now defaults it to false and directly covers the true/skip branch; full Vitest is 51 files / 830 tests green outside the sealed run.
- Status: OPEN until the lifecycle guard and a fresh immutable C00–C18 run pass
- Closure: CLOSED — final run `../evidence/P4B/20260830-064651-p4b-6432059/` passed the corrected binding wait and complete click-to-open transition guard; C17 is 4/4 and the fresh reviewer found no lifecycle blocker.
