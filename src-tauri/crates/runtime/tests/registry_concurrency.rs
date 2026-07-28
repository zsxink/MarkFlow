use markflow_core::{DocumentId, DocumentSession, SessionId};
use markflow_runtime::error::RuntimeError;
use markflow_runtime::file_identity::FileIdentity;
use markflow_runtime::registry::SessionRegistry;
use markflow_runtime::session::ClientId;
use markflow_runtime::source::DocumentSource;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;

/// Helper: create a DocumentSession from bytes for use as opener closure.
fn open_session(session_id: SessionId, document_id: DocumentId, bytes: &[u8]) -> DocumentSession {
    DocumentSession::open_bytes(session_id, document_id, bytes).expect("Failed to open session")
}

#[test]
fn create_session_returns_unique_ids() {
    let registry = SessionRegistry::new();
    let source = DocumentSource::new_file(PathBuf::from("/tmp/test.md"));

    let id_a = registry
        .create(
            ClientId("client-1".into()),
            "window-1".into(),
            source.clone(),
            FileIdentity::empty(),
            |sid, did| Ok(open_session(sid, did, b"hello")),
        )
        .expect("Create session A");

    let id_b = registry
        .create(
            ClientId("client-1".into()),
            "window-1".into(),
            source,
            FileIdentity::empty(),
            |sid, did| Ok(open_session(sid, did, b"world")),
        )
        .expect("Create session B");

    assert_ne!(id_a, id_b, "Session IDs must be unique");
}

#[test]
fn get_and_close_session() {
    let registry = SessionRegistry::new();
    let source = DocumentSource::new_file(PathBuf::from("/tmp/test.md"));

    let id = registry
        .create(
            ClientId("client-1".into()),
            "window-1".into(),
            source,
            FileIdentity::empty(),
            |sid, did| Ok(open_session(sid, did, b"test content")),
        )
        .expect("Create session");

    assert!(registry.exists(id));
    assert!(registry.get(id).is_some());

    registry.close(id).expect("Close session");
    assert!(!registry.exists(id));
    assert!(registry.get(id).is_none());
}

#[test]
fn close_missing_session_returns_error() {
    let registry = SessionRegistry::new();
    let result = registry.close(SessionId(999));
    assert!(result.is_err());
}

#[test]
fn list_by_path_returns_all_sessions_for_path() {
    let registry = SessionRegistry::new();
    let path = PathBuf::from("/tmp/shared.md");
    let source = DocumentSource::new_file(path.clone());

    let id_a = registry
        .create(
            ClientId("window-1".into()),
            "window-1".into(),
            source.clone(),
            FileIdentity::empty(),
            |sid, did| Ok(open_session(sid, did, b"content")),
        )
        .expect("Create session A");

    let source_b = DocumentSource::new_file(path.clone());
    let id_b = registry
        .create(
            ClientId("window-2".into()),
            "window-2".into(),
            source_b,
            FileIdentity::empty(),
            |sid, did| Ok(open_session(sid, did, b"content")),
        )
        .expect("Create session B");

    let path_str = path.to_string_lossy().to_string();
    let sessions = registry.list_by_path(&path_str);
    assert_eq!(sessions.len(), 2);
    assert!(sessions.contains(&id_a));
    assert!(sessions.contains(&id_b));
}

#[test]
fn concurrent_create_and_close_dont_block_each_other() {
    let registry = Arc::new(SessionRegistry::new());
    let mut handles = vec![];

    for i in 0..10 {
        let reg = registry.clone();
        handles.push(thread::spawn(move || {
            let source = DocumentSource::new_file(PathBuf::from(format!("/tmp/file-{}.md", i)));
            let id = reg
                .create(
                    ClientId(format!("client-{}", i)),
                    format!("window-{}", i),
                    source,
                    FileIdentity::empty(),
                    |sid, did| Ok(open_session(sid, did, b"test")),
                )
                .expect("Create session");
            assert!(reg.exists(id));
            reg.close(id).expect("Close session");
            assert!(!reg.exists(id));
        }));
    }

    for h in handles {
        h.join().expect("Thread panicked");
    }

    assert_eq!(registry.len(), 0, "All sessions should be cleaned up");
}

#[test]
fn sessions_with_different_paths_are_independent() {
    let registry = SessionRegistry::new();

    let id_a = registry
        .create(
            ClientId("client-1".into()),
            "window-1".into(),
            DocumentSource::new_file(PathBuf::from("/tmp/a.md")),
            FileIdentity::empty(),
            |sid, did| Ok(open_session(sid, did, b"file a")),
        )
        .expect("Create session A");

    let id_b = registry
        .create(
            ClientId("client-1".into()),
            "window-1".into(),
            DocumentSource::new_file(PathBuf::from("/tmp/b.md")),
            FileIdentity::empty(),
            |sid, did| Ok(open_session(sid, did, b"file b")),
        )
        .expect("Create session B");

    assert_eq!(registry.list_by_path("/tmp/a.md"), vec![id_a]);
    assert_eq!(registry.list_by_path("/tmp/b.md"), vec![id_b]);

    registry.close(id_a).expect("Close A");
    assert!(registry.get(id_b).is_some());
    assert!(!registry.get(id_a).is_some());
}

#[test]
fn concurrent_reads_of_different_sessions_do_not_block() {
    let registry = Arc::new(SessionRegistry::new());

    // Create two sessions
    let id_a = registry
        .create(
            ClientId("c1".into()),
            "w1".into(),
            DocumentSource::new_file(PathBuf::from("/tmp/a.md")),
            FileIdentity::empty(),
            |sid, did| Ok(open_session(sid, did, b"aaaa")),
        )
        .expect("Create A");
    let id_b = registry
        .create(
            ClientId("c2".into()),
            "w2".into(),
            DocumentSource::new_file(PathBuf::from("/tmp/b.md")),
            FileIdentity::empty(),
            |sid, did| Ok(open_session(sid, did, b"bbbb")),
        )
        .expect("Create B");

    let mut handles = vec![];

    // Spawn threads that read both sessions concurrently
    for _ in 0..20 {
        let reg = registry.clone();
        handles.push(thread::spawn(move || {
            let a = reg.get(id_a).expect("Session A should exist");
            let b = reg.get(id_b).expect("Session B should exist");
            let state_a = a.inner.lock().unwrap();
            let state_b = b.inner.lock().unwrap();
            assert!(!state_a.is_dirty());
            assert!(!state_b.is_dirty());
            drop(state_a);
            drop(state_b);
        }));
    }

    for h in handles {
        h.join().expect("Thread panicked");
    }
}
