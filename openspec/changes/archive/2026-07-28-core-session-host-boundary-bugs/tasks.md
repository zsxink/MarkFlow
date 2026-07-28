## 1. Bug 1 — closeCoreSession 竞态

- [x] 1.1 在 `src/lib/editor.ts` 中为 `closeCoreSession()` 添加 `closeInProgress` 防重入标志，async 开始时设为 true，finally 中清零
- [x] 1.2 在 `closeCoreSession()` 入口检查 `closeInProgress`，如果为 true 直接 return

## 2. Bug 2 — backpressure batch 丢弃

- [x] 2.1 在 `src/lib/editor.sourcePatcher.ts` 中将 backpressure 检查从 `this._pendingPatches.splice(0)` 之后移到之前
- [x] 2.2 编写/验证单测覆盖 backpressure 状态下 patch 不被丢弃

## 3. Bug 3 — Selection UTF-16 偏移

- [x] 3.1 在 `src-tauri/src/commands/core_bridge.rs` 中将 Selection anchor/head 从 UTF-16 转为字节偏移，使用 `state.core.byte_for_utf16()`
- [x] 3.2 验证单元测试覆盖 CJK/emoji Selection 场景

## 4. Bug 4 — Core save dirty 永真

- [x] 4.1 在 `src/lib/editor.ts` Core save 成功后调用 `markDocumentPersisted()`
- [x] 4.2 验证 save 后 dirty 状态变为 false

## 5. Bug 5 — blocked 状态 dirty 掩藏

- [x] 5.1 在 `src/lib/coreSession.ts` 的 `isCoreSessionDirty()` 中，blocked 时返回 `pendingCount > 0 || confirmedRevision !== persistedRevision`

## 6. Bug 6 — 双重 toast

- [x] 6.1 在 `src/lib/coreSession.ts` 的 `saveCoreSession` catch 块中，删除冗余的 `if (toastMsg) showToast(toastMsg)`

## 7. Bug 7 — 冗余 Mutex

- [x] 7.1 在 `src-tauri/src/runtime_host.rs` 中将 `Mutex<SessionRegistry>` 改为直接 `SessionRegistry`，更新所有访问模式
- [x] 7.2 验证 `cargo test --lib` 全部通过

## 8. 验证

- [x] 8.1 `cargo test --lib -- --test-threads=1` 通过
- [x] 8.2 `cargo clippy -- -D warnings` 通过
- [x] 8.3 `npx tsc --noEmit` 通过
- [x] 8.4 `npm test` 通过
- [x] 8.5 `npm run build` 通过
