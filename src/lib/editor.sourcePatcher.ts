//! @deprecated M3.1 — Module-level patcher replaced by SourceSyncController class.
//!
//! All functionality has been migrated to `SourceSyncController` in
//! `SourceSyncController.ts`. The SourceSyncController provides instance-based
//! state management, single-in-flight send, batching via ChangeSet.compose,
//! capacity-based backpressure, retry exhaustion, flush barrier, and resync
//! replay.
//!
//! This file is kept as a reference but is no longer used by any production
//! code. The old exported functions were:
//!   - createPatcherCallback → SourceSyncController.processTransactions()
//!   - attachPatcher → SourceSyncController.attach()
//!   - detachPatcher → SourceSyncController.detach()
//!   - flushPendingPatches → SourceSyncController.flush()
//!   - resyncEditorWithCore → handled via coreSession.resyncCoreSession
//!
//! See SourceSyncController.ts for the replacement implementation.
