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
use std::sync::Mutex;

/// Global session registry shared across all Tauri commands.
pub static SESSION_REGISTRY: LazyLock<Mutex<SessionRegistry>> =
    LazyLock::new(|| Mutex::new(SessionRegistry::new()));

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
            // Fingerprint check for final verification
            let current_content = std::fs::read(path)
                .map_err(|e| RuntimeError::internal(format!("Failed to read for verify: {}", e)))?;
            let current_fingerprint = ContentFingerprint::compute(&current_content);
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