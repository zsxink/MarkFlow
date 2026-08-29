# P2 desktop projection observation race

- Severity: Functional test-harness flake (no product data loss)
- Run: `evidence/P4B/20260830-050013-p4b-6432059/`
- Command: `node e2e/run.mjs lossless`
- Result: 14 tests passed; all five P4B semantic cases passed; one pre-existing P2 projection assertion failed
- Observed failure: `decorations()[cls]` was zero for at least one expected class immediately after a toolbar click
- Visual evidence: the captured WebKit screenshot already shows headings, inline constructs, link, quote, list and fence projected while the assertion reports its stale semantic snapshot
- Root cause: the test sampled the asynchronous projection rebuild without waiting for `projectionState() === 'rendered'` and the complete expected count set
- Corrective action: switch preview through the existing lossless semantic hook; wait for rendered state and all expected semantic counts before final assertions
- Product behavior: unchanged
- Status: CLOSED — final run `../evidence/P4B/20260830-064651-p4b-6432059/` passed C14 15/15 and C00–C18.
