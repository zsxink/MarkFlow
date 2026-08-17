//! Lossless Core session bridge — P1B task 3.1.
//!
//! Registers a per-process [`LosslessSessionRegistry`] in the Tauri runtime and
//! exposes the bridge commands (design 02 §8):
//!
//! - `open_lossless_document`
//! - `apply_document_patch`
//! - `get_document_snapshot`
//! - `flush_document_session`
//! - `prepare_document_save`
//! - `commit_document_save`
//! - `reload_lossless_document`
//! - `close_lossless_document`
//!
//! The registry is the only host-side owner of `LosslessDocumentSession`
//! instances. Every async operation from the frontend must carry the identity
//! fields from design 02 §2 (session/document/revision/transaction/operation),
//! and the registry returns stable, machine-branchable error codes — the
//! frontend never branches on an English message (design 02 §8).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use markflow_core::{
    ContentHash, DocumentId, LineEndingKind, LosslessDocumentSession, PatchOutcome, SessionId,
};
use serde::Serialize;
use tauri::State;

use crate::error::lock_mutex;
use crate::state::AppState;

pub mod dto;
pub mod guarded_write;

pub use dto::{
    CommitSaveRequest, LosslessError, LosslessOpenResponse, OpenDocumentRequest, PatchRequest,
    PrepareSaveRequest, PrepareSaveResponse, ReloadDocumentRequest, SessionRequest,
};

// ── Registry ───────────────────────────────────────────────────────────

/// Host-side registry of live lossless sessions, keyed by `SessionId`.
///
/// The registry is intentionally small: it owns the sessions and hands out ids.
/// It is not `Sync`-free because `LosslessDocumentSession` is not `Sync`; all
/// access goes through `lock_mutex` on the inner `Mutex`, mirroring the rest of
/// `AppState`.
#[derive(Default)]
pub struct LosslessSessionRegistry {
    sessions: Mutex<HashMap<SessionId, LosslessDocumentSession>>,
    /// A lifecycle epoch is independent from the session mutex so a reload or
    /// close can revoke an already-prepared save while that save is doing its
    /// filesystem work. The writer validates it immediately before exchange.
    save_epochs: Mutex<HashMap<SessionId, Arc<AtomicU64>>>,
    /// Serializes the replacement/commit linearization point with reload and
    /// close. Epoch validation alone has a check→syscall gap; this mutex makes
    /// "validate lease + native replace/create" one Host-side critical section.
    lifecycle_locks: Mutex<HashMap<SessionId, Arc<Mutex<()>>>>,
    next_session_id: AtomicU64,
    next_document_id: AtomicU64,
}

/// Capability held by a guarded save between prepare and the native replace
/// point. It is invalidated synchronously when reload/close begins.
#[derive(Clone)]
pub struct SaveOperationLease {
    session_id: SessionId,
    document_id: DocumentId,
    binding_generation: u64,
    epoch: u64,
    control: Arc<AtomicU64>,
    lifecycle_lock: Arc<Mutex<()>>,
}

impl LosslessSessionRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            save_epochs: Mutex::new(HashMap::new()),
            lifecycle_locks: Mutex::new(HashMap::new()),
            next_session_id: AtomicU64::new(1),
            next_document_id: AtomicU64::new(1),
        }
    }

    fn allocate_session_id(&self) -> SessionId {
        SessionId(self.next_session_id.fetch_add(1, Ordering::SeqCst))
    }

    fn allocate_document_id(&self) -> DocumentId {
        DocumentId(self.next_document_id.fetch_add(1, Ordering::SeqCst))
    }

    /// Insert a session and return its identity. A fresh session starts clean
    /// (persisted_revision == revision == 0).
    pub fn insert(&self, session: LosslessDocumentSession) -> SessionId {
        let session_id = session.session_id;
        if let Ok(mut sessions) = lock_mutex(&self.sessions) {
            sessions.insert(session_id, session);
        }
        if let Ok(mut epochs) = lock_mutex(&self.save_epochs) {
            epochs.insert(session_id, Arc::new(AtomicU64::new(0)));
        }
        if let Ok(mut locks) = lock_mutex(&self.lifecycle_locks) {
            locks.insert(session_id, Arc::new(Mutex::new(())));
        }
        session_id
    }

    pub fn get(&self, session_id: SessionId) -> Option<LosslessDocumentSession> {
        lock_mutex(&self.sessions)
            .ok()
            .and_then(|sessions| sessions.get(&session_id).cloned())
    }

    /// Mutate a session under the registry lock. Returns the post-mutation
    /// clone, or `None` when the session does not exist.
    pub fn update<R>(
        &self,
        session_id: SessionId,
        f: impl FnOnce(&mut LosslessDocumentSession) -> R,
    ) -> Option<R> {
        let mut sessions = lock_mutex(&self.sessions).ok()?;
        let session = sessions.get_mut(&session_id)?;
        Some(f(session))
    }

    pub fn contains(&self, session_id: SessionId) -> bool {
        lock_mutex(&self.sessions)
            .map(|sessions| sessions.contains_key(&session_id))
            .unwrap_or(false)
    }

    /// Freeze the session/document/generation that a prepared receipt is
    /// allowed to write. The lease does not hold the registry mutex across I/O;
    /// reload/close can therefore revoke it instead of waiting behind a slow
    /// disk operation.
    /// Capture the epoch for a newly prepared durable receipt.
    pub fn capture_save_lease(
        &self,
        session_id: SessionId,
        document_id: DocumentId,
        binding_generation: u64,
    ) -> Result<SaveOperationLease, LosslessError> {
        self.make_save_lease(session_id, document_id, binding_generation, None)
    }

    /// Resume only the exact epoch that a durable receipt captured at prepare.
    /// Sampling the current epoch here would reopen a reload/close TOCTOU.
    pub fn resume_save_lease(
        &self,
        session_id: SessionId,
        document_id: DocumentId,
        binding_generation: u64,
        save_epoch: u64,
    ) -> Result<SaveOperationLease, LosslessError> {
        self.make_save_lease(
            session_id,
            document_id,
            binding_generation,
            Some(save_epoch),
        )
    }

    fn make_save_lease(
        &self,
        session_id: SessionId,
        document_id: DocumentId,
        binding_generation: u64,
        expected_epoch: Option<u64>,
    ) -> Result<SaveOperationLease, LosslessError> {
        let control = lock_mutex(&self.save_epochs)
            .ok()
            .and_then(|epochs| epochs.get(&session_id).cloned())
            .ok_or_else(|| {
                LosslessError::session_missing(format!("session {session_id:?} not found"))
            })?;
        let lifecycle_lock = lock_mutex(&self.lifecycle_locks)
            .ok()
            .and_then(|locks| locks.get(&session_id).cloned())
            .ok_or_else(|| {
                LosslessError::session_missing(format!("session {session_id:?} not found"))
            })?;
        // Capture (or resume) the lease under the same lifecycle lock used by
        // reload/close. Without this, a reload could revoke, release the lock
        // to read disk, and an old generation could incorrectly capture the
        // *new* epoch before its binding generation was installed.
        let _guard = lock_mutex(&lifecycle_lock)
            .map_err(|error| LosslessError::io(format!("保存生命周期锁不可用: {error}")))?;
        let epoch = control.load(Ordering::Acquire);
        if expected_epoch.is_some_and(|expected| expected != epoch) {
            return Err(LosslessError::wrong_identity(
                "save receipt 已被 reload/close 丢弃，拒绝恢复旧 lease",
            ));
        }
        self.validate_save_identity(session_id, document_id, binding_generation)?;
        drop(_guard);
        Ok(SaveOperationLease {
            session_id,
            document_id,
            binding_generation,
            epoch,
            control,
            lifecycle_lock,
        })
    }

    fn validate_save_identity(
        &self,
        session_id: SessionId,
        document_id: DocumentId,
        binding_generation: u64,
    ) -> Result<(), LosslessError> {
        let session = self.get(session_id).ok_or_else(|| {
            LosslessError::session_missing(format!("session {session_id:?} not found"))
        })?;
        if session.document_id != document_id
            || session.binding_generation().0 != binding_generation
        {
            return Err(LosslessError::wrong_identity(
                "save receipt 与当前 session/document/generation 不一致",
            ));
        }
        Ok(())
    }

    pub fn save_epoch(lease: &SaveOperationLease) -> u64 {
        lease.epoch
    }

    /// Linearize a reload/close transition with a native replacement/create or
    /// receipt+registry commit. The transition owns the lifecycle mutex while
    /// it revokes every older lease and installs/removes the session image, so
    /// no new save can capture the post-revocation epoch against old bytes.
    pub fn with_lifecycle_transition<R>(
        &self,
        session_id: SessionId,
        operation: impl FnOnce() -> Result<R, LosslessError>,
    ) -> Result<R, LosslessError> {
        let control = lock_mutex(&self.save_epochs)
            .ok()
            .and_then(|epochs| epochs.get(&session_id).cloned())
            .ok_or_else(|| {
                LosslessError::session_missing(format!("session {session_id:?} not found"))
            })?;
        let lifecycle_lock = lock_mutex(&self.lifecycle_locks)
            .ok()
            .and_then(|locks| locks.get(&session_id).cloned())
            .ok_or_else(|| {
                LosslessError::session_missing(format!("session {session_id:?} not found"))
            })?;
        let _guard = lock_mutex(&lifecycle_lock)
            .map_err(|error| LosslessError::io(format!("保存生命周期锁不可用: {error}")))?;
        control.fetch_add(1, Ordering::AcqRel);
        operation()
    }

    /// Final guard immediately before the host's atomic exchange/create call.
    pub fn validate_save_lease(&self, lease: &SaveOperationLease) -> Result<(), LosslessError> {
        if lease.control.load(Ordering::Acquire) != lease.epoch {
            return Err(LosslessError::wrong_identity(
                "保存操作已被 reload/close 丢弃，拒绝在替换点写入",
            ));
        }
        self.validate_save_identity(
            lease.session_id,
            lease.document_id,
            lease.binding_generation,
        )
    }

    /// Run an operation atomically with lifecycle revocation. Callers must put
    /// the native replace/create syscall or the receipt+registry commit inside
    /// this closure; validating outside it is intentionally forbidden.
    pub fn with_save_lifecycle_lock<R>(
        &self,
        lease: &SaveOperationLease,
        operation: impl FnOnce() -> Result<R, LosslessError>,
    ) -> Result<R, LosslessError> {
        let _guard = lock_mutex(&lease.lifecycle_lock)
            .map_err(|error| LosslessError::io(format!("保存生命周期锁不可用: {error}")))?;
        self.validate_save_lease(lease)?;
        operation()
    }
}

// ── Command helpers ────────────────────────────────────────────────────

/// Compute the on-disk identity of a file. Content hash is authoritative; the
/// size/mtime fast-path is kept for cheap pre-checks (design 04 §4).
pub use guarded_write::current_file_identity;

/// Read raw bytes for a path, rejecting invalid UTF-8 at open time via Core
/// (Core refuses the session; bytes are never replacement-decoded).
fn read_bytes(path: &PathBuf) -> Result<Vec<u8>, LosslessError> {
    std::fs::read(path).map_err(|e| LosslessError::io(format!("读取文件失败: {e}")))
}

fn parse_default_eol(value: &str) -> Result<LineEndingKind, LosslessError> {
    match value {
        "lf" => Ok(LineEndingKind::Lf),
        "crlf" => Ok(LineEndingKind::Crlf),
        "cr" => Ok(LineEndingKind::Cr),
        other => Err(LosslessError::invalid_encoding(format!(
            "未知 defaultEol: {other}"
        ))),
    }
}

// ── Commands ───────────────────────────────────────────────────────────

/// Open a document into a lossless Core session. Reads raw bytes from disk and
/// freezes the file identity inside the session.
#[tauri::command]
pub fn open_lossless_document(
    req: OpenDocumentRequest,
    state: State<AppState>,
) -> Result<LosslessOpenResponse, LosslessError> {
    // A crash/lost response must not allow a newly opened session to autosave
    // over the target before its old durable receipt is classified.
    guarded_write::ensure_target_reconciled(&req.path, None)?;
    let registry = &state.lossless_registry;
    let path = PathBuf::from(&req.path);
    let bytes = read_bytes(&path)?;
    let identity = current_file_identity(&path, &bytes);
    let default_eol = parse_default_eol(&req.default_eol)?;
    let session_id = registry.allocate_session_id();
    let document_id = registry.allocate_document_id();

    let session = LosslessDocumentSession::open_bytes_with_identity(
        session_id,
        document_id,
        &bytes,
        default_eol,
        identity,
    )
    .map_err(LosslessError::from)?;

    let response = LosslessOpenResponse::from_session(&session);
    registry.insert(session);
    Ok(response)
}

/// Apply an atomic text patch. Carries the full identity matrix (design 02 §2):
/// bindingGeneration, sessionId, documentId, baseRevision, transactionId. The
/// request is in CodeMirror UTF-16 coordinates; the bridge converts to logical
/// byte offsets via the session's PositionMap before applying.
#[tauri::command]
pub fn apply_document_patch(
    req: PatchRequest,
    state: State<AppState>,
) -> Result<PatchOutcome, LosslessError> {
    use markflow_core::NewlineEnding;

    let registry = &state.lossless_registry;
    let bridge = req.patch;
    let session_id = markflow_core::SessionId(bridge.session_id);
    if !registry.contains(session_id) {
        return Err(LosslessError::session_missing(format!(
            "session {session_id:?} not found"
        )));
    }
    let outcome = registry
        .update(session_id, |session| {
            // Validate the identity matrix and base revision BEFORE converting
            // coordinates, so a stale patch can never be converted against the
            // wrong text geometry.
            if session.binding_generation().0 != bridge.binding_generation
                || session.document_id.0 != bridge.document_id
            {
                return Err(LosslessError::wrong_identity(format!(
                    "patch identity does not match session (binding {:?}/{:?}, doc {:?}/{:?})",
                    session.binding_generation().0,
                    bridge.binding_generation,
                    session.document_id.0,
                    bridge.document_id,
                )));
            }
            if session.revision().0 != bridge.base_revision {
                return Err(LosslessError::new(
                    "stale-revision",
                    format!(
                        "stale revision: expected {:?}, actual {:?}",
                        session.revision().0,
                        bridge.base_revision
                    ),
                ));
            }
            // UTF-16 → logical byte conversion (PositionMap is geometry-validated).
            let mut changes = Vec::with_capacity(bridge.changes.len());
            for change in &bridge.changes {
                let start = session
                    .byte_for_utf16(markflow_core::Utf16Offset(change.from_utf16 as usize))
                    .map_err(LosslessError::from)?;
                let end = session
                    .byte_for_utf16(markflow_core::Utf16Offset(change.to_utf16 as usize))
                    .map_err(LosslessError::from)?;
                let line_endings = change
                    .inserted_line_endings
                    .iter()
                    .map(|e| match e.as_str() {
                        "inherit" => Ok(NewlineEnding::Inherit),
                        "lf" => Ok(NewlineEnding::ExplicitLf),
                        "crlf" => Ok(NewlineEnding::ExplicitCrlf),
                        "cr" => Ok(NewlineEnding::ExplicitCr),
                        other => Err(LosslessError::invalid_encoding(format!(
                            "未知 line ending provenance: {other}"
                        ))),
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                changes.push(markflow_core::TextChange {
                    range: markflow_core::SourceRange::new(start, end),
                    inserted_logical_text: change.inserted_logical_text.clone(),
                    inserted_line_endings: line_endings,
                });
            }
            let selection_after = bridge
                .selection_after
                .as_ref()
                .map(|sel| -> Result<markflow_core::Selection, LosslessError> {
                    let anchor = session
                        .byte_for_utf16(markflow_core::Utf16Offset(sel.anchor_utf16 as usize))
                        .map_err(LosslessError::from)?;
                    let head = session
                        .byte_for_utf16(markflow_core::Utf16Offset(sel.head_utf16 as usize))
                        .map_err(LosslessError::from)?;
                    Ok(markflow_core::Selection {
                        anchor,
                        head,
                        revision: markflow_core::Revision(bridge.base_revision),
                    })
                })
                .transpose()?;
            let patch = markflow_core::TextPatch {
                binding_generation: markflow_core::BindingGeneration(bridge.binding_generation),
                session_id,
                document_id: markflow_core::DocumentId(bridge.document_id),
                transaction_id: markflow_core::TransactionId(bridge.transaction_id),
                base_revision: markflow_core::Revision(bridge.base_revision),
                changes,
                selection_after,
            };
            session.apply_patch(patch).map_err(LosslessError::from)
        })
        .ok_or_else(|| {
            LosslessError::session_missing(format!("session {session_id:?} not found"))
        })??;
    Ok(outcome)
}

/// Return the current confirmed snapshot (revision, logical text, hash,
/// persisted revision, original bytes metadata).
#[tauri::command]
pub fn get_document_snapshot(
    req: SessionRequest,
    state: State<AppState>,
) -> Result<markflow_core::DocumentSnapshot, LosslessError> {
    let registry = &state.lossless_registry;
    let session = registry.get(req.session_id).ok_or_else(|| {
        LosslessError::session_missing(format!("session {:?} not found", req.session_id))
    })?;
    Ok(session.snapshot())
}

/// Flush barrier result: returns the confirmed revision after the frontend has
/// drained its pending queue. The bridge itself cannot force the frontend to
/// send patches; it reports the current confirmed state so the caller can
/// decide Flushed / Blocked.
#[tauri::command]
pub fn flush_document_session(
    req: SessionRequest,
    state: State<AppState>,
) -> Result<FlushResult, LosslessError> {
    let registry = &state.lossless_registry;
    let session = registry.get(req.session_id).ok_or_else(|| {
        LosslessError::session_missing(format!("session {:?} not found", req.session_id))
    })?;
    Ok(FlushResult {
        revision: session.revision().0,
        confirmed_hash: session.confirmed_hash().hex(),
        persisted_revision: session.persisted_revision().map(|r| r.0),
    })
}

/// Prepare the save payload for the current confirmed revision. Rejects a stale
/// `expected_revision` or a mismatched `expected_file_identity` (external
/// change → conflict). The returned `save_operation_id` is bound to the
/// prepared payload; `guarded_atomic_write` with the same operation id is
/// idempotent and rejects a different payload.
#[tauri::command]
pub fn prepare_document_save(
    req: PrepareSaveRequest,
    state: State<AppState>,
) -> Result<PrepareSaveResponse, LosslessError> {
    // Re-run the durable startup gate at the final Host save entrance. A
    // frontend autosave scheduler cannot safely emulate this check.
    guarded_write::ensure_target_reconciled(&req.path, Some(&req.save_operation_id))?;
    let registry = &state.lossless_registry;
    let session_id = req.session_id;
    let prepared_lease =
        registry.capture_save_lease(session_id, req.document_id, req.binding_generation)?;
    // Snapshot under the same lock that serializes a reload/close transition.
    // The receipt retains this lease epoch, so a later transition invalidates
    // it even if it begins while the durable receipt is being recorded.
    let session = registry.with_save_lifecycle_lock(&prepared_lease, || {
        registry.get(session_id).ok_or_else(|| {
            LosslessError::session_missing(format!("session {session_id:?} not found"))
        })
    })?;

    let expected_revision = markflow_core::Revision(req.expected_revision);
    // The binding generation is frozen into the durable receipt so a
    // reload/close (which advances the generation) invalidates a late
    // write/commit for this payload (P1B corrective P0-3).
    let binding_generation = session.binding_generation().0;
    if req.binding_generation != binding_generation {
        return Err(LosslessError::wrong_identity(format!(
            "prepare 的 binding generation 与 session 不一致 ({:?} vs {:?})",
            req.binding_generation, binding_generation
        )));
    }
    // Save As / New File carries `None`; the payload is still the confirmed Core
    // bytes. A `Some` identity must match the session's frozen identity.
    let expected_identity = req
        .expected_file_identity
        .clone()
        .unwrap_or_else(|| session.original().file_identity.clone());
    let payload = session
        .prepare_save(expected_revision, &expected_identity)
        .map_err(LosslessError::from)?;
    let bytes = payload.into_bytes();
    let payload_hash = ContentHash::of(&bytes);

    // Record the durable Prepared receipt so guarded_atomic_write can verify
    // the payload and be idempotent per operation.
    guarded_write::record_prepared(
        &req.save_operation_id,
        &req.path,
        &req.expected_file_identity,
        &payload_hash,
        session_id.0,
        req.document_id.0,
        binding_generation,
        expected_revision.0,
        LosslessSessionRegistry::save_epoch(&prepared_lease),
    )?;

    Ok(PrepareSaveResponse {
        save_operation_id: req.save_operation_id,
        session_id: session_id.0,
        document_id: req.document_id.0,
        revision: expected_revision.0,
        payload_base64: base64_encode(&bytes),
        payload_sha256: payload_hash.hex(),
    })
}

/// Commit the persisted revision after a successful (or reconciled) write.
/// Binds the new file identity (mtime/size/hash after the write).
#[tauri::command]
pub fn commit_document_save(
    req: CommitSaveRequest,
    state: State<AppState>,
) -> Result<(), LosslessError> {
    let registry = &state.lossless_registry;
    let session_id = req.session_id;
    let prepared_session = registry.get(session_id).ok_or_else(|| {
        LosslessError::session_missing(format!("session {session_id:?} not found"))
    })?;
    if prepared_session.document_id != req.document_id {
        return Err(LosslessError::wrong_identity(
            "commit document id 与 session 不匹配",
        ));
    }
    if req.persisted_revision > prepared_session.revision().0 {
        return Err(LosslessError::new(
            "stale-revision",
            "commit persisted revision 高于当前 confirmed revision",
        ));
    }
    let receipt_epoch = guarded_write::receipt_save_epoch(
        &req.save_operation_id,
        session_id.0,
        req.document_id.0,
        prepared_session.binding_generation().0,
        req.persisted_revision,
    )?;
    let lease = registry.resume_save_lease(
        session_id,
        req.document_id,
        prepared_session.binding_generation().0,
        receipt_epoch,
    )?;
    // The durable `Written` receipt is the ONLY authority for advancing the
    // Core persisted revision. A commit is rejected when the receipt is absent
    // or its session/document/generation/revision/new-identity do not match
    // this commit — otherwise unsaved Core text could be marked persisted with
    // no disk write (P1B corrective P0-1), or a pre-reload payload could mark
    // the reloaded generation persisted (P1B corrective P0-3).
    registry.with_save_lifecycle_lock(&lease, || {
        // Re-read under the same lifecycle lock that reload/close must take;
        // a stale snapshot can no longer authorize receipt commit or mutate a
        // newer binding generation.
        let current = registry.get(session_id).ok_or_else(|| {
            LosslessError::session_missing(format!("session {session_id:?} not found"))
        })?;
        if current.document_id != req.document_id
            || current.binding_generation().0 != lease.binding_generation
        {
            return Err(LosslessError::wrong_identity(
                "commit 已不属于当前 document generation",
            ));
        }
        if req.persisted_revision > current.revision().0 {
            return Err(LosslessError::new(
                "stale-revision",
                "commit persisted revision 高于当前 confirmed revision",
            ));
        }
        guarded_write::mark_committed(
            &req.save_operation_id,
            session_id.0,
            req.document_id.0,
            lease.binding_generation,
            req.persisted_revision,
            receipt_epoch,
            &req.new_file_identity,
        )?;
        registry
            .update(session_id, |session| {
                if session.document_id != req.document_id
                    || session.binding_generation().0 != lease.binding_generation
                {
                    return Err(LosslessError::wrong_identity(
                        "commit registry 更新时 binding generation 已变化",
                    ));
                }
                session
                    .mark_persisted(
                        markflow_core::Revision(req.persisted_revision),
                        Some(req.new_file_identity),
                    )
                    .map_err(LosslessError::from)
            })
            .ok_or_else(|| {
                LosslessError::session_missing(format!("session {session_id:?} not found"))
            })??;
        Ok(())
    })
}

/// Reload a session from new disk bytes (same session/document identity, new
/// binding generation). Delayed patches from the old image are rejected.
#[tauri::command]
pub fn reload_lossless_document(
    req: ReloadDocumentRequest,
    state: State<AppState>,
) -> Result<LosslessOpenResponse, LosslessError> {
    let registry = &state.lossless_registry;
    let session_id = req.session_id;
    registry.with_lifecycle_transition(session_id, || {
        let path = PathBuf::from(&req.path);
        let bytes = read_bytes(&path)?;
        let identity = current_file_identity(&path, &bytes);
        let default_eol = parse_default_eol(&req.default_eol)?;
        Ok(registry
            .update(session_id, |session| {
                session
                    .reload_with_identity(&bytes, default_eol, identity)
                    .map_err(LosslessError::from)?;
                Ok::<LosslessOpenResponse, LosslessError>(LosslessOpenResponse::from_session(
                    session,
                ))
            })
            .ok_or_else(|| {
                LosslessError::session_missing(format!("session {session_id:?} not found"))
            })??)
    })
}

/// Close a session and remove it from the registry. All timers/requests on the
/// frontend binding must be cancelled by the caller before this command.
#[tauri::command]
pub fn close_lossless_document(
    req: SessionRequest,
    state: State<AppState>,
) -> Result<(), LosslessError> {
    let registry = &state.lossless_registry;
    // Closing a missing session is idempotent (already closed/never opened).
    if !registry.contains(req.session_id) {
        return Ok(());
    }
    registry.with_lifecycle_transition(req.session_id, || {
        if let Some(mut session) = lock_mutex(&registry.sessions)
            .ok()
            .and_then(|mut sessions| sessions.remove(&req.session_id))
        {
            session.close();
        }
        Ok(())
    })
}

/// Result of `flush_document_session`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlushResult {
    pub revision: u64,
    pub confirmed_hash: String,
    pub persisted_revision: Option<u64>,
}

fn base64_encode(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

#[cfg(test)]
mod lifecycle_lock_tests {
    use super::*;
    use std::sync::{mpsc, Arc, Barrier};
    use std::time::Duration;

    fn registry_with_session() -> Arc<LosslessSessionRegistry> {
        let registry = Arc::new(LosslessSessionRegistry::new());
        let session = LosslessDocumentSession::open_bytes(
            SessionId(41),
            DocumentId(42),
            b"old",
            LineEndingKind::Lf,
        )
        .expect("test session");
        registry.insert(session);
        registry
    }

    #[test]
    fn lifecycle_lock_linearizes_replace_point_with_reload_or_close_revoke() {
        // A lifecycle transition that wins before the replacement point makes
        // the lease unusable: no native syscall closure is entered.
        let before = registry_with_session();
        let before_lease = before
            .capture_save_lease(SessionId(41), DocumentId(42), 0)
            .expect("lease");
        before
            .with_lifecycle_transition(SessionId(41), || Ok::<_, LosslessError>(()))
            .expect("reload/close transition");
        assert_eq!(
            before
                .with_save_lifecycle_lock(&before_lease, || Ok::<_, LosslessError>(()))
                .expect_err("revoke before replacement must win")
                .code,
            "wrong-identity"
        );

        // Conversely, once a replacement/commit has acquired the lifecycle
        // lock, reload/close waits. The syscall closure therefore cannot have
        // a revocation inserted between its validation and the syscall.
        let after = registry_with_session();
        let after_lease = after
            .capture_save_lease(SessionId(41), DocumentId(42), 0)
            .expect("lease");
        let entered = Arc::new(Barrier::new(2));
        let release = Arc::new(Barrier::new(2));
        let writer_registry = Arc::clone(&after);
        let writer_entered = Arc::clone(&entered);
        let writer_release = Arc::clone(&release);
        let writer = std::thread::spawn(move || {
            writer_registry.with_save_lifecycle_lock(&after_lease, || {
                writer_entered.wait(); // deterministic "immediately before syscall" barrier
                writer_release.wait();
                Ok::<_, LosslessError>(())
            })
        });
        entered.wait();

        let (revoked_tx, revoked_rx) = mpsc::channel();
        let reloader_registry = Arc::clone(&after);
        let reloader = std::thread::spawn(move || {
            reloader_registry
                .with_lifecycle_transition(SessionId(41), || Ok::<_, LosslessError>(()))
                .expect("reload/close transition");
            revoked_tx.send(()).expect("report revoke");
        });
        assert!(
            matches!(
                revoked_rx.recv_timeout(Duration::from_millis(80)),
                Err(mpsc::RecvTimeoutError::Timeout)
            ),
            "reload/close revoke must wait while validated replacement closure owns the lock"
        );
        release.wait();
        writer
            .join()
            .expect("writer thread")
            .expect("replacement closure");
        revoked_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("revoke completes after replacement linearizes");
        reloader.join().expect("reloader thread");
    }
}
