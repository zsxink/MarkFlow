# Immutable Environment Snapshot

Captured before the formal candidate gate rerun. Earlier focused tests and desktop runs were exploratory and are listed in `RUN.md`; they are not substituted for the commands recorded under this run.

| Field | Value |
| --- | --- |
| Captured | 2026-08-30T08:05:54+08:00 |
| Repository | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Base HEAD | `a8c73de70eb07ae374eed8ae227ad0097815db0b` |
| Candidate state | Uncommitted P4B 7.1/7.2/7.4–7.8 implementation and tests |
| Candidate implementation diff SHA-256 | `eef98dca7e66242bc70477c1224bf9eb7ea13ba43ecb77a774c41fb68dad02bf` |
| OS | macOS 26.5.2 (25F84), arm64 |
| Node / npm | 24.17.0 / 12.0.2 |
| TypeScript / Vite / Vitest | 5.9.3 / 5.4.21 / 2.1.9 |
| Rust / Cargo | 1.96.0 / 1.96.0 |
| Tauri CLI | 2.11.3 |
| OpenSpec CLI | 1.6.0 |
| Product flags under test | lossless Core ON; Live Preview ON; P4B task/fence cohorts independently exercised OFF/ON |
| Test workspace | Generated isolated E2E workspace; no user Markdown document |

Dirty paths at capture:

```text
M e2e/run.mjs
M e2e/specs/lossless/all-lossless.e2e.mjs
M src/lib/lossless/cohortFlags.test.ts
M src/lib/lossless/integration.ts
M src/lib/lossless/projection.test.ts
M src/lib/lossless/projection.ts
M src/lib/lossless/renderOwnerRegistry.test.ts
M src/lib/lossless/renderOwnerRegistry.ts
M src/lib/lossless/widgets/p4bWidgets.test.ts
M src/lib/lossless/widgets/p4bWidgets.ts
M src/lib/lossless/widgets/protocol.ts
?? e2e/specs/lossless/p4b-widgets.e2e.mjs
?? openspec/changes/refactor-lossless-live-preview/validation/GOAL-executor-typora-complete.md
```

The untracked `validation/GOAL-executor-typora-complete.md` is user-supplied executor input and is excluded from the candidate, evidence manifest, staging, and commits.
