# RUN.md — P3 final corrective candidate after reviewer N1

- Run ID: `20260821-p3-reviewer-final-70f314c`
- Date: 2026-08-21
- Candidate commit: `70f314cd8bb767d9ce40f4e87b3e9b60550faaab`
- Branch: `test/issue-255-lossless-byte-contract`
- Purpose: freeze the FINAL corrective candidate (F1/F2/F3/N1 resolved) for a
  fresh independent review.

## Findings disposition summary

| Finding | Disposition | Commit |
| --- | --- | --- |
| F1 (candidate 610f027 tsc unused var) | RESOLVED | `3f078c9` |
| F2 (clearActiveDocument touched hidden PM on lossless) | RESOLVED | `703ebcf` |
| F3 (image edit panel re-resolved from selection head) | RESOLVED | `703ebcf` |
| N1 (dirty lossless doc external-delete resaved via legacy getMarkdown) | RESOLVED | `70f314c` |

## N1 fix details

- `src/components/sidebar.conflict.ts` `restoreDeletedActiveDocument()` now,
  when a lossless binding is active, writes `binding.logicalText` (the truthful
  Core-aligned content) to the re-created path instead of `getMarkdown()` (which
  reads the hidden/empty PM or stale legacy source on a lossless doc). A named
  seam (`bindPersistedAfterResave`) keeps the path symmetric.
- Tests: `sidebar.conflict.test.ts` adds two cases — a dirty lossless doc resaves
  the binding logical text (asserting `writeFile` received it, not `getMarkdown`
  output), a dirty legacy doc still uses `getMarkdown()`.

## Gates (current HEAD)

- [x] npx tsc --noEmit — PASS
- [x] npm test — 42 files / 519 tests PASS
- [x] npm run build — PASS
- [x] npm run test:byte-contract — PASS (0 missed)

## Re-review

A fresh independent reviewer is dispatched against this candidate with the six
focus points + all three corrective findings (F1/F2/F3) + N1, and re-gates.