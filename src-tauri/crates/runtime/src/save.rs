use crate::error::{RuntimeError, RuntimeErrorCode};
use crate::file_identity::FileIdentity;
use crate::host::Host;
use crate::registry::SessionRegistry;
use crate::session::{allocate_save_token, SessionId};

/// Save a document: flush, capture payload, compare identity, atomic write,
/// mark persisted.
///
/// Implementation of the save workflow as specified in the design:
/// 1. Flush barrier (wait for all pending patches — handled by frontend adapter)
/// 2. Capture target_revision = confirmed_revision
/// 3. Core save_payload() -> bytes
/// 4. Host compare_and_atomic_write
/// 5. Mark persisted_revision = target_revision
pub fn save_document(
    registry: &SessionRegistry,
    session_id: SessionId,
    host: &dyn Host,
) -> Result<SaveResult, RuntimeError> {
    // 1. Acquire save token to prevent concurrent saves
    let token = allocate_save_token();

    // 2. Check for concurrent sessions on the same path before acquiring
    //    the main session lock (lock discipline: never hold one session
    //    lock while acquiring another — get our identity first, unlock,
    //    then check each other session individually).
    let our_identity = {
        let handle = registry
            .get(session_id)
            .ok_or_else(RuntimeError::session_not_found)?;
        let state = handle
            .inner
            .lock()
            .map_err(|e| RuntimeError::internal(format!("Session lock poisoned: {}", e)))?;
        state.opened_identity.clone()
    };

    let path = registry
        .get(session_id)
        .ok_or_else(RuntimeError::session_not_found)?
        .source
        .path
        .clone();

    if let Some(ref path) = path {
        let path_str = path.to_string_lossy().to_string();
        let other_sessions = registry.list_by_path(&path_str);
        for &other_id in &other_sessions {
            if other_id == session_id {
                continue;
            }
            if let Some(other_handle) = registry.get(other_id) {
                let other_identity = other_handle
                    .inner
                    .lock()
                    .map_err(|e| RuntimeError::internal(format!("Session lock poisoned: {}", e)))?
                    .opened_identity
                    .clone();
                if other_identity != our_identity {
                    return Err(RuntimeError::conflict(
                        "Concurrent sessions detected: the same file was opened from different identity states",
                    ));
                }
            }
        }
    }

    // 3. Lock session, capture state, get SavePayload
    let (target_revision, payload_bytes, expected_identity, path) = {
        let handle = registry
            .get(session_id)
            .ok_or_else(RuntimeError::session_not_found)?;
        let mut state = handle
            .inner
            .lock()
            .map_err(|e| RuntimeError::internal(format!("Session lock poisoned: {}", e)))?;

        // Prevent concurrent save
        if state.save_in_progress.is_some() {
            return Err(RuntimeError::new(
                RuntimeErrorCode::SaveFlushTimeout,
                "A save is already in progress",
            ));
        }
        state.save_in_progress = Some(token);

        // Check for conflict with external modifications
        if let Some(ref path) = handle.source.path {
            if let Ok(current_identity) = host.stat_identity(path) {
                let expected = state.persisted_identity.as_ref().unwrap_or(&state.opened_identity);
                if !expected.matches(&current_identity) {
                    state.save_in_progress = None;
                    return Err(RuntimeError::conflict(
                        "File has been modified externally since last save",
                    ));
                }
            }
        }

        // Capture target revision = current revision (after all patches applied)
        let target_revision = state.core.revision();

        // Get SavePayload from Core
        let save_payload = state.core.save_payload();
        let payload_bytes = save_payload.into_bytes();

        let expected_identity = state
            .persisted_identity
            .clone()
            .unwrap_or_else(|| state.opened_identity.clone());

        let path = handle.source.path.clone();

        (target_revision, payload_bytes, expected_identity, path)
    };

    // 3. Host: compare expected identity and atomic write
    // (outside session lock — no IO inside lock)
    let path = path.ok_or_else(|| RuntimeError::internal("Cannot save: document has no path"))?;

    let new_identity = host.compare_and_atomic_write(&path, &payload_bytes, &expected_identity)?;

    // 4. Update persisted state
    {
        let handle = registry
            .get(session_id)
            .ok_or_else(RuntimeError::session_not_found)?;
        let mut state = handle
            .inner
            .lock()
            .map_err(|e| RuntimeError::internal(format!("Session lock poisoned: {}", e)))?;

        // Clear save-in-progress token
        state.save_in_progress = None;

        // Only mark persisted if the target revision hasn't been overtaken
        // (if new patches arrived during save, we only persist up to target)
        if state.core.revision() >= target_revision {
            state.persisted_revision = target_revision;
            state.persisted_identity = Some(new_identity.clone());
        }
    }

    tracing::info!(
        target: "runtime.save",
        session_id = session_id.0,
        revision = target_revision.0,
        "Document saved"
    );

    Ok(SaveResult {
        revision: target_revision,
        file_identity: new_identity,
    })
}

/// Result of a successful save operation.
#[derive(Debug, Clone)]
pub struct SaveResult {
    pub revision: markflow_core::Revision,
    pub file_identity: FileIdentity,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::{RuntimeError, RuntimeErrorCode};
    use crate::file_identity::{ContentFingerprint, FileIdentity};
    use crate::host::Host;
    use crate::registry::SessionRegistry;
    use crate::session::{ClientId, DocumentRuntimeState, SessionId};
    use crate::source::DocumentSource;
    use markflow_core::{DocumentId, DocumentSession};
    use std::path::Path;
    use std::path::PathBuf;

    /// Mock Host that returns pre-configured results for each operation.
    struct MockHost {
        read_result: std::sync::Mutex<Result<(Vec<u8>, FileIdentity), RuntimeError>>,
        stat_result: std::sync::Mutex<Result<FileIdentity, RuntimeError>>,
        write_result: std::sync::Mutex<Result<FileIdentity, RuntimeError>>,
    }

    impl MockHost {
        fn new(
            read: Result<(Vec<u8>, FileIdentity), RuntimeError>,
            stat: Result<FileIdentity, RuntimeError>,
            write: Result<FileIdentity, RuntimeError>,
        ) -> Self {
            Self {
                read_result: std::sync::Mutex::new(read),
                stat_result: std::sync::Mutex::new(stat),
                write_result: std::sync::Mutex::new(write),
            }
        }
    }

    impl Host for MockHost {
        fn read_document_bytes(
            &self,
            _path: &Path,
        ) -> Result<(Vec<u8>, FileIdentity), RuntimeError> {
            let guard = self
                .read_result
                .lock()
                .map_err(|e| RuntimeError::internal(format!("MockHost lock poisoned: {}", e)))?;
            (*guard).clone()
        }

        fn stat_identity(&self, _path: &Path) -> Result<FileIdentity, RuntimeError> {
            let guard = self
                .stat_result
                .lock()
                .map_err(|e| RuntimeError::internal(format!("MockHost lock poisoned: {}", e)))?;
            (*guard).clone()
        }

        fn compare_and_atomic_write(
            &self,
            _path: &Path,
            _content: &[u8],
            _expected: &FileIdentity,
        ) -> Result<FileIdentity, RuntimeError> {
            let guard = self
                .write_result
                .lock()
                .map_err(|e| RuntimeError::internal(format!("MockHost lock poisoned: {}", e)))?;
            (*guard).clone()
        }
    }

    /// Helper: open a DocumentSession from bytes.
    fn open_session(sid: SessionId, did: DocumentId, bytes: &[u8]) -> DocumentSession {
        DocumentSession::open_bytes(sid, did, bytes).expect("Failed to open session")
    }

    /// Create a session registered in the given registry.
    fn create_test_session(registry: &SessionRegistry, path: &str) -> SessionId {
        let source = DocumentSource::new_file(PathBuf::from(path));
        let identity = make_identity(12, "", 0);
        registry
            .create(
                ClientId("test-client".into()),
                "test-window".into(),
                source,
                identity,
                |sid, did| Ok(open_session(sid, did, b"test content")),
            )
            .expect("Create test session")
    }

    fn make_identity(size: u64, hash: &str, mtime: u64) -> FileIdentity {
        FileIdentity {
            canonical_path: None,
            platform_id: None,
            mtime_ms: Some(mtime),
            size,
            fingerprint: ContentFingerprint {
                sample_size: size,
                hash_prefix: hash.to_string(),
            },
        }
    }

    #[test]
    fn save_document_success() {
        let registry = SessionRegistry::new();
        let session_id = create_test_session(&registry, "/tmp/save_test.md");

        // The opened_identity is created with empty fingerprint by the registry.
        // The mock stat must return an identity that matches it.
        let opened_identity = make_identity(12, "abcdef", 1000);
        let new_identity = make_identity(12, "abcdef", 1001);

        let host = MockHost::new(
            Ok((b"test content".to_vec(), opened_identity.clone())),
            Ok(opened_identity.clone()),
            Ok(new_identity.clone()),
        );

        // Set persisted_identity to match what stat will return
        {
            let handle = registry.get(session_id).unwrap();
            let mut state = handle.inner.lock().unwrap();
            state.persisted_identity = Some(opened_identity.clone());
        }

        let result = save_document(&registry, session_id, &host).expect("Save should succeed");

        assert_eq!(result.revision.0, 0, "Initial revision should be 0");
        assert_eq!(
            result.file_identity.mtime_ms,
            new_identity.mtime_ms,
            "Should return identity from write"
        );
        assert_eq!(
            result.file_identity.size, 12,
            "Should return correct size"
        );

        // Verify persisted state was updated
        let handle = registry.get(session_id).unwrap();
        let state = handle.inner.lock().unwrap();
        assert_eq!(state.persisted_revision.0, 0, "Persisted revision should be 0");
        assert!(state.persisted_identity.is_some(), "Persisted identity should be set");
        assert!(
            state.save_in_progress.is_none(),
            "Save token should be cleared"
        );
    }

    #[test]
    fn save_document_concurrent_save_returns_error() {
        let registry = SessionRegistry::new();
        let session_id = create_test_session(&registry, "/tmp/concurrent_test.md");

        // Set save_in_progress to simulate a concurrent save
        {
            let handle = registry.get(session_id).unwrap();
            let mut state = handle.inner.lock().unwrap();
            state.save_in_progress = Some(crate::session::SaveToken::new(42));
        }

        let identity = make_identity(12, "abcdef", 1000);
        let host = MockHost::new(
            Ok((b"test content".to_vec(), identity.clone())),
            Ok(identity.clone()),
            Ok(identity),
        );

        let result = save_document(&registry, session_id, &host);
        assert!(result.is_err(), "Concurrent save should return error");
        let err = result.unwrap_err();
        assert_eq!(
            err.code,
            RuntimeErrorCode::SaveFlushTimeout,
            "Should be SaveFlushTimeout error"
        );
        assert!(
            err.detail.contains("already in progress"),
            "Error detail should mention concurrent save"
        );
    }

    #[test]
    fn save_document_external_modification_conflict() {
        let registry = SessionRegistry::new();
        let session_id = create_test_session(&registry, "/tmp/conflict_test.md");

        // Host stat returns a different identity (different mtime)
        let opened_identity = make_identity(12, "abcdef", 1000);
        let external_identity = make_identity(12, "abcdef", 2000); // different mtime

        let host = MockHost::new(
            Ok((b"test content".to_vec(), opened_identity.clone())),
            Ok(external_identity), // stat returns different identity
            Ok(opened_identity.clone()),
        );

        let result = save_document(&registry, session_id, &host);
        assert!(result.is_err(), "External modification should cause conflict");
        let err = result.unwrap_err();
        assert_eq!(
            err.code,
            RuntimeErrorCode::Conflict,
            "Should be Conflict error"
        );
        assert!(
            err.detail.contains("modified externally"),
            "Error detail should mention external modification"
        );
    }

    #[test]
    fn save_document_session_not_found() {
        let registry = SessionRegistry::new();
        let identity = make_identity(12, "abcdef", 1000);
        let host = MockHost::new(
            Ok((b"test content".to_vec(), identity.clone())),
            Ok(identity.clone()),
            Ok(identity),
        );

        let invalid_id = SessionId(999);
        let result = save_document(&registry, invalid_id, &host);
        assert!(result.is_err(), "Invalid session should return error");
        let err = result.unwrap_err();
        assert_eq!(
            err.code,
            RuntimeErrorCode::SessionNotFound,
            "Should be SessionNotFound error"
        );
    }

    #[test]
    fn save_document_no_path_returns_internal_error() {
        let registry = SessionRegistry::new();

        // Create a session with no path (Untitled source)
        let session_id = {
            let source = crate::source::DocumentSource {
                path: None,
                display_name: "Untitled".into(),
                source_kind: crate::source::DocumentSourceKind::DiskFile,
            };
            let identity = make_identity(12, "", 0);
            registry
                .create(
                    ClientId("test-client".into()),
                    "test-window".into(),
                    source,
                    identity,
                    |sid, did| Ok(open_session(sid, did, b"test content")),
                )
                .expect("Create test session")
        };

        let identity = make_identity(12, "abcdef", 1000);
        let host = MockHost::new(
            Ok((b"test content".to_vec(), identity.clone())),
            Ok(identity.clone()),
            Ok(identity),
        );

        let result = save_document(&registry, session_id, &host);
        assert!(result.is_err(), "Save without path should return error");
        let err = result.unwrap_err();
        assert_eq!(
            err.code,
            RuntimeErrorCode::Internal,
            "Should be Internal error"
        );
    }
}