# P6 M1 corrective immutable environment snapshot

| Field | Measured value |
| --- | --- |
| Recorded at | 2026-08-30T18:12:35+0800 |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` (Program Owner branch exception recorded in GOAL) |
| Start commit | `8ba0f44bbe4cd231f210216ba222e22646af96f1` |
| Candidate state | Committed corrective commit `4f010c3` on top of M1 candidate `6557c06`. The ONLY change vs the candidate is `src/lib/lossless/projection.test.ts` — `EditorView` import changed from `import type` to value import. This corrects Reviewer blocker Q1 (tsc TS1361 + runtime `ReferenceError: EditorView is not defined`). User-supplied `validation/GOAL-executor-typora-complete.md` remains untracked and excluded. |
| OS | macOS 26.5.2 (Build 25F84), Darwin 25.5.0 arm64 |
| Host | macOS desktop (Program Owner machine) |
| WebView / SafariDriver | WebKit 605.1.15 (Safari 26.5.2) |
| Node | v22.22.2 |
| npm | 10.9.7 |
| TypeScript | 5.9.3 |
| Vite | 5.4.21 |
| Vitest | 2.1.9 |
| CodeMirror state/view/markdown | ^6.6.0 / ^6.43.0 / ^6.5.0 |
| Rust | rustc 1.96.0 (ac68faa20 2026-05-25) |
| Cargo | 1.96.0 (30a34c682 2026-05-25) |
| Tauri CLI/API | 2.11.3 / 2.11.0 |
| OpenSpec | 1.6.0 |
| Feature flags | P6 `livePreview.heading` + `livePreview.heading.hidden` and `livePreview.thematicBreak` + `livePreview.thematicBreak.hidden` default OFF; tests explicitly turn them ON per case and restore OFF. Paragraph has no marker (trivially in M1 scope, no flag). Non-P6 constructs remain P4B-only (visible/dimmed/revealed). |
| Input method | Not exercised in automated unit gates; real Chinese/Japanese IME is a PENDING-MANUAL desktop item (9.3 cohort matrix 9.8, E1–E4 evidence grade). |
| Screen reader | Not exercised in automated unit gates; desktop a11y remains a PENDING-MANUAL item. |
| Display scaling/theme | Three product themes + synthetic zoom exercised by the lossless desktop suite (passed); not separately recorded here. |

## Dirty status at run start

```text
 M src/lib/lossless/projection.test.ts   (corrective fix, committed as 4f010c3 during this run)
?? openspec/changes/refactor-lossless-live-preview/validation/GOAL-executor-typora-complete.md (excluded)
?? openspec/changes/refactor-lossless-live-preview/validation/evidence/P6/20260830-173622-p6-m1-8ba0f44/REVIEW.md (initial FAIL review, untracked, excluded from this run)
```

> This is a CORRECTIVE run for `20260830-173622-p6-m1-8ba0f44`. The sealed run is NOT rewritten (evidence immutability). The blocker Q1 was a test-only defect (type-import used as value); production `projection.ts` was already correct. Gates C01–C03 / C11 / C08 / C10 are re-captured here no-cache to prove the fix; Rust (C04–C07) and desktop E2E (C13/C14) are unchanged vs the sealed run because production Rust/TS logic was untouched.

## Safety and isolation

- All automated tests use repository fixtures or generated temporary directories.
- No user Markdown document is opened or modified.
- No credentials, tokens, account data, or network secrets are required.
- Desktop runs use the repository's embedded WebDriver/SafariDriver path and isolated E2E fixtures.
- Build/cleanup bulk-deletes (`dist/`, `e2e/.tmp`) run with `CODEBUDDY_SAFE_DELETE_ENABLED=0`; `dist/` is gitignored and `e2e/.tmp` is test temp. This is an environment safety-shim bypass for legitimate build artifacts, not a product behavior.
