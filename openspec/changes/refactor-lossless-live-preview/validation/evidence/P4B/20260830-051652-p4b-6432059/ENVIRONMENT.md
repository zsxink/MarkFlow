# P4B 7.2a final candidate immutable environment snapshot

| Field | Measured value |
| --- | --- |
| Recorded at | 2026-08-30T05:16:52+0800 |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` (GOAL-recorded exception) |
| Start commit | `6432059d29455ee8a4b7a4515ffff3aab371e2d0` |
| Predecessor failed runs | `20260830-043257`, `043642`, `044524`, `050013`, `050842` under sibling P4B evidence directories; each is sealed with raw failure logs |
| Candidate | 7.2a product/contracts + deterministic fixtures + semantic projection waits + mode-independent smoke round trip |
| OS / architecture | macOS 26.5.2 Build 25F84 / Darwin 25.5.0 arm64 |
| Host | `XianMac.local` |
| WebView / driver | WebKit; SafariDriver 26.5.2 (21624.2.5.11.8) |
| Node / npm | v24.17.0 / 12.0.2 |
| TypeScript / Vite / Vitest | 5.9.3 / 5.4.21 / 2.1.9 |
| CodeMirror state/view/markdown | 6.6.0 / 6.43.0 / 6.5.0 |
| Rust / Cargo | 1.96.0 / 1.96.0 |
| Tauri CLI/API | 2.11.3 / 2.11.0 |
| OpenSpec | 1.6.0 |
| P4B flags | cohorts default OFF; desktop tests enable and restore explicitly; no table widget registration |
| Deferred | real Chinese/Japanese IME to 7.3; visual/focus/a11y to later P4B acceptance |

## Dirty status at run start

The candidate contains all 7.2a files, five preserved failed evidence runs/issues, and the audited E2E harness corrections. The user-supplied untracked GOAL file is excluded. Exact `git status --short`:

```text
 M e2e/run.mjs
 M e2e/specs/lossless/live-preview.e2e.mjs
 M e2e/specs/lossless/p4b-cohort-reveal.e2e.mjs
 M e2e/specs/smoke/editor-mode.e2e.mjs
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
?? e2e/p4b-cohort-fixtures.mjs
?? e2e/p4b-cohort-fixtures.test.mjs
?? openspec/changes/refactor-lossless-live-preview/validation/GOAL-executor-typora-complete.md
?? openspec/changes/refactor-lossless-live-preview/validation/evidence/P4B/20260830-043257-p4b-6432059/
?? openspec/changes/refactor-lossless-live-preview/validation/evidence/P4B/20260830-043642-p4b-6432059/
?? openspec/changes/refactor-lossless-live-preview/validation/evidence/P4B/20260830-044524-p4b-6432059/
?? openspec/changes/refactor-lossless-live-preview/validation/evidence/P4B/20260830-050013-p4b-6432059/
?? openspec/changes/refactor-lossless-live-preview/validation/evidence/P4B/20260830-050842-p4b-6432059/
?? openspec/changes/refactor-lossless-live-preview/validation/issues/20260830-p2-e2e-projection-observation-race.md
?? openspec/changes/refactor-lossless-live-preview/validation/issues/20260830-p4b-7.2a-core-rustfmt.md
?? openspec/changes/refactor-lossless-live-preview/validation/issues/20260830-p4b-lossless-e2e-fixtures-missing.md
?? openspec/changes/refactor-lossless-live-preview/validation/issues/20260830-p4b-lossless-e2e-semantic-assertions.md
?? openspec/changes/refactor-lossless-live-preview/validation/issues/20260830-smoke-editor-mode-default-preview.md
?? src/lib/lossless/structuralInteraction.test.ts
?? src/lib/lossless/structuralInteraction.ts
```

## Isolation and privacy

- Desktop runners use isolated generated workspaces and remove them after success.
- No user Markdown, credentials, tokens, or external account data is used.
