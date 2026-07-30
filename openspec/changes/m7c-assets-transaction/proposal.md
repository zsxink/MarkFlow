## Why

M7C requires image asset writes to be coordinated with document patch/save so failed IO cannot leave Markdown pointing at missing files. Existing image handling already supports storage rules and pending-image migration, but it lacks an explicit transaction contract bound to session, revision, and request identity.

## What Changes

- Add an assets transaction layer that prepares a Markdown patch proposal before document write/save.
- Bind every asset transaction to `sessionId + baseRevision + requestId` and reject stale commits.
- Keep Host IO limited to prepare/write/move/cleanup operations; Host must not inspect editor text or generate Markdown references.
- Commit pending-image cleanup only after the Markdown write or Core save succeeds.
- Roll back or preserve recoverable metadata when asset IO succeeds but document commit/save fails.
- Add focused tests for relative/absolute references, document-dir/document-named-dir/custom storage modes, first-save failure, rollback, and session isolation.

## Capabilities

### New Capabilities

### Modified Capabilities
- `image-storage-engine`: extend image storage with explicit asset transaction plan, commit, rollback, and stale-session guards.

## Impact

- `src/lib/imageUtils.ts` gains transaction-oriented APIs while retaining compatibility wrappers used by save flows.
- `src/components/sidebar.fileops.ts` continues to save through the image preparation step, now backed by transaction semantics.
- `src/lib/coreSession.ts` uses the same transaction boundary around Core-backed saves.
- Tests in `src/lib/imageUtils.test.ts`, `src/components/sidebar.fileops.test.ts`, and `src/lib/coreSession.test.ts` cover the new transaction contract.
