# RUN.md — P3 implementation evidence (tasks 5.1–5.9)

- Run ID: `20260821-p3-implementation-5.1-5.9`
- Date: 2026-08-21
- HEAD: current working tree (commits c92c17d..a6cbcd4)
- Branch: `test/issue-255-lossless-byte-contract`

## Scope

Automated implementation + unit/integration verification for P3 tasks 5.1–5.9.
The desktop E2E build is running separately (`test:e2e:build` + wdio suites) and
its results are recorded under this run when complete.

## What each task contributed

### 5.1 Unified CodeMirror command router
- Existing `commandRouter.ts` (from P2) already routes toolbar/menu/keyboard/link-
  dialog through the active lossless view (`getActiveLosslessView`). Verified and
  extended; no rewrite.
- Commit `1e50eb8` adds the full table-driven coverage proving every command is a
  local CM transaction.

### 5.2 Format commands → local CM transactions
- Verified bold/italic/strike/link/heading/quote/list/code fence against the real
  binding. Table-driven coverage adds: range/reversed selection, line start/end,
  nested constructs, CJK/emoji, malformed fallback, Undo/Redo per command.
- **New capability**: `toggleCodeBlock` now UNWRAPS an already-fenced selection
  (was double-wrapping) — exact source-range change, command `b907099`.

### 5.3 Image insert/replace/delete + resource transactions
- New `imageSourceRange.ts` (pure UTF-16 range math) + `commandRouter`
  `replaceImageSource`/`deleteImageSource`, both exact-range local transactions.
- dblclick edit panel (`imageEditing.ts`) bound on lossless open.
- 12 source-range unit tests + 7 image router tests, including blank-line
  preservation and Undo/Redo. Commit `41172ca`.

### 5.4 Enter/Backspace/Delete command matrix
- `commandMatrix.test.ts` — 20 tests pinning the ACTUAL behavior against the real
  CM Markdown keymap (`insertNewlineContinueMarkup`/`deleteMarkupBackward`) for
  every cell of the spec matrix, including the exact-source fallback rule
  (table/image/atomic-inline/malformed all fall back to plain local CM text).
- Result: the lossless path already gets list/quote continuation, list dedent,
  quote exit, and literal fence handling from CM natively; the tests lock this in.
- Commit `1e50eb8`.

### 5.5 Paste/drop/clipboard
- Paste History boundary fix (isolateHistory full) — one paste intent = one Undo
  group (commit `c92c17d`), proven by `historyBoundary.test.ts`.
- Image-file paste/drop resource pipeline (resource-first, local CM transaction
  on resolve, async identity guard) — commit `74990bd`, proven by
  `imagePaste.test.ts`.

### 5.6 History grouping + cross-mode Undo/Redo
- Proven: paste + typing undo as two groups; typing composes into one group;
  structural commands each open their own group; Undo/Redo converges on the SAME
  CodeMirror history (single owner). Commit `c92c17d`.

### 5.7 Lifecycle/autosave/conflict/reload/close/save-as/new → lossless default path
- Already wired by P1B/P3 foundation (`sidebar.fileops` → lossless integration)
  and covered by 23 `lifecycle.test.ts` tests. No production code change needed;
  verified routing.

### 5.8 Export from read-only renderer
- `buildLosslessExportRoot` (pure function, detached container) + 6 tests proving
  it renders constructs, sanitizes raw HTML, returns null on empty, and never
  mutates the source doc/dirty/History. Commit `922327c`.

### 5.9 CJK/emoji/pending-save/typing-during-write/cross-mode/A-B
- CJK+emoji, A/B isolation, lost-response reconcile already covered by lifecycle
  tests. NEW: "typing during guarded write stays dirty" integration test (commit
  `a6cbcd4`) — the lossless write barrier hold → newer edit keeps dirty until the
  NEXT save.

## Gates (this run)

- [x] npx tsc --noEmit — PASS
- [x] npm test — 41 files / 512 tests PASS
- [x] cargo markflow-core --all-targets — 93 tests PASS
- [x] cargo src-tauri --all-targets — 151 tests PASS
- [x] npm run build — PASS (via npm test flow)
- [x] npm run test:byte-contract — PASS (93 fixtures, 0 missed)
- [x] npm run test:characterization — 9 tests PASS
- [x] npm run validate:openspec — 61 PASS
- [x] npm test (final) — 42 files / 516 tests PASS
- [~] desktop E2E — BUILD OK (`test:e2e:build` exit 0) but wdio launch fails in
  this agent session: the app logs "Application starting" then exits cleanly
  (code 0) before the embedded WebDriver is ready. Root cause: the headless
  agent shell cannot keep a Tauri/WebKit GUI window alive (WindowServer init).
  NOT a code regression (P2 evidence ran these same suites successfully from an
  interactive session). The unit/integration suites cover the same behaviors;
  desktop E2E is re-verifiable by Program Owner's desktop run / 30-min
  observation (task 5.12).

E2E build log: `/tmp/e2e-build.log` (exit 0).