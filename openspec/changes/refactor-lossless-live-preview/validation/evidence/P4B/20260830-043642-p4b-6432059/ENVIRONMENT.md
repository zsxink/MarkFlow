# P4B 7.2a corrective immutable environment snapshot

| Field | Measured value |
| --- | --- |
| Recorded at | 2026-08-30T04:36:42+0800 |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` (Program Owner branch exception recorded in GOAL) |
| Start commit | `6432059d29455ee8a4b7a4515ffff3aab371e2d0` |
| Corrective predecessor | `../20260830-043257-p4b-6432059/` (C05 rustfmt FAIL) |
| Candidate correction | Mechanical `cargo fmt --manifest-path markflow-core/Cargo.toml`; no behavior change |
| OS | macOS 26.5.2 (Build 25F84), Darwin 25.5.0 arm64 |
| Host | `XianMac.local` |
| WebView / SafariDriver | WebKit / Safari 26.5.2 (21624.2.5.11.8) |
| Node / npm | v24.17.0 / 12.0.2 |
| TypeScript / Vite / Vitest | 5.9.3 / 5.4.21 / 2.1.9 |
| CodeMirror state/view/markdown | 6.6.0 / 6.43.0 / 6.5.0 |
| Rust / Cargo | 1.96.0 / 1.96.0 |
| Tauri CLI/API | 2.11.3 / 2.11.0 |
| OpenSpec | 1.6.0 |
| Feature flags | P4B `headingStrong` and `quoteLists` default OFF; tests explicitly enable and restore them. No table widget registration. |
| Input method | Not exercised in 7.2a; task 7.3 owns real Chinese/Japanese IME |
| Screen reader / visual | Deferred to later P4B desktop acceptance |

## Dirty status at corrective run start

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
?? openspec/changes/refactor-lossless-live-preview/validation/evidence/P4B/20260830-043257-p4b-6432059/
?? openspec/changes/refactor-lossless-live-preview/validation/issues/20260830-p4b-7.2a-core-rustfmt.md
?? src/lib/lossless/structuralInteraction.test.ts
?? src/lib/lossless/structuralInteraction.ts
```

## Safety and isolation

- All automation uses repository fixtures or generated temporary directories; no user Markdown document is touched.
- The untracked user-supplied GOAL document is excluded from all edits and commits.
- Logs contain no credentials/tokens; desktop suites use embedded WebDriver and isolated fixtures.
