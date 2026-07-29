## 1. Test Infrastructure (regression tests first)

- [x] 1.1 Write real CodeMirror ChangeSet.compose regression test demonstrating `aXbYc` bug and verifying `aXYbc` correct behavior
- [x] 1.2 Write SourceSyncController unit tests: delayed/out-of-order ack, backpressure recovery, retry exhaustion, flush timeout, mismatch replay, rapid open/close
- [ ] 1.3 Write Rust DocumentService tests: Host write/rename failure recovery, same-path dual-session concurrent save, real reload dirty/clean gate
- [x] 1.4 Write Rust save-integrity tests: SaveLease RAII cleanup (success/failure/panic), per-path lock serialization, full-content fingerprint conflict detection
- [ ] 1.5 Write lifecycle tests: generation isolation (stale response ignored), close idempotent/re-entrant, WYSIWYG dirty gate prevents Source switch
- [ ] 1.6 Write UTF-16 post-edit selection coordinate tests
- [ ] 1.7 Create deterministic fixture generator for fidelity tests (CRLF/BOM/Unicode/mixed EOL/frontmatter)
- [ ] 1.8 Add fidelity integration tests: open-save byte-for-byte verification for each fixture type

## 2. SourceSyncController (frontend sync deep module)

- [x] 2.1 Create `SourceSyncController` class in `src/lib/` with instance-based state (confirmedRevision, pending queue, in-flight tracking, blocked/synced/resyncing state machine)
- [x] 2.2 Implement transaction batching via `ChangeSet.compose` — same-animation-frame transactions composed into single change set (uses original extracted changes as CM6 instance method not static)
- [x] 2.3 Implement single-in-flight send — queue new transactions while awaiting ack; send next batch on ack receipt
- [x] 2.4 Implement backpressure with capacity-based auto-resume (not external wake)
- [x] 2.5 Implement retry exhaustion → blocked (preserve all pending, return error, don't pretend success)
- [x] 2.6 Implement strict flush barrier: wait retained batch → queue → in-flight → verify backend revision
- [x] 2.7 Implement resync replay: carry `lastConfirmedRevision + pendingTransactionIds`, delete confirmed prefix from authoritative text, replay unconfirmed in order; on discontinuity → blocked (don't overwrite editor)
- [x] 2.8 Integrate SourceSyncController into editor Source mode replace module-level `editor.sourcePatcher.ts` functions

## 3. Lifecycle Guard (open/close/switch hardening)

- [x] 3.1 Implement `CoreSourceCoordinator` with generation counter (u64, monotonic, incremented per open/close)
- [x] 3.2 Add generation tag to all async callbacks; discard response if generation does not match current
- [x] 3.3 Make `closeCoreSession()` idempotent, returning `Promise<void>`; remove boolean `closeInProgress` guard
- [x] 3.4 Implement opening-state: show loading indicator, disable CodeMirror creation until `open_document` resolves
- [x] 3.5 Handle `open_document` failure: don't create CM, show error, stay in WYSIWYG
- [x] 3.6 Implement WYSIWYG dirty gate: prompt save/discard/cancel before `open_document`
- [x] 3.7 Change `isCoreBackedSourceModeEnabled()` from hardcoded `true` to read from user settings

## 4. Runtime DocumentService (Rust layer)

- [x] 4.1 Extract `DocumentService` from `core_bridge.rs` — thin command handlers delegate to DocumentService
- [x] 4.2 Implement `DocumentService::reload_document` — read via Host trait outside session lock, re-acquire lock, verify clean, atomically replace Core state
- [x] 4.3 Return non-zero real `documentId` from `open_document` (incrementing counter or UUID)
- [x] 4.4 Return Core-derived outline and stats from `open_document`
- [x] 4.5 Fix `save_in_progress` RAII — implement `SaveLease` struct that sets token on creation and clears on Drop
- [x] 4.6 Fix post-edit selection coordinate semantics: use `Core::byte_for_utf16()` for anchor/head in apply_patch response

## 5. Save Integrity (atomic write + conflict detection)

- [x] 5.1 Implement `PathSaveCoordinator` — per-canonical-path serialization of save operations
- [x] 5.2 Implement full-content SHA-256 fingerprint with size+mtime fast-path pre-check
- [x] 5.3 Ensure atomic write uses temp file in same directory as target + fsync + `std::fs::rename`
- [x] 5.4 Migrate Save As to Runtime authority — create new Core session, call `save_document`, replace session path on success; no `getMarkdown()` call

## 6. Protocol & Security

- [x] 6.1 Add `SAVE_FLUSH_TIMEOUT` and `SAVE_IN_PROGRESS` and `RELOAD_DIRTY` to AppErrorCode enum
- [x] 6.2 Ensure all Bridge commands (not just patch) use versioned ProtocolEnvelope
- [x] 6.3 Map ALL error codes 1:1 between Core/Runtime enum and Bridge AppErrorCode
- [x] 6.4 Convert open/save/reload to async Tauri command with `spawn_blocking` for IO; keep patch sync
- [x] 6.5 Add protocol version validation and return `PROTOCOL_VERSION_UNSUPPORTED` on mismatch

## 7. CI & Tooling Cleanup

- [x] 7.1 Fix all `cargo fmt --all -- --check` failures
- [x] 7.2 Fix all `cargo clippy --workspace --all-targets -- -D warnings` failures (resolve unused imports/variables, nonminimal-bool)
- [x] 7.3 Update CI config to enforce workspace-level fmt + clippy

## 8. Cleanup & Migration

- [x] 8.1 Delete old `editor.sourcePatcher.ts` module-level functions no longer used
- [x] 8.2 Remove no-op invoke mock tests (those that don't verify actual protocol behavior)
- [x] 8.3 Verify `npm test` passes (all existing + new tests)
- [x] 8.4 Verify `npx tsc --noEmit` passes
- [x] 8.5 Verify `cargo test --workspace` passes (compile step)
- [x] 8.6 Verify `npx openspec validate --all` passes
