// Test utilities shared across integration tests.
// Each test binary only uses a subset; annotate individually to avoid dead_code.

use markflow_core::{DocumentId, DocumentSession, SessionId};
use markflow_runtime::error::RuntimeError;
use markflow_runtime::file_identity::{ContentFingerprint, FileIdentity};
use markflow_runtime::host::Host;
use std::path::Path;

/// Helper: create a DocumentSession from bytes.
#[allow(dead_code)]
pub fn open_bytes(sid: SessionId, did: DocumentId, bytes: &[u8]) -> DocumentSession {
    DocumentSession::open_bytes(sid, did, bytes).expect("Failed to open session")
}

/// Helper: construct a FileIdentity for tests.
#[allow(dead_code)]
pub fn make_identity(size: u64, hash: &str, mtime: u64) -> FileIdentity {
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

/// MockHost with configurable per-operation results.
///
/// Each operation returns a pre-configured result. `read_document_bytes` can
/// optionally provide custom content; if not set, it returns `b"test content"`.
#[allow(dead_code)]
pub struct MockHost {
    read_result: std::sync::Mutex<Result<(Vec<u8>, FileIdentity), RuntimeError>>,
    stat_result: std::sync::Mutex<Result<FileIdentity, RuntimeError>>,
    write_result: std::sync::Mutex<Result<FileIdentity, RuntimeError>>,
}

#[allow(dead_code)]
impl MockHost {
    pub fn new(
        stat: Result<FileIdentity, RuntimeError>,
        write: Result<FileIdentity, RuntimeError>,
    ) -> Self {
        Self {
            read_result: std::sync::Mutex::new(Ok((
                b"test content".to_vec(),
                FileIdentity::empty(),
            ))),
            stat_result: std::sync::Mutex::new(stat),
            write_result: std::sync::Mutex::new(write),
        }
    }

    pub fn with_read(
        stat: Result<FileIdentity, RuntimeError>,
        write: Result<FileIdentity, RuntimeError>,
        read: Result<(Vec<u8>, FileIdentity), RuntimeError>,
    ) -> Self {
        Self {
            read_result: std::sync::Mutex::new(read),
            stat_result: std::sync::Mutex::new(stat),
            write_result: std::sync::Mutex::new(write),
        }
    }
}

impl Host for MockHost {
    fn read_document_bytes(&self, _path: &Path) -> Result<(Vec<u8>, FileIdentity), RuntimeError> {
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
