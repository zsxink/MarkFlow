use crate::file_identity::FileIdentity;
use crate::error::RuntimeError;

/// Host trait abstracts filesystem operations for the Runtime.
///
/// The Host is implemented by the Tauri adapter layer. It provides:
/// - Reading document bytes with identity tracking
/// - Stat'ing a file's current identity
/// - Atomic write with expected-identity comparison
pub trait Host {
    /// Read document bytes from disk and return them with the file identity at read time.
    fn read_document_bytes(&self, path: &std::path::Path) -> Result<(Vec<u8>, FileIdentity), RuntimeError>;

    /// Stat a file's current identity (without reading content).
    fn stat_identity(&self, path: &std::path::Path) -> Result<FileIdentity, RuntimeError>;

    /// Atomically write content to path, but only if the current identity matches expected.
    ///
    /// Returns the new identity after successful write.
    fn compare_and_atomic_write(
        &self,
        path: &std::path::Path,
        content: &[u8],
        expected: &FileIdentity,
    ) -> Result<FileIdentity, RuntimeError>;
}