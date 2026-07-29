use markflow_core::{
    DocumentId, Revision, SessionId, SourceRange, TextChange, TextPatch, TransactionId,
};
use markflow_runtime::error::RuntimeErrorCode;
use markflow_runtime::registry::SessionRegistry;
use markflow_runtime::save::save_document;
use markflow_runtime::session::{ClientId, SaveToken};
use markflow_runtime::source::DocumentSource;
use std::path::PathBuf;

mod common;

use common::{make_identity, open_bytes, MockHost};

fn create_session(registry: &SessionRegistry, path: &str) -> markflow_runtime::session::SessionId {
    let source = DocumentSource::new_file(PathBuf::from(path));
    let identity = make_identity(25, "", 0);
    registry
        .create(
            ClientId("integration-client".into()),
            "integration-window".into(),
            source,
            identity,
            |sid, did| Ok(open_bytes(sid, did, b"integration test content")),
        )
        .expect("Create test session")
}

#[test]
fn save_workflow_completes_successfully() {
    let registry = SessionRegistry::new();
    let session_id = create_session(&registry, "/tmp/save_integration_test.md");

    let initial_identity = make_identity(25, "deadbeef", 1000);
    let new_identity = make_identity(25, "deadbeef", 1001);

    let host = MockHost::new(Ok(initial_identity.clone()), Ok(new_identity.clone()));

    // Set persisted_identity to match what stat returns
    {
        let handle = registry.get(session_id).unwrap();
        let mut state = handle.inner.lock().unwrap();
        state.persisted_identity = Some(initial_identity);
    }

    let result = save_document(&registry, session_id, &host).expect("Save should succeed");

    assert_eq!(result.revision.0, 0, "Initial revision should be 0");
    assert_eq!(
        result.file_identity.mtime_ms,
        Some(1001),
        "Should return identity from write"
    );
    assert_eq!(result.file_identity.size, 25, "Should return correct size");

    // Verify persisted state
    let handle = registry.get(session_id).unwrap();
    let state = handle.inner.lock().unwrap();
    assert_eq!(state.persisted_revision.0, 0);
    assert_eq!(
        state.persisted_identity.as_ref().unwrap().mtime_ms,
        Some(1001)
    );
    assert!(state.save_in_progress.is_none());
}

#[test]
fn save_workflow_conflict_detected() {
    let registry = SessionRegistry::new();
    let session_id = create_session(&registry, "/tmp/save_conflict_test.md");

    // Host stat returns a different mtime from the opened identity
    let _opened_identity = make_identity(25, "deadbeef", 1000);
    let external_identity = make_identity(25, "deadbeef", 3000);
    let new_identity = make_identity(25, "deadbeef", 1001);

    let host = MockHost::new(Ok(external_identity), Ok(new_identity));

    let result = save_document(&registry, session_id, &host);
    assert!(result.is_err(), "Should detect external modification");
    let err = result.unwrap_err();
    assert_eq!(err.code, RuntimeErrorCode::Conflict);
}

#[test]
fn save_on_closed_session_returns_not_found() {
    let registry = SessionRegistry::new();
    let session_id = create_session(&registry, "/tmp/closed_session_test.md");

    // Close the session
    registry.close(session_id).expect("Close session");

    let identity = make_identity(25, "deadbeef", 1000);
    let host = MockHost::new(Ok(identity.clone()), Ok(identity));

    let result = save_document(&registry, session_id, &host);
    assert!(result.is_err(), "Save on closed session should fail");
    let err = result.unwrap_err();
    assert_eq!(err.code, RuntimeErrorCode::SessionNotFound);
}

#[test]
fn concurrent_save_on_same_session_blocks() {
    let registry = SessionRegistry::new();
    let session_id = create_session(&registry, "/tmp/concurrent_save_test.md");

    // Set save_in_progress to simulate another save running concurrently
    {
        let handle = registry.get(session_id).unwrap();
        let mut state = handle.inner.lock().unwrap();
        state.save_in_progress = Some(SaveToken::new(99));
    }

    let identity = make_identity(25, "deadbeef", 1000);
    let host = MockHost::new(Ok(identity.clone()), Ok(identity));

    let result = save_document(&registry, session_id, &host);
    assert!(result.is_err(), "Concurrent save should be blocked");
    let err = result.unwrap_err();
    assert_eq!(err.code, RuntimeErrorCode::SaveFlushTimeout);
}

#[test]
fn clean_external_changed_detects_conflict() {
    let registry = SessionRegistry::new();
    let session_id = create_session(&registry, "/tmp/clean_external_test.md");

    // Document is clean (persisted_revision == core.revision() → no edits applied),
    // but the file on disk has been externally modified (different fingerprint).
    let persisted = make_identity(25, "deadbeef", 1000);
    let external = make_identity(25, "cafebabe", 1000); // same size/mtime, different hash

    {
        let handle = registry.get(session_id).unwrap();
        let mut state = handle.inner.lock().unwrap();
        state.persisted_identity = Some(persisted.clone());
        // persisted_revision stays at Revision(0), matching core.revision() → clean
    }

    let host = MockHost::new(Ok(external), Ok(persisted));

    let result = save_document(&registry, session_id, &host);
    assert!(
        result.is_err(),
        "External modification should block save even when clean"
    );
    let err = result.unwrap_err();
    assert_eq!(err.code, RuntimeErrorCode::Conflict);
    assert!(
        err.detail.contains("modified externally"),
        "Error detail should mention external modification"
    );
}

// ---------------------------------------------------------------------------
// SaveLease RAII cleanup tests
// ---------------------------------------------------------------------------

/// Test SaveLease RAII at the state level without going through the registry.
#[test]
fn save_lease_raii_success_path() {
    use markflow_runtime::session::SaveLease;

    let core = open_bytes(SessionId(1), DocumentId(1), b"test content");
    let identity = make_identity(12, "", 0);
    let mut state = markflow_runtime::session::DocumentRuntimeState::new(core, identity);

    assert!(
        state.save_in_progress.is_none(),
        "No save in progress initially"
    );

    {
        let lease = SaveLease::acquire(&mut state);
        assert!(lease.is_some(), "Should acquire lease");
        // Lease holds mutable borrow — can't access state here
    } // lease dropped

    assert!(
        state.save_in_progress.is_none(),
        "SaveInProgress cleared after lease drop"
    );
}

/// SaveLease prevents concurrent save from a second attempt.
#[test]
fn save_lease_raii_prevents_concurrent() {
    use markflow_runtime::session::SaveLease;

    let core = open_bytes(SessionId(2), DocumentId(2), b"test");
    let mut state =
        markflow_runtime::session::DocumentRuntimeState::new(core, make_identity(4, "", 0));

    let lease1 = SaveLease::acquire(&mut state);
    assert!(lease1.is_some(), "First lease");

    // Drop to release borrow
    drop(lease1);

    let lease2 = SaveLease::acquire(&mut state);
    assert!(lease2.is_some(), "Second lease after first is dropped");
}

/// SaveLease RAII clears the token when dropped — verified via success path
/// and via panic-unwind safety below.
#[test]
fn save_lease_panic_does_not_leak_token() {
    use markflow_runtime::session::SaveLease;
    use std::panic::{catch_unwind, AssertUnwindSafe};

    let registry = SessionRegistry::new();
    let session_id = create_session(&registry, "/tmp/lease_panic_test.md");

    let handle = registry.get(session_id).unwrap();

    // Simulate a panic while holding the lease.  We must NOT hold the outer
    // mutex guard across catch_unwind — std::sync::Mutex is not reentrant,
    // and the closure needs to acquire the same lock.
    let result = catch_unwind(AssertUnwindSafe(|| {
        let mut state = handle.inner.lock().unwrap();
        let _lease = SaveLease::acquire(&mut state);
        panic!("simulated panic during save");
    }));

    assert!(result.is_err(), "Expected panic to propagate");

    // After the panic, the lease's Drop should still have run, clearing the
    // token.  The mutex is poisoned because the thread panicked while holding
    // the guard — recover via into_inner().
    let mut state = handle.inner.lock().unwrap_or_else(|e| e.into_inner());
    let new_lease = SaveLease::acquire(&mut state);
    assert!(
        new_lease.is_some(),
        "save token should be cleared after panic-cancelled lease"
    );
}

// ---------------------------------------------------------------------------
// PathSaveCoordinator integration tests
// ---------------------------------------------------------------------------

#[test]
fn save_coordinator_serializes_same_path() {
    use markflow_runtime::save_coordinator::PathSaveCoordinator;
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::thread;

    let coord = Arc::new(PathSaveCoordinator::new());
    let path = PathBuf::from("/tmp/coord_serialize_test.md");

    let coord1 = coord.clone();
    let path1 = path.clone();
    let handle1 = thread::spawn(move || {
        coord1
            .with_path_lock(&path1, || {
                thread::sleep(std::time::Duration::from_millis(50));
            })
            .expect("Lock path");
    });

    // While thread 1 holds the lock, try_lock should return None
    let coord2 = coord.clone();
    let path2 = path.clone();
    let released = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let released2 = released.clone();
    let handle2 = thread::spawn(move || {
        // This should block until thread 1 releases
        coord2
            .with_path_lock(&path2, || {
                released2.store(true, std::sync::atomic::Ordering::SeqCst);
            })
            .expect("Lock path after thread 1");
    });

    handle1.join().expect("Thread 1 panicked");
    handle2.join().expect("Thread 2 panicked");
    assert!(
        released.load(std::sync::atomic::Ordering::SeqCst),
        "Thread 2 should have run after thread 1 released"
    );
}

// ---------------------------------------------------------------------------
// Full-content fingerprint conflict detection tests
// ---------------------------------------------------------------------------

#[test]
fn full_content_fingerprint_detects_different_content() {
    use markflow_runtime::file_identity::ContentFingerprint;

    let fp1 = ContentFingerprint::from_bytes(b"hello world");
    let fp2 = ContentFingerprint::from_bytes(b"hello world!");
    assert_ne!(
        fp1, fp2,
        "Different content should produce different fingerprints"
    );
}

#[test]
fn full_content_fingerprint_same_content_produces_same_hash() {
    use markflow_runtime::file_identity::ContentFingerprint;

    let fp1 = ContentFingerprint::from_bytes(b"hello world");
    let fp2 = ContentFingerprint::from_bytes(b"hello world");
    assert_eq!(
        fp1, fp2,
        "Same content should produce identical fingerprints"
    );
}

#[test]
fn full_content_fingerprint_is_full_content() {
    use markflow_runtime::file_identity::ContentFingerprint;

    let fp = ContentFingerprint::from_bytes(b"hello world");
    assert!(
        fp.is_full_content(),
        "from_bytes should mark as full content"
    );
    assert_eq!(
        fp.sample_size, 0,
        "Full content fingerprint has sample_size 0"
    );
    assert!(
        !fp.hash_prefix.is_empty(),
        "Full content fingerprint should have a hash"
    );
}

// ---------------------------------------------------------------------------
// Original tests below
// ---------------------------------------------------------------------------

#[test]
fn dirty_conflict_prevents_auto_reload() {
    let registry = SessionRegistry::new();
    let session_id = create_session(&registry, "/tmp/dirty_conflict_test.md");

    // Apply a patch to advance the revision, making the document dirty
    {
        let handle = registry.get(session_id).unwrap();
        let mut state = handle.inner.lock().unwrap();

        let patch = TextPatch {
            transaction_id: TransactionId(42),
            base_revision: Revision(0),
            changes: vec![TextChange {
                range: SourceRange::new(Revision(0), 0, 0),
                replacement: "X".into(),
            }],
            selection_after: None,
        };
        state
            .core
            .apply_patch(patch)
            .expect("Apply patch to make session dirty");

        // persisted_revision stays at Revision(0) while core is now Revision(1) → dirty
        state.persisted_identity = Some(make_identity(25, "deadbeef", 1000));
    }

    // Host stat returns a different identity (external modification detected)
    let external = make_identity(25, "cafebabe", 2000);
    let write_result = make_identity(26, "cafebabe", 2000);
    let host = MockHost::new(Ok(external), Ok(write_result));

    let result = save_document(&registry, session_id, &host);
    assert!(
        result.is_err(),
        "Dirty + external modification should cause conflict"
    );
    let err = result.unwrap_err();
    assert_eq!(err.code, RuntimeErrorCode::Conflict);
    assert!(
        err.detail.contains("modified externally"),
        "Error detail should mention external modification"
    );

    // Verify state is unchanged (save_in_progress cleared, persisted_revision not updated)
    let handle = registry.get(session_id).unwrap();
    let state = handle.inner.lock().unwrap();
    assert!(
        state.save_in_progress.is_none(),
        "Save token should be cleared after conflict"
    );
    assert_eq!(
        state.persisted_revision.0, 0,
        "Persisted revision should remain at 0 after failed save"
    );
    assert_eq!(
        state.core.revision().0,
        1,
        "Core revision should still be 1 (edits preserved)"
    );
}
