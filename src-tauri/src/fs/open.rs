//! Reveal local paths with the system file manager.
//!
//! The frontend shell plugin validates paths against the `tauri.conf.json`
//! URL whitelist, whose Windows drive branch requires backslashes — so the
//! normalized forward-slash paths the backend hands out are rejected there
//! (issue #377). Routing through this Rust-side command bypasses that
//! whitelist entirely and accepts any separator form.

use std::path::Path;

use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::error::AppError;

/// How a path should be handed to the system file manager.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenTarget {
    /// Open the directory itself in the file manager.
    Dir,
    /// Reveal the file (selected) in its parent directory.
    File,
    /// The path does not exist on disk.
    Missing,
}

/// Classify a path into the file-manager action to take. Free of side
/// effects, so the dir/file/missing decision is unit-testable without an
/// `AppHandle`; the opener call itself stays a thin, untested wrapper whose
/// platform differences the plugin owns.
pub fn classify_open_target(path: &Path) -> OpenTarget {
    if !path.exists() {
        OpenTarget::Missing
    } else if path.is_dir() {
        OpenTarget::Dir
    } else {
        OpenTarget::File
    }
}

/// Build the "path missing" error with the original path in the message so
/// failures stay diagnosable from structured logs.
fn missing_path_error(path: &str) -> AppError {
    AppError::io(format!("Path does not exist: {path}"))
}

/// Open a local path with the system file manager: directories are opened,
/// files are revealed (selected) in their parent folder. Accepts any path
/// separator form; missing paths fail with an Io-class `AppError` before any
/// system call is made.
#[tauri::command]
pub fn open_in_file_manager(path: String, app: AppHandle) -> Result<(), AppError> {
    let target = classify_open_target(Path::new(&path));
    tracing::debug!(target: "backend.fs", path = %path, action = ?target, "Opening path in file manager");
    match target {
        OpenTarget::Missing => Err(missing_path_error(&path)),
        OpenTarget::Dir => app
            .opener()
            .open_path(path, None::<&str>)
            .map_err(|error| AppError::io(error.to_string())),
        OpenTarget::File => app
            .opener()
            .reveal_item_in_dir(&path)
            .map_err(|error| AppError::io(error.to_string())),
    }
}

#[cfg(test)]
mod tests;
