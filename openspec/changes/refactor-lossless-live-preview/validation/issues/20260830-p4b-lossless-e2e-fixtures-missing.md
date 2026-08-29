# P4B lossless E2E fixtures missing

- Severity: Functional test-harness blocker (no product data loss)
- Run: `evidence/P4B/20260830-043642-p4b-6432059/`
- Command: `node e2e/run.mjs lossless`
- Result: 10 lifecycle/live-preview tests passed; all 5 P4B reveal tests failed waiting for their file-tree item
- Missing files: `p4b-cohort-heading.md`, `p4b-cohort-emoji.md`, `p4b-cohort-link.md`, `p4b-cohort-quote.md`, `p4b-cohort-fence.md`
- Root cause: the lossless fixture setup in `e2e/run.mjs` creates P2 and byte-contract files but not the five files named by `p4b-cohort-reveal.e2e.mjs`
- Corrective action: add deterministic isolated fixture creation with content matching each E2E offset/assertion; do not increase timeouts
- Product assertion status: NOT RUN because the files were absent; no structure-command assertion failed
- Status: CLOSED — final run `../evidence/P4B/20260830-064651-p4b-6432059/` passed C00 fixture generation and C14 15/15.
