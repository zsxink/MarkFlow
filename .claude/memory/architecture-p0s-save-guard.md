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

## 证据治理（2026-08-13 教训）

- **修复后必须新建独立 run-id 封存证据**，不得往旧的 NO-GO run 目录追加 PASS addendum——这会让 candidate SHA、RUN 顶部状态、manifest 全部不一致。
- 每个 final run 目录必须包含：独立 `RUN.md`（顶部状态 + 明确 candidate SHA）、不可变 `ENVIRONMENT.md`（SHA-256 记入 RUN）、每个 gate 独立日志、`artifact-manifest.sha256`（生成后必须 `shasum -a 256 -c` 0 mismatch）。
- ISSUE 修复后**正文**的 Fix/Verification/Closure 必须逐项填（Fix commit、Passing run、Reviewer、Closed date），不能只改状态行。
- phase/README/tasks 的状态必须**一致**（P0S GO 时 P1A 不能还 BLOCKED）。final gate PASS 前保持 NO-GO。
- 顺序：新 run 封存 → manifest 校验 0 mismatch → ISSUE closure 补全 → 新独立 Reviewer PASS → 同步状态 → Program Owner GO → ISSUE-004 关闭。
