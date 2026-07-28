use crate::session::DocumentSourceKey;
use std::path::PathBuf;

/// Source kind for a document session.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DocumentSourceKind {
    /// A file on disk.
    DiskFile,
    /// Untitled / new unsaved document (reserved for M3+).
    #[allow(dead_code)]
    Untitled,
}

/// Describes where a document comes from.
#[derive(Debug, Clone)]
pub struct DocumentSource {
    /// Full canonical path, if this is a disk file.
    pub path: Option<PathBuf>,
    /// Human-readable display name (e.g. filename or "Untitled").
    pub display_name: String,
    /// Whether this is a disk file, untitled, etc.
    pub source_kind: DocumentSourceKind,
}

impl DocumentSource {
    pub fn new_file(path: PathBuf) -> Self {
        let display_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string());
        Self {
            path: Some(path),
            display_name,
            source_kind: DocumentSourceKind::DiskFile,
        }
    }

    /// Return a key suitable for path-based indexing.
    pub fn source_key(&self) -> Option<DocumentSourceKey> {
        self.path.as_ref().map(|p| DocumentSourceKey(p.to_string_lossy().to_string()))
    }
}