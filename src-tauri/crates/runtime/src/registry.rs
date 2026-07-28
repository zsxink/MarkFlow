use crate::error::RuntimeError;
use crate::file_identity::FileIdentity;
use crate::session::{
    ClientId, DocumentRuntimeState, DocumentSourceKey, SessionHandle, SessionId,
};
use crate::source::DocumentSource;

use dashmap::DashMap;
use markflow_core::{DocumentId, DocumentSession};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

/// Allocate a session id using an atomic counter.
/// This is separate from core's SessionId allocation to give runtime control.
fn allocate_session_id() -> SessionId {
    static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);
    SessionId(NEXT_SESSION_ID.fetch_add(1, Ordering::Relaxed))
}

/// Registry of all active Core sessions.
///
/// Concurrency model:
/// - DashMap for sessions and path_index (lock-free concurrent reads).
/// - Per-session Mutex for DocumentRuntimeState (critical section only — no await/IO inside).
/// - Lock discipline: never hold a session lock while acquiring another.
pub struct SessionRegistry {
    sessions: DashMap<SessionId, Arc<SessionHandle>>,
    path_index: DashMap<DocumentSourceKey, Vec<SessionId>>,
    next_document_id: AtomicU64,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self {
            sessions: DashMap::new(),
            path_index: DashMap::new(),
            next_document_id: AtomicU64::new(1),
        }
    }

    /// Allocate a unique document ID.
    fn allocate_document_id(&self) -> DocumentId {
        DocumentId(self.next_document_id.fetch_add(1, Ordering::Relaxed))
    }

    /// Create a new Core session and register it.
    ///
    /// `opener` is a closure that creates a DocumentSession.
    /// This allows the caller to control how bytes are read (via Host).
    pub fn create(
        &self,
        client_id: ClientId,
        window_label: String,
        source: DocumentSource,
        opened_identity: FileIdentity,
        opener: impl FnOnce(SessionId, DocumentId) -> Result<DocumentSession, RuntimeError>,
    ) -> Result<SessionId, RuntimeError> {
        let session_id = allocate_session_id();
        let document_id = self.allocate_document_id();

        let core = opener(session_id, document_id)?;

        let state = DocumentRuntimeState::new(core, opened_identity);

        let handle = Arc::new(SessionHandle {
            session_id,
            client_id,
            window_label,
            source: source.clone(),
            inner: Mutex::new(state),
        });

        // Register session
        self.sessions.insert(session_id, handle);

        // Index by path if applicable — log a warning if another session
        // already exists for the same path (valid multi-session scenario,
        // but the caller should be aware).
        if let Some(key) = source.source_key() {
            let existing = self.list_by_path(&key.0);
            if !existing.is_empty() {
                tracing::warn!(
                    target: "runtime.registry",
                    path = %key.0,
                    existing_sessions = ?existing,
                    new_session_id = session_id.0,
                    "Multiple sessions for the same path"
                );
            }
            self.path_index.entry(key).or_insert_with(Vec::new).push(session_id);
        }

        tracing::debug!(target: "runtime.registry", session_id = session_id.0, "Session created");
        Ok(session_id)
    }

    /// Get a session handle by ID.
    pub fn get(&self, session_id: SessionId) -> Option<Arc<SessionHandle>> {
        self.sessions.get(&session_id).map(|r| r.value().clone())
    }

    /// Close a session: remove from registry and path index.
    pub fn close(&self, session_id: SessionId) -> Result<(), RuntimeError> {
        let handle = self.sessions.remove(&session_id);
        if let Some((_, handle)) = handle {
            // Clean up path index
            if let Some(key) = handle.source.source_key() {
                if let dashmap::mapref::entry::Entry::Occupied(mut entry) =
                    self.path_index.entry(key)
                {
                    let sessions = entry.get_mut();
                    sessions.retain(|id| *id != session_id);
                    if sessions.is_empty() {
                        entry.remove();
                    }
                }
            }
            tracing::debug!(target: "runtime.registry", session_id = session_id.0, "Session closed");
            Ok(())
        } else {
            Err(RuntimeError::session_not_found())
        }
    }

    /// List all session IDs for a given document path.
    pub fn list_by_path(&self, path: &str) -> Vec<SessionId> {
        let key = DocumentSourceKey(path.to_string());
        self.path_index
            .get(&key)
            .map(|r| r.value().clone())
            .unwrap_or_default()
    }

    /// Check if a session exists.
    pub fn exists(&self, session_id: SessionId) -> bool {
        self.sessions.contains_key(&session_id)
    }

    /// Number of active sessions.
    pub fn len(&self) -> usize {
        self.sessions.len()
    }

    /// Whether the registry is empty.
    pub fn is_empty(&self) -> bool {
        self.sessions.is_empty()
    }
}

impl Default for SessionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Helper: execute a function with a session lock, returning a RuntimeError if
// the session is not found.
// ---------------------------------------------------------------------------

/// Execute `f` with the session's inner state locked.
/// Returns `SESSION_NOT_FOUND` if the session doesn't exist.
pub fn with_session_state<T>(
    registry: &SessionRegistry,
    session_id: SessionId,
    f: impl FnOnce(&mut DocumentRuntimeState) -> Result<T, RuntimeError>,
) -> Result<T, RuntimeError> {
    let handle = registry
        .get(session_id)
        .ok_or_else(RuntimeError::session_not_found)?;
    let mut state = handle
        .inner
        .lock()
        .map_err(|e| RuntimeError::internal(format!("Session lock poisoned: {}", e)))?;
    f(&mut state)
}