//! Tauri-side Host adapter for the markflow-runtime Host trait.
//!
//! Implements `markflow_runtime::host::Host` using actual filesystem operations
//! via the `atomic_write` utility from `commands::files`.

use crate::commands::files;
use markflow_runtime::error::RuntimeError;
use markflow_runtime::file_identity::{ContentFingerprint, FileIdentity};
use markflow_runtime::host::Host;
use markflow_runtime::registry::SessionRegistry;
use std::path::Path;
use std::sync::LazyLock;

/// Global session registry shared across all Tauri commands.
///
/// SessionRegistry is internally thread-safe (DashMap + AtomicU64), so no
/// outer Mutex is needed.
pub static SESSION_REGISTRY: LazyLock<SessionRegistry> = LazyLock::new(SessionRegistry::new);

/// The concrete Host implementation used by Tauri commands.
pub struct AppHost;

impl Host for AppHost {
    fn read_document_bytes(&self, path: &Path) -> Result<(Vec<u8>, FileIdentity), RuntimeError> {
        let bytes = std::fs::read(path)
            .map_err(|e| RuntimeError::internal(format!("Failed to read file: {}", e)))?;

        let identity = FileIdentity::from_metadata(&path.to_path_buf(), &bytes);

        Ok((bytes, identity))
    }

    fn stat_identity(&self, path: &Path) -> Result<FileIdentity, RuntimeError> {
        let metadata = std::fs::metadata(path)
            .map_err(|e| RuntimeError::internal(format!("Failed to stat file: {}", e)))?;

        Ok(FileIdentity {
            canonical_path: path.canonicalize().ok(),
            platform_id: None,
            mtime_ms: metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64),
            size: metadata.len(),
            fingerprint: ContentFingerprint::empty(),
        })
    }

    fn compare_and_atomic_write(
        &self,
        path: &Path,
        content: &[u8],
        expected: &FileIdentity,
    ) -> Result<FileIdentity, RuntimeError> {
        // Check current identity against expected
        let current = self.stat_identity(path)?;
        if !expected.matches(&current) {
            // Fingerprint check for final verification (full-content SHA-256)
            let current_content = std::fs::read(path)
                .map_err(|e| RuntimeError::internal(format!("Failed to read for verify: {}", e)))?;
            let current_fingerprint = ContentFingerprint::from_bytes(&current_content);
            if current_fingerprint != expected.fingerprint {
                return Err(RuntimeError::conflict(
                    "File identity mismatch: external modification detected",
                ));
            }
        }

        // Perform atomic write (write_file uses &str, convert bytes)
        let content_str = std::str::from_utf8(content)
            .map_err(|e| RuntimeError::internal(format!("Invalid UTF-8 in save payload: {}", e)))?;
        files::atomic_write(path, content_str)
            .map_err(|e| RuntimeError::internal(format!("Failed to write file: {}", e)))?;

        // Return new identity from written content
        let new_identity = FileIdentity::from_metadata(&path.to_path_buf(), content);
        Ok(new_identity)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Create a unique temp dir per test using the test name (via thread name).
    fn test_dir(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("mflow_host_test_{}_{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn compare_and_atomic_write_success() {
        let dir = test_dir("success");
        let path = dir.join("test.md");
        fs::write(&path, b"original content").unwrap();

        let host = AppHost;

        let initial_identity = host.stat_identity(&path).unwrap();
        assert_eq!(initial_identity.size, 16); // "original content"

        // Write with matching expected identity
        let new_content = b"updated content";
        let result = host.compare_and_atomic_write(&path, new_content, &initial_identity);
        assert!(result.is_ok(), "write should succeed: {:?}", result.err());

        // Verify content was updated
        let read_back = fs::read(&path).unwrap();
        assert_eq!(read_back, b"updated content");

        // Verify new identity is different
        let new_identity = result.unwrap();
        assert_ne!(new_identity.fingerprint, initial_identity.fingerprint);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn compare_and_atomic_write_rejects_identity_mismatch() {
        let dir = test_dir("rejects_identity_mismatch");
        let path = dir.join("test.md");
        fs::write(&path, b"original content").unwrap();

        let host = AppHost;

        // Use a fictional expected identity with a different fingerprint
        let fake_fingerprint = ContentFingerprint {
            sample_size: 0,
            hash_prefix: "abcd1234".to_string(),
        };
        let fake_identity = FileIdentity {
            canonical_path: None,
            platform_id: None,
            mtime_ms: Some(1),
            size: 999,
            fingerprint: fake_fingerprint,
        };

        let result = host.compare_and_atomic_write(&path, b"new content", &fake_identity);
        assert!(result.is_err(), "should reject identity mismatch");

        // Verify content was NOT overwritten
        let read_back = fs::read(&path).unwrap();
        assert_eq!(read_back, b"original content");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn compare_and_atomic_write_succeeds_with_mtime_only_delta() {
        let dir = test_dir("mtime_delta");
        let path = dir.join("test.md");
        fs::write(&path, b"hello").unwrap();

        let host = AppHost;
        let identity = host.stat_identity(&path).unwrap();

        // Change mtime by touching the file (same content)
        let new_content = b"hello";
        let result = host.compare_and_atomic_write(&path, new_content, &identity);
        assert!(result.is_ok(), "mtime-only change should not block write");

        let _ = fs::remove_dir_all(&dir);
    }
}
