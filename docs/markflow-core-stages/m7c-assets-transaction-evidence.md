# M7C Assets Transaction Evidence

> Issue: #232  
> OpenSpec change: `m7c-assets-transaction`  
> Date: 2026-07-30

## Functional Matrix

| Capability | Status | Evidence |
| --- | --- | --- |
| Transaction plan with `sessionId + baseRevision + requestId` | Implemented | `prepareAssetTransaction` returns identity-bound `AssetTransactionPlan`; covered by `src/lib/imageUtils.test.ts` |
| Host IO separated from Markdown reference generation | Implemented | Host commands still return path mappings only; Markdown references are generated in `imageUtils.ts` |
| First-save pending image migration | Implemented | Existing pending draft flow now routes through transaction prepare/commit |
| Relative and absolute Markdown references | Implemented | `imageUtils.test.ts` covers relative document-named references and absolute custom targets |
| `document-dir`, `document-named-dir`, and `custom` storage modes | Implemented | `imageUtils.test.ts` covers storage path resolution and transaction rewrite |
| Document write/save failure does not update editor Markdown truth | Implemented | Sidebar save tests keep `setMarkdown` and `setActiveFilePath` untouched on failed writes |
| Asset file success followed by document failure preserves recovery state | Implemented | `rollbackAssetTransaction` keeps drafts and returns recovery mappings |
| Stale session/revision/request rejection | Implemented | `commitAssetTransaction` and `rollbackAssetTransaction` validate supplied current context |
| Core-backed Source Mode save integration | Implemented | `saveCoreSession` prepares asset transactions before Core save and uses SourceSyncController to sync proposed Markdown |
| Feature flag / rollback switch | Available | Existing image settings can disable local/network copy; `rollbackAssetTransaction` releases a prepared transaction without cleaning recoverable drafts |

## Test Evidence

```bash
npm test -- src/lib/imageUtils.test.ts src/components/sidebar.fileops.test.ts src/lib/sidebar.fileops.save.test.ts src/lib/coreSession.test.ts src/lib/SourceSyncController.test.ts
```

Result: 5 files passed, 75 tests passed.

```bash
npm test
```

Result: 44 files passed, 448 tests passed.

## Release Note

M7C introduces identity-bound asset transactions for image migration and Markdown reference updates. Pending images are now prepared as a transaction, committed only after document write/Core save succeeds, and rolled back or preserved as recoverable state on failure. This reduces the chance of Markdown being saved with references to missing files and prepares the image workflow for multi-session isolation.
