# Smoke editor-mode test assumes obsolete Source default

- Severity: Regression test-harness blocker (no product data loss)
- Run: `evidence/P4B/20260830-050842-p4b-6432059/`
- Command: `node e2e/run.mjs smoke`
- Result: 4 tests passed; editor-mode test failed before editing because Source was not initially pressed
- Contract evidence: `src/lib/lossless/modePreference.ts` defines `DEFAULT_MODE = 'preview'` and persists the user's chosen mode across document switches/restarts
- Root cause: the smoke comment/assertion still claimed P3 default-on documents open in Source, contradicting the current preference contract
- Corrective action: explicitly enter and verify Source before editing, then enter and verify Preview; retain the same content-preservation assertion
- Product behavior: unchanged
- Status: CLOSED — final run `../evidence/P4B/20260830-064651-p4b-6432059/` passed C15 smoke 5/5.
