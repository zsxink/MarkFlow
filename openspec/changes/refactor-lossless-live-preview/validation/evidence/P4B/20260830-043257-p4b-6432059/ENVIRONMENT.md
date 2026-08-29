# P4B 7.2a immutable environment snapshot

| Field | Measured value |
| --- | --- |
| Recorded at | 2026-08-30T04:32:57+0800 |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` (Program Owner branch exception recorded in GOAL) |
| Start commit | `6432059d29455ee8a4b7a4515ffff3aab371e2d0` |
| Candidate state | Uncommitted task 7.2a diff; user-supplied `validation/GOAL-executor-typora-complete.md` remains untracked and excluded |
| OS | macOS 26.5.2 (Build 25F84), Darwin 25.5.0 arm64 |
| Host | `XianMac.local` |
| WebView / SafariDriver | WebKit / Safari 26.5.2 (21624.2.5.11.8) |
| Node | v24.17.0 |
| npm | 12.0.2 |
| TypeScript | 5.9.3 |
| Vite | 5.4.21 |
| Vitest | 2.1.9 |
| CodeMirror state/view/markdown | 6.6.0 / 6.43.0 / 6.5.0 |
| Rust | rustc 1.96.0 (ac68faa20 2026-05-25) |
| Cargo | 1.96.0 (30a34c682 2026-05-25) |
| Tauri CLI/API | 2.11.3 / 2.11.0 |
| OpenSpec | 1.6.0 |
| Feature flags | P4B `headingStrong` and `quoteLists` default OFF; tests explicitly turn them ON per case and restore OFF. No table widget flag/registration is introduced. |
| Input method | Not exercised in 7.2a; real Chinese/Japanese IME is task 7.3 |
| Screen reader | Not exercised in 7.2a; desktop a11y remains later P4B evidence |
| Display scaling/theme | Not material to source-command slice; not recorded |

## Dirty status at run start

```text
 M markflow-core/src/session.rs
 M src-tauri/src/dispatcher_contract.rs
 M src-tauri/src/lossless/dto.rs
 M src-tauri/src/lossless/mod.rs
 M src/lib/lossless/commandRouter.test.ts
 M src/lib/lossless/editorSurfaceBinding.ts
 M src/lib/lossless/losslessSourceEditor.ts
 M src/lib/lossless/sourceSyncController.test.ts
 M src/lib/lossless/sourceSyncController.ts
 M src/lib/lossless/widgets/protocol.ts
?? openspec/changes/refactor-lossless-live-preview/validation/GOAL-executor-typora-complete.md
?? src/lib/lossless/structuralInteraction.test.ts
?? src/lib/lossless/structuralInteraction.ts
```

## Safety and isolation

- All automated tests use repository fixtures or generated temporary directories.
- No user Markdown document is opened or modified.
- No credentials, tokens, account data, or network secrets are required.
- Desktop runs use the repository's embedded WebDriver/SafariDriver path and isolated E2E fixtures.
