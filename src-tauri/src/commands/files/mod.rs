//! File-system commands, split by responsibility:
//!
//! - [`paths`]   — path resolution and workspace-boundary/symlink validation
//! - [`atomic`]  — atomic write + stale temp-file cleanup
//! - [`entry`]   — single-entry reads/writes (content, metadata, base64)
//! - [`crud`]    — directory listing, create/rename/delete/copy
//! - [`dialogs`] — save-dialog export commands
//!
//! The command registry and sibling modules import the submodules explicitly
//! (`files::entry::read_file`, …) so each responsibility stays visible at the
//! call site.

pub mod atomic;
pub mod crud;
pub mod dialogs;
pub mod entry;
pub mod paths;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileEntry>>,
}

#[derive(Debug, Serialize)]
pub struct RemoteImageData {
    pub data: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileMetadata {
    pub size: u64,
    pub lines: u32,
    pub extension: String,
}

#[derive(Debug, Serialize)]
pub struct FileStats {
    pub mtime: u64,
    pub size: u64,
}

#[cfg(test)]
pub(crate) use atomic::{
    atomic_write_checked, extract_pid_from_tmp, stats_from_metadata, ExpectedFileStats,
};
#[cfg(test)]
pub(crate) use paths::normalize_lexical;

#[cfg(test)]
mod tests;
