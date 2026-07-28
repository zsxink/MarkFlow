use crate::file_identity::FileIdentity;
use markflow_core::DocumentSession;
use std::sync::Mutex;

// ---------------------------------------------------------------------------
// Re-export core identifiers (they are used throughout the runtime)
// ---------------------------------------------------------------------------

pub use markflow_core::{DocumentId, Revision, SessionId};

// ---------------------------------------------------------------------------
// Runtime-only identifiers
// ---------------------------------------------------------------------------

/// Unique request identifier for Bridge protocol.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct RequestId(u64);

impl RequestId {
    pub fn new(id: u64) -> Self {
        Self(id)
    }

    pub fn as_u64(&self) -> u64 {
        self.0
    }
}

impl std::fmt::Display for RequestId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Client/connection identifier.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ClientId(pub String);

/// Token that prevents concurrent save on the same session.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SaveToken(u64);

impl SaveToken {
    pub fn new(id: u64) -> Self {
        Self(id)
    }
}

/// Unique transaction id for patch tracking (from frontend).
pub type TransactionId = String;

/// Key used to index sessions by document path in the registry.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct DocumentSourceKey(pub String);

// ---------------------------------------------------------------------------
// Id allocator (simple atomic counter)
// ---------------------------------------------------------------------------

use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_REQUEST_ID: AtomicU64 = AtomicU64::new(1);
static NEXT_SAVE_TOKEN: AtomicU64 = AtomicU64::new(1);

pub fn allocate_request_id() -> RequestId {
    RequestId(NEXT_REQUEST_ID.fetch_add(1, Ordering::Relaxed))
}

pub fn allocate_save_token() -> SaveToken {
    SaveToken(NEXT_SAVE_TOKEN.fetch_add(1, Ordering::Relaxed))
}

// ---------------------------------------------------------------------------
// DocumentCapabilities
// ---------------------------------------------------------------------------

/// Flags describing what operations are allowed for a document/session.
#[derive(Debug, Clone)]
pub struct DocumentCapabilities {
    /// Whether the document is writable.
    pub writable: bool,
    /// Whether patch editing is enabled.
    pub patch_editing: bool,
    /// Whether core-backed save is enabled.
    pub core_save: bool,
}

impl DocumentCapabilities {
    pub fn default_with_source(source: &crate::source::DocumentSource) -> Self {
        match source.source_kind {
            crate::source::DocumentSourceKind::DiskFile => Self {
                writable: true,
                patch_editing: true,
                core_save: true,
            },
            crate::source::DocumentSourceKind::Untitled => Self {
                writable: true,
                patch_editing: true,
                core_save: true,
            },
        }
    }
}

// ---------------------------------------------------------------------------
// DocumentRuntimeState
// ---------------------------------------------------------------------------

/// The per-session runtime state, protected by a per-session Mutex.
pub struct DocumentRuntimeState {
    /// The core DocumentSession (document truth).
    pub core: DocumentSession,
    /// File identity at open time.
    pub opened_identity: FileIdentity,
    /// The revision that was last successfully persisted (saved).
    pub persisted_revision: Revision,
    /// File identity after last successful save.
    pub persisted_identity: Option<FileIdentity>,
    /// Token preventing concurrent saves. None = no save in progress.
    pub save_in_progress: Option<SaveToken>,
    /// Capabilities for this session.
    pub capabilities: DocumentCapabilities,
}

impl std::fmt::Debug for DocumentRuntimeState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DocumentRuntimeState")
            .field("persisted_revision", &self.persisted_revision)
            .field("persisted_identity", &self.persisted_identity)
            .field("save_in_progress", &self.save_in_progress)
            .field("capabilities", &self.capabilities)
            .field("core_revision", &self.core.revision())
            .finish()
    }
}

impl DocumentRuntimeState {
    pub fn new(core: DocumentSession, opened_identity: FileIdentity) -> Self {
        let persisted_revision = core.revision();
        let capabilities = DocumentCapabilities {
            writable: true,
            patch_editing: true,
            core_save: true,
        };
        Self {
            core,
            opened_identity,
            persisted_revision,
            persisted_identity: None,
            save_in_progress: None,
            capabilities,
        }
    }

    /// Check if the document is dirty (has unpersisted changes).
    pub fn is_dirty(&self) -> bool {
        self.core.revision() != self.persisted_revision
    }

    /// The number of uncommitted revisions.
    pub fn dirty_revision_count(&self) -> u64 {
        self.core
            .revision()
            .0
            .saturating_sub(self.persisted_revision.0)
    }
}

// ---------------------------------------------------------------------------
// SessionHandle
// ---------------------------------------------------------------------------

/// A handle to a registered session, accessible via Arc.
pub struct SessionHandle {
    pub session_id: SessionId,
    pub client_id: ClientId,
    pub window_label: String,
    pub source: crate::source::DocumentSource,
    pub inner: Mutex<DocumentRuntimeState>,
}

impl std::fmt::Debug for SessionHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let persisted = self.inner.lock().map(|s| s.persisted_revision).ok();
        f.debug_struct("SessionHandle")
            .field("session_id", &self.session_id)
            .field("client_id", &self.client_id)
            .field("window_label", &self.window_label)
            .field("source", &self.source)
            .field("persisted_revision", &persisted)
            .finish()
    }
}
