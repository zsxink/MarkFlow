# RUN.md — P3 corrective candidate after independent-review findings F2/F3

- Run ID: `20260821-p3-corrective-reviewer-f2f3-703ebcf`
- Date: 2026-08-21
- Candidate commit: `703ebcf4953d086d622b096b9f1539a6760f5eb4`
- Branch: `test/issue-255-lossless-byte-contract`
- Purpose: fix the independent reviewer's F2 + F3 findings and re-freeze for a
  fresh independent review. F1 (candidate 610f027 failed tsc on an unused var)
  was already fixed in `3f078c9`.

## Findings disposition

### F1 (already fixed at 3f078c9)
- `flagRollback.test.ts` unused `MODULE_CACHE` — removed; tsc passes at HEAD.

### F2 — `clearActiveDocument()` touched hidden PM on lossless doc (FIXED)
- `src/components/activeDocument.ts` `clearActiveDocument()` now checks
  `isLosslessCoreSessionEnabled() && getActiveLosslessBinding()`: when a lossless
  binding is active it disposes the binding via the integration module
  (`closeLosslessActiveDocument`) instead of calling `setMarkdown('')` on the
  hidden ProseMirror. The `else` branch (legacy) keeps the original behavior.
- Test: `activeDocument.test.ts` adds "does NOT touch the hidden ProseMirror when
  clearing a lossless doc (reviewer F2)".

### F3 — image edit panel re-resolved from shifted selection head (FIXED)
- `src/lib/lossless/imageEditing.ts` `showImageEditPanel` now receives the
  `ImageSourceRange` CAPTURED at the dblclick (`posAtCoords`) instead of
  re-resolving from `selection.main.head` on confirm/delete. The delet control
  targets the captured `range.start..range.end` directly.

## Gates (current HEAD 703ebcf)

- [x] npx tsc --noEmit — PASS
- [x] npm test — 42 files / 517 tests PASS
- [x] npm run build — PASS
- [x] byte-contract (re-run) — PASS

## Re-review

A fresh independent reviewer (no implementation involvement) is being dispatched
against this candidate with the same six focus points + re-gates. Its verdict +
REVIEW file land in this run dir.