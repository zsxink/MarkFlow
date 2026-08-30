# P6 M1 immutable environment snapshot

| Field | Measured value |
| --- | --- |
| Recorded at | 2026-08-30T17:36:22+0800 |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` (Program Owner branch exception recorded in GOAL) |
| Start commit | `8ba0f44bbe4cd231f210216ba222e22646af96f1` |
| Candidate state | Uncommitted P6 M1 diff (substrate 9.1/9.2 + cohort M1 heading/thematic break); user-supplied `validation/GOAL-executor-typora-complete.md` remains untracked and excluded |
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
 M src/lib/lossless/projection.test.ts
 M src/lib/lossless/projection.ts
 M src/lib/lossless/renderOwnerRegistry.test.ts
 M src/lib/lossless/renderOwnerRegistry.ts
 M src/styles/editor.css
?? openspec/changes/refactor-lossless-live-preview/validation/GOAL-executor-typora-complete.md (excluded)
?? src/lib/lossless/livePreviewFlags.ts
```

## Safety and isolation

- All automated tests use repository fixtures or generated temporary directories.
- No user Markdown document is opened or modified.
- No credentials, tokens, account data, or network secrets are required.
- Desktop runs use the repository's embedded WebDriver/SafariDriver path and isolated E2E fixtures.
- Build/cleanup bulk-deletes (`dist/`, `e2e/.tmp`) run with `CODEBUDDY_SAFE_DELETE_ENABLED=0`; `dist/` is gitignored and `e2e/.tmp` is test temp. This is an environment safety-shim bypass for legitimate build artifacts, not a product behavior.
