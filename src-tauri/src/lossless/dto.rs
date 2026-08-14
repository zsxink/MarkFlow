//! Bridge DTOs — P1B task 3.1.
//!
//! Every request/response carries the identity fields from design 02 §2. Error
//! responses are structured `{ code, message }` so the frontend branches on the
//! stable `code`, never on an English message.

use markflow_core::{
    DocumentId, FileIdentity, LosslessDocumentSession, OriginalSnapshot, SessionId,
};
use serde::{Deserialize, Serialize};

/// Stable, machine-branchable bridge error. `code` mirrors the Core error
/// taxonomy (design 02 §8) plus bridge-specific codes.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LosslessError {
    pub code: String,
    pub message: String,
}

impl LosslessError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self::new("io", message)
    }

    pub fn invalid_encoding(message: impl Into<String>) -> Self {
        Self::new("invalid-encoding", message)
    }

    pub fn session_missing(message: impl Into<String>) -> Self {
        Self::new("session-missing", message)
    }

    pub fn wrong_identity(message: impl Into<String>) -> Self {
        Self::new("wrong-identity", message)
    }
}

impl std::fmt::Display for LosslessError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for LosslessError {}

impl From<markflow_core::CoreError> for LosslessError {
    fn from(err: markflow_core::CoreError) -> Self {
        Self::new(err.code(), err.to_string())
    }
}

// ── Requests ───────────────────────────────────────────────────────────

/// `open_lossless_document`
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenDocumentRequest {
    pub path: String,
    /// Frozen default EOL for tie-break / newline-less files: "lf" | "crlf" | "cr".
    pub default_eol: String,
}

/// `apply_document_patch` — UTF-16 bridge patch (design 02 §3).
///
/// The frontend sends CodeMirror-native UTF-16 offsets (`fromUtf16`/`toUtf16`);
/// the Rust bridge converts them to logical byte offsets via the session's
/// PositionMap before calling Core (design 01 §4 — the bridge carries the
/// explicit coordinate system in the field name).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchRequest {
    pub patch: BridgeTextPatch,
}

/// One change in the base revision's UTF-16 coordinates.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeTextChange {
    pub from_utf16: u64,
    pub to_utf16: u64,
    pub inserted_logical_text: String,
    pub inserted_line_endings: Vec<String>,
}

/// Selection-after in UTF-16 coordinates (CodeMirror native).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeSelectionAfter {
    pub anchor_utf16: u64,
    pub head_utf16: u64,
}

/// The full identity matrix (design 02 §2): bindingGeneration, sessionId,
/// documentId, baseRevision, transactionId.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeTextPatch {
    pub binding_generation: u64,
    pub session_id: u64,
    pub document_id: u64,
    pub transaction_id: u64,
    pub base_revision: u64,
    pub changes: Vec<BridgeTextChange>,
    pub selection_after: Option<BridgeSelectionAfter>,
}

/// `get_document_snapshot` / `flush_document_session` / `close_lossless_document`
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRequest {
    pub session_id: SessionId,
}

/// `prepare_document_save` — carries the save identity matrix (design 02 §2):
/// sessionId, documentId, expectedRevision, expectedFileIdentity,
/// saveOperationId. New input at a higher optimistic revision is NOT a stale
/// condition for a save; the expected revision is the one being persisted.
/// `expected_file_identity` is `None` for Save As / New File (target expected
/// absent); the payload is still derived from the confirmed Core revision.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareSaveRequest {
    pub session_id: SessionId,
    pub document_id: DocumentId,
    pub expected_revision: u64,
    pub expected_file_identity: Option<FileIdentity>,
    pub save_operation_id: String,
    pub path: String,
}

/// `commit_document_save`
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitSaveRequest {
    pub session_id: SessionId,
    pub document_id: DocumentId,
    pub persisted_revision: u64,
    pub new_file_identity: FileIdentity,
}

/// `reload_lossless_document`
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReloadDocumentRequest {
    pub session_id: SessionId,
    pub path: String,
    pub default_eol: String,
}

// ── Responses ──────────────────────────────────────────────────────────

/// `open_lossless_document` / `reload_lossless_document`
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LosslessOpenResponse {
    pub session_id: u64,
    pub document_id: u64,
    pub binding_generation: u64,
    pub logical_text: String,
    pub revision: u64,
    pub persisted_revision: u64,
    pub confirmed_hash: String,
    pub original: OriginalSnapshot,
}

impl LosslessOpenResponse {
    pub fn from_session(session: &LosslessDocumentSession) -> Self {
        Self {
            session_id: session.session_id.0,
            document_id: session.document_id.0,
            binding_generation: session.binding_generation().0,
            logical_text: session.text().logical_text().to_string(),
            revision: session.revision().0,
            persisted_revision: session.persisted_revision().map(|r| r.0).unwrap_or(0),
            confirmed_hash: session.confirmed_hash().hex(),
            original: session.original().clone(),
        }
    }
}

/// `prepare_document_save`
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareSaveResponse {
    pub save_operation_id: String,
    pub session_id: u64,
    pub document_id: u64,
    pub revision: u64,
    /// Confirmed Core payload as base64. This is the ONLY payload source that
    /// may be written; a guarded write with a different payload hash is rejected.
    pub payload_base64: String,
    pub payload_sha256: String,
}

/// A durable save receipt (design 04 §3). Persisted by the guarded-write host
/// so `reconcile_document_save` can classify outcome-unknown writes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveReceipt {
    pub save_operation_id: String,
    pub path: String,
    pub path_hash: String,
    /// `Some` → replace an existing target; `None` → target expected absent.
    pub expected_file_identity: Option<FileIdentity>,
    pub payload_sha256: String,
    pub state: ReceiptState,
}

/// Receipt lifecycle states.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReceiptState {
    Prepared,
    Written,
    Committed,
    Conflict,
}
