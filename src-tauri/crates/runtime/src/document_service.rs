use crate::error::{RuntimeError, RuntimeErrorCode};
use crate::host::Host;
use crate::registry::SessionRegistry;
use crate::session::SessionId;
use std::sync::Arc;

/// DocumentService provides business logic for document operations.
/// Commands delegate to this service, keeping the Tauri command layer thin.
pub struct DocumentService {
    registry: Arc<SessionRegistry>,
}

impl DocumentService {
    pub fn new(registry: Arc<SessionRegistry>) -> Self {
        Self { registry }
    }

    /// Close a document session.
    pub fn close_document(&self, session_id: SessionId) -> Result<(), RuntimeError> {
        self.registry.close(session_id)
    }

    /// Get the confirmed revision from a session.
    pub fn get_revision(&self, session_id: SessionId) -> Result<u64, RuntimeError> {
        let handle = self
            .registry
            .get(session_id)
            .ok_or_else(RuntimeError::session_not_found)?;
        let state = handle
            .inner
            .lock()
            .map_err(|e| RuntimeError::internal(format!("Session lock poisoned: {}", e)))?;
        Ok(state.core.revision().0)
    }

    /// Reload a document from disk via the Host.
    ///
    /// 1. Get the file path (outside session lock)
    /// 2. Read via host outside session lock
    /// 3. Re-acquire lock, verify session is clean (no unpersisted changes)
    /// 4. Create new Core state from loaded bytes, atomically replace
    pub fn reload_document(
        &self,
        session_id: SessionId,
        host: &dyn Host,
    ) -> Result<(String, u64), RuntimeError> {
        // Get the path outside the session lock
        let path = {
            let handle = self
                .registry
                .get(session_id)
                .ok_or_else(RuntimeError::session_not_found)?;
            handle.source.path.clone()
        };

        let path = path.ok_or_else(|| RuntimeError::internal("No path for reload"))?;

        // Read via host outside session lock
        let (bytes, _identity) = host.read_document_bytes(&path)?;

        // Re-acquire lock
        let handle = self
            .registry
            .get(session_id)
            .ok_or_else(RuntimeError::session_not_found)?;
        let mut state = handle
            .inner
            .lock()
            .map_err(|e| RuntimeError::internal(format!("Session lock poisoned: {}", e)))?;

        // Verify session is clean (no dirty unpersisted changes)
        if state.is_dirty() {
            return Err(RuntimeError::new(
                RuntimeErrorCode::TransactionConflict,
                "Cannot reload: session has unpersisted changes",
            ));
        }

        // Create new Core session from loaded bytes
        let core_session =
            markflow_core::DocumentSession::open_bytes(session_id, state.core.document_id, &bytes)
                .map_err(RuntimeError::from)?;

        // Atomically replace Core state
        state.core = core_session;

        let text = state.core.text().logical_text().to_string();
        let revision = state.core.revision().0;

        Ok((text, revision))
    }
}
