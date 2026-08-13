# P0S 保存安全守卫架构

## 修订模型（src/lib/editor.state.ts）

- `userRevision` / `persistedRevision`：dirty = `userRevision > persistedRevision`（`hasUnpersistedUserChanges()`）
- `resetDocumentRevision()` 在 hydration/reload 时双归零，并 **bump `documentGeneration`**（文档身份令牌）
- `TransactionOrigin`（userTransaction/hydration/readOnlySync/reloadSync/modeSync/assetResolution/unknown）通过 ProseMirror transaction meta（`TRANSACTION_ORIGIN_META`）在 `onTransaction` 同步分类
- `isUserContentTransaction()`：未知 origin 且非 preventUpdate 的 doc-changing transaction 保守判为用户编辑

## 保存链路（src/components/sidebar.fileops.ts）

- `savingInProgress` 锁**在任何 await 前占用**（Save 对话框/stat/prepare/write/完成 全在锁内），`finally` 释放
- 保存启动时捕获 `saveGeneration = getDocumentGeneration()`；异步完成后**只有 generation 匹配**才 `setLastReadStats` / `markDocumentPersisted`（防止 A 的 in-flight 保存污染 B）
- clean guard：`hasUnpersistedUserChanges()===false` 直接 `skipped`，不调用 serializer/write
- `SaveResult`：`'saved' | 'skipped' | 'failed'`，transition 只在 `'saved'` 时继续

## 关键调用链

`openFileInEditor → setMarkdown → setReadOnly(false) → setEditable(!readOnly, emitUpdate=false)` — emitUpdate=false 防止零编辑写盘（P0 根因）
autosave coordinator（main.ts runAutoSaveTick）：双检查 `isDocumentDirty() && hasUnpersistedUserChanges()`

## E2E 测试要点

- P0S desktop lifecycle suite：`e2e/specs/p0s/`（`npm run test:e2e:p0s`），autosave=true interval=2000ms
- WYSIWYG 输入用 `window.__markflowEditor`（e2e-only 暴露）`commands.insertContent()` — WebKit 的 `browser.keys`/`execCommand` 不触发 ProseMirror transaction
- `openFileAndWaitActive()` 必须等 `store.getState().activeFilePath` 变为目标文件，否则 insertContent 作用到上一个文档
