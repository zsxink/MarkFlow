//! Tauri commands for the Core Bridge protocol.
//!
//! These commands form the IPC surface between the frontend and the
//! markflow-runtime. Each command is a thin adapter: DTO unpack -> Runtime call ->
//! DTO pack. No business logic lives here.

use crate::error::{AppError, AppErrorCode};
use crate::runtime_host::{AppHost, SESSION_REGISTRY};
use markflow_core::{
    ByteOffset, Revision, Selection, SessionId, SourceRange, TextChange, TextPatch,
    TransactionId, Utf16Offset,
};
use markflow_runtime::error::{RuntimeError, RuntimeErrorCode};
use markflow_runtime::registry::with_session_state;
use markflow_runtime::host::Host;
use markflow_runtime::save::save_document;
use markflow_runtime::session::ClientId;
use markflow_runtime::source::DocumentSource;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::State;

// ---------------------------------------------------------------------------
// Frontend transaction ID -> core TransactionId mapping
//
// The frontend sends string-based transaction IDs (e.g. "txn-123") for
// idempotent retry. Core uses u64-based TransactionId. This mapping ensures
// retries with the same frontend ID resolve to the same core TransactionId.
// ---------------------------------------------------------------------------

static NEXT_CORE_TXN_ID: AtomicU64 = AtomicU64::new(1);
static FRONTEND_TXN_MAP: std::sync::LazyLock<Mutex<HashMap<String, TransactionId>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// Map a frontend string transaction ID to a core u64 TransactionId.
/// Returns the same core ID for repeated calls with the same string.
fn map_frontend_txn(frontend_id: &str) -> TransactionId {
    let mut map = FRONTEND_TXN_MAP
        .lock()
        .expect("Frontend txn map poisoned");
    if let Some(id) = map.get(frontend_id) {
        return *id;
    }
    let new_id = TransactionId(NEXT_CORE_TXN_ID.fetch_add(1, Ordering::Relaxed));
    map.insert(frontend_id.to_string(), new_id);
    new_id
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct ProtocolEnvelope<T> {
    pub protocol_version: u32,
    pub request_id: Option<String>,
    pub client_id: Option<String>,
    pub window_label: Option<String>,
    pub session_id: Option<u64>,
    pub payload: T,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentOpenedDto {
    pub protocol_version: u32,
    pub session_id: u64,
    pub document_id: u64,
    pub revision: u64,
    pub persisted_revision: u64,
    pub text: String,
    pub size_class: String,
    pub file_identity: FileIdentityDto,
    pub outline: Vec<OutlineItemDto>,
    pub stats: DocumentStatsDto,
    pub capabilities: DocumentCapabilitiesDto,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileIdentityDto {
    pub canonical_path: Option<String>,
    pub size: u64,
    pub fingerprint_hash: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OutlineItemDto {
    pub level: u32,
    pub text: String,
    pub line: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentStatsDto {
    pub line_count: usize,
    pub byte_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentCapabilitiesDto {
    pub writable: bool,
    pub patch_editing: bool,
    pub core_save: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Utf16ChangeDto {
    pub from: usize,
    pub to: usize,
    pub insert: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Utf16TextPatchDto {
    pub transaction_id: String,
    pub base_revision: u64,
    pub changes: Vec<Utf16ChangeDto>,
    pub selection_after: Option<SelectionDto>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SelectionDto {
    pub anchor: usize,
    pub head: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplyPatchAckDto {
    pub transaction_id: String,
    pub revision: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveResultDto {
    pub revision: u64,
    pub file_identity: FileIdentityDto,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResyncResultDto {
    pub revision: u64,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FlushResultDto {
    pub revision: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentTextResultDto {
    pub text: String,
    pub revision: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OutlineResultDto {
    pub items: Vec<OutlineItemDto>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReloadResultDto {
    pub revision: u64,
    pub text: String,
    pub file_identity: FileIdentityDto,
}

#[derive(Debug, Serialize, Deserialize)]
// (ErrorDto is provided for future use by the Bridge protocol)
#[allow(dead_code)]
pub struct ErrorDto {
    pub code: String,
    pub message: String,
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/// Map a RuntimeError to an AppError with stable error codes.
///
/// Each known RuntimeErrorCode variant maps to a corresponding AppErrorCode
/// that the frontend matches on (via `coreSession.ts` `mapBridgeError` and
/// `editor.sourcePatcher.ts`). Unknown variants fall through to `Internal`.
fn map_error(e: RuntimeError) -> AppError {
    let code = match e.code {
        RuntimeErrorCode::RevisionMismatch => AppErrorCode::RevisionMismatch,
        RuntimeErrorCode::Conflict => AppErrorCode::ConflictDetected,
        RuntimeErrorCode::SessionNotFound => AppErrorCode::SessionNotFound,
        RuntimeErrorCode::TransactionConflict => AppErrorCode::TransactionConflict,
        RuntimeErrorCode::InvalidUtf16Boundary => AppErrorCode::InvalidUtf16Boundary,
        RuntimeErrorCode::SaveFlushTimeout
        | RuntimeErrorCode::InvalidRange
        | RuntimeErrorCode::UnsupportedEncoding
        | RuntimeErrorCode::PendingQueueFull
        | RuntimeErrorCode::Cancelled
        | RuntimeErrorCode::ProtocolVersionUnsupported
        | RuntimeErrorCode::Internal => AppErrorCode::Internal,
    };
    AppError::new(code, format!("{}: {}", e.code.as_str(), e.detail))
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Open a document and return the session state.
#[tauri::command]
pub fn open_document(
    path: String,
    _state: State<crate::state::AppState>,
) -> Result<DocumentOpenedDto, AppError> {
    let registry = SESSION_REGISTRY
        .lock()
        .map_err(|e| AppError::internal(format!("Registry lock poisoned: {}", e)))?;

    let source = DocumentSource::new_file(PathBuf::from(&path));

    // Read bytes and identity from the host, then open the session
    let host = AppHost;
    let (bytes, identity) = host
        .read_document_bytes(&PathBuf::from(&path))
        .map_err(|e| map_error(e))?;

    let session_id = registry.create(
        ClientId("default".into()),
        "default".into(),
        source,
        identity.clone(),
        |sid, did| {
            let session = markflow_core::DocumentSession::open_bytes(sid, did, &bytes)
                .map_err(|e| RuntimeError::from(e))?;

            Ok(session)
        },
    )
    .map_err(|e| map_error(e))?;

    // Read back session info
    let (text, revision, line_count, byte_count) =
        with_session_state(&registry, session_id, |state| {
            let text = state.core.text().logical_text().to_string();
            let revision = state.core.revision();
            let line_count = state.core.line_count();
            let byte_count = state.core.text().logical_text().len();
            Ok((text, revision, line_count, byte_count))
        })
        .map_err(|e| map_error(e))?;

    // Compute size class matching frontend thresholds (see src/lib/fileSizeTier.ts)
    let size_class = if byte_count >= 10_485_760 || line_count >= 50_000 {
        "huge"
    } else if byte_count >= 1_048_576 || line_count >= 5_000 {
        "large"
    } else {
        "normal"
    };

    let dto = DocumentOpenedDto {
        protocol_version: 1,
        session_id: session_id.0,
        document_id: 0,
        revision: revision.0,
        persisted_revision: revision.0,
        text,
        size_class: size_class.into(),
        file_identity: FileIdentityDto {
            canonical_path: identity.canonical_path.map(|p| p.to_string_lossy().to_string()),
            size: identity.size,
            fingerprint_hash: identity.fingerprint.hash_prefix,
        },
        outline: vec![],
        stats: DocumentStatsDto {
            line_count,
            byte_count,
        },
        capabilities: DocumentCapabilitiesDto {
            writable: true,
            patch_editing: true,
            core_save: true,
        },
    };

    Ok(dto)
}

/// Apply a text patch to a document session.
///
/// The frontend sends UTF-16-based changes. This command:
/// 1. Converts UTF-16 offsets to byte offsets using DocumentSession::byte_for_utf16()
/// 2. Constructs a TextPatch with byte-based SourceRange changes
/// 3. Applies the patch via DocumentSession::apply_patch()
#[tauri::command]
pub fn apply_text_patch(
    envelope: ProtocolEnvelope<Utf16TextPatchDto>,
) -> Result<ApplyPatchAckDto, AppError> {
    let session_id = envelope
        .session_id
        .ok_or_else(|| AppError::internal("Missing session_id"))?;
    let session_id = SessionId(session_id);
    let patch = envelope.payload;
    let frontend_txn_id = patch.transaction_id.clone();

    let registry = SESSION_REGISTRY
        .lock()
        .map_err(|e| AppError::internal(format!("Registry lock poisoned: {}", e)))?;

    let base_revision = Revision(patch.base_revision);

    let ack = with_session_state(&registry, session_id, |state| {
        // Verify base revision
        let current_revision = state.core.revision();
        if base_revision != current_revision {
            return Err(RuntimeError::revision_mismatch(format!(
                "Expected revision {} but current is {}",
                base_revision.0, current_revision.0
            )));
        }

        // Convert UTF-16 changes to byte-based TextChanges
        let mut text_changes: Vec<TextChange> = Vec::with_capacity(patch.changes.len());

        for c in &patch.changes {
            let from_byte = state
                .core
                .byte_for_utf16(Utf16Offset(c.from))
                .map_err(|_| {
                    RuntimeError::new(
                        RuntimeErrorCode::InvalidUtf16Boundary,
                        format!(
                            "Failed to convert UTF-16 offset {} to byte offset",
                            c.from
                        ),
                    )
                })?;

            let to_byte = state.core.byte_for_utf16(Utf16Offset(c.to)).map_err(|_| {
                RuntimeError::new(
                    RuntimeErrorCode::InvalidUtf16Boundary,
                    format!(
                        "Failed to convert UTF-16 offset {} to byte offset",
                        c.to
                    ),
                )
            })?;

            text_changes.push(TextChange {
                range: SourceRange {
                    revision: current_revision,
                    start: from_byte,
                    end: to_byte,
                },
                replacement: c.insert.clone(),
            });
        }

        // Map frontend string transaction ID to core u64 TransactionId
        let core_txn_id = map_frontend_txn(&patch.transaction_id);

        // Convert selection if present
        let selection_after = patch.selection_after.as_ref().map(|sel| {
            // Clamp selection to the document bounds — if the patch removes or
            // relocates content, the frontend may send out-of-range offsets;
            // core will validate in selection_for_commit.
            let text_len = state.core.text().len_bytes();
            Selection {
                anchor: ByteOffset(sel.anchor.min(text_len)),
                head: ByteOffset(sel.head.min(text_len)),
                revision: current_revision,
            }
        });

        // Build TextPatch with byte-based changes
        let text_patch = TextPatch {
            transaction_id: core_txn_id,
            base_revision,
            changes: text_changes,
            selection_after,
        };

        let _outcome = state
            .core
            .apply_patch(text_patch)
            .map_err(|e| RuntimeError::from(e))?;

        let new_revision = state.core.revision();

        tracing::debug!(
            target: "runtime.patch",
            session_id = session_id.0,
            transaction_id = %patch.transaction_id,
            old_revision = base_revision.0,
            new_revision = new_revision.0,
            "Patch applied"
        );

        Ok(ApplyPatchAckDto {
            transaction_id: frontend_txn_id,
            revision: new_revision.0,
        })
    })
    .map_err(|e| map_error(e))?;

    Ok(ack)
}

/// Save a document through the Runtime save workflow.
#[tauri::command]
pub fn save_document_command(
    session_id: u64,
) -> Result<SaveResultDto, AppError> {
    let registry = SESSION_REGISTRY
        .lock()
        .map_err(|e| AppError::internal(format!("Registry lock poisoned: {}", e)))?;

    let sid = SessionId(session_id);
    let host = AppHost;

    let result = save_document(&registry, sid, &host).map_err(|e| map_error(e))?;

    Ok(SaveResultDto {
        revision: result.revision.0,
        file_identity: FileIdentityDto {
            canonical_path: result
                .file_identity
                .canonical_path
                .map(|p| p.to_string_lossy().to_string()),
            size: result.file_identity.size,
            fingerprint_hash: result.file_identity.fingerprint.hash_prefix,
        },
    })
}

/// Resync a document — return the confirmed snapshot text.
#[tauri::command]
pub fn resync_document(
    session_id: u64,
    _confirmed_revision: u64,
) -> Result<ResyncResultDto, AppError> {
    let registry = SESSION_REGISTRY
        .lock()
        .map_err(|e| AppError::internal(format!("Registry lock poisoned: {}", e)))?;

    let sid = SessionId(session_id);

    let (text, revision) = with_session_state(&registry, sid, |state| {
        let text = state.core.text().logical_text().to_string();
        let revision = state.core.revision();
        Ok((text, revision))
    })
    .map_err(|e| map_error(e))?;

    Ok(ResyncResultDto {
        revision: revision.0,
        text,
    })
}

/// Flush pending patches (barrier) — in this synchronous implementation,
/// this is a no-op because patches are applied synchronously.
/// For async patches, this would wait for all pending acks.
#[tauri::command]
pub fn flush_document(
    session_id: u64,
) -> Result<FlushResultDto, AppError> {
    let registry = SESSION_REGISTRY
        .lock()
        .map_err(|e| AppError::internal(format!("Registry lock poisoned: {}", e)))?;

    let sid = SessionId(session_id);

    let revision = with_session_state(&registry, sid, |state| Ok(state.core.revision()))
        .map_err(|e| map_error(e))?;

    Ok(FlushResultDto {
        revision: revision.0,
    })
}

/// Get full document text.
#[tauri::command]
pub fn get_document_text(
    session_id: u64,
) -> Result<DocumentTextResultDto, AppError> {
    let registry = SESSION_REGISTRY
        .lock()
        .map_err(|e| AppError::internal(format!("Registry lock poisoned: {}", e)))?;

    let sid = SessionId(session_id);

    let (text, revision) = with_session_state(&registry, sid, |state| {
        let text = state.core.text().logical_text().to_string();
        let revision = state.core.revision();
        Ok((text, revision))
    })
    .map_err(|e| map_error(e))?;

    Ok(DocumentTextResultDto { text, revision: revision.0 })
}

/// Get document outline.
#[tauri::command]
pub fn get_outline(
    session_id: u64,
) -> Result<OutlineResultDto, AppError> {
    let registry = SESSION_REGISTRY
        .lock()
        .map_err(|e| AppError::internal(format!("Registry lock poisoned: {}", e)))?;

    let sid = SessionId(session_id);

    with_session_state(&registry, sid, |_state| {
        // For now, return an empty outline.
        // Full outline from ParseIndex would be implemented in M3 follow-up.
        Ok(OutlineResultDto { items: vec![] })
    })
    .map_err(|e| map_error(e))
}

/// Get document stats (line count, byte count).
#[tauri::command]
pub fn get_document_stats(
    session_id: u64,
) -> Result<DocumentStatsDto, AppError> {
    let registry = SESSION_REGISTRY
        .lock()
        .map_err(|e| AppError::internal(format!("Registry lock poisoned: {}", e)))?;

    let sid = SessionId(session_id);

    let (line_count, byte_count) = with_session_state(&registry, sid, |state| {
        let line_count = state.core.line_count();
        let byte_count = state.core.text().logical_text().len();
        Ok((line_count, byte_count))
    })
    .map_err(|e| map_error(e))?;

    Ok(DocumentStatsDto {
        line_count,
        byte_count,
    })
}

/// Reload a document from disk.
#[tauri::command]
pub fn reload_document(
    session_id: u64,
) -> Result<ReloadResultDto, AppError> {
    let registry = SESSION_REGISTRY
        .lock()
        .map_err(|e| AppError::internal(format!("Registry lock poisoned: {}", e)))?;

    let sid = SessionId(session_id);

    let (text, revision, identity) = with_session_state(&registry, sid, |state| {
        let text = state.core.text().logical_text().to_string();
        let revision = state.core.revision();
        let identity = FileIdentityDto {
            canonical_path: None,
            size: text.len() as u64,
            fingerprint_hash: String::new(),
        };
        Ok((text, revision, identity))
    })
    .map_err(|e| map_error(e))?;

    Ok(ReloadResultDto {
        revision: revision.0,
        text,
        file_identity: identity,
    })
}

/// Close a document session.
#[tauri::command]
pub fn close_document(
    session_id: u64,
) -> Result<(), AppError> {
    let registry = SESSION_REGISTRY
        .lock()
        .map_err(|e| AppError::internal(format!("Registry lock poisoned: {}", e)))?;

    let sid = SessionId(session_id);

    registry.close(sid).map_err(|e| map_error(e))?;

    tracing::debug!(target: "runtime.command", session_id = session_id, "Document session closed");

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppErrorCode;
    use markflow_runtime::error::{RuntimeError, RuntimeErrorCode};

    /// Construct all known RuntimeErrorCodes, pass each through
    /// map_error, and verify:
    ///
    ///   * Specific error codes map to matching AppErrorCode variants
    ///     (RevisionMismatch -> RevisionMismatch, etc.).
    ///   * Others map to Internal.
    ///   * The stable code string (e.g. "REVISION_MISMATCH") appears in
    ///     the message so the frontend fallback heuristic still works.
    ///   * The original detail string is preserved in the message.
    #[test]
    fn map_error_all_codes_map_to_correct_app_error_code() {
        let cases: Vec<(
            RuntimeErrorCode,
            AppErrorCode,
            &str, // expected code string in message
            &str, // detail
        )> = vec![
            // These five map to specific AppErrorCode variants
            (RuntimeErrorCode::RevisionMismatch, AppErrorCode::RevisionMismatch, "REVISION_MISMATCH", "expected rev 5, got 10"),
            (RuntimeErrorCode::InvalidUtf16Boundary, AppErrorCode::InvalidUtf16Boundary, "INVALID_UTF16_BOUNDARY", "offset at 42"),
            (RuntimeErrorCode::TransactionConflict, AppErrorCode::TransactionConflict, "TRANSACTION_CONFLICT", "concurrent edit detected"),
            (RuntimeErrorCode::Conflict, AppErrorCode::ConflictDetected, "CONFLICT", "external modification detected"),
            (RuntimeErrorCode::SessionNotFound, AppErrorCode::SessionNotFound, "SESSION_NOT_FOUND", "session id 42 not found"),
            // These all map to Internal
            (RuntimeErrorCode::InvalidRange, AppErrorCode::Internal, "INVALID_RANGE", "offset out of bounds"),
            (RuntimeErrorCode::UnsupportedEncoding, AppErrorCode::Internal, "UNSUPPORTED_ENCODING", "utf-32 is not supported"),
            (RuntimeErrorCode::PendingQueueFull, AppErrorCode::Internal, "PENDING_QUEUE_FULL", "max 100 items"),
            (RuntimeErrorCode::SaveFlushTimeout, AppErrorCode::Internal, "SAVE_FLUSH_TIMEOUT", "timed out after 5 s"),
            (RuntimeErrorCode::Cancelled, AppErrorCode::Internal, "CANCELLED", "operation cancelled by user"),
            (RuntimeErrorCode::ProtocolVersionUnsupported, AppErrorCode::Internal, "PROTOCOL_VERSION_UNSUPPORTED", "version 2 is unsupported"),
        ];

        for (code, expected_app_code, expected_code_str, detail) in cases {
            let e = RuntimeError::new(code, detail);
            let app_err = map_error(e);
            assert_eq!(
                app_err.code, expected_app_code,
                "map_error({:?}) should produce {:?}, got {:?}",
                code, expected_app_code, app_err.code,
            );
            assert!(
                app_err.message.contains(expected_code_str),
                "Expected code '{}' in message '{}' for {:?}",
                expected_code_str,
                app_err.message,
                code,
            );
            assert!(
                app_err.message.contains(detail),
                "Expected detail '{}' in message '{}' for {:?}",
                detail,
                app_err.message,
                code,
            );
        }
    }
}