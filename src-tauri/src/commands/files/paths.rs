//! Path resolution and workspace-boundary validation.
//!
//! Two different models coexist on purpose:
//! - document save/open allows files outside the workspace (Typora/MarkText model)
//! - file-tree operations are confined to the workspace and reject symlink hops

use crate::state::AppState;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

pub fn resolve_path(raw: &str, _state: &State<AppState>) -> Result<PathBuf, String> {
    // Simple path normalizer — no workspace scope check.
    // Files outside the current workspace are allowed (Typora/MarkText model).
    let path = Path::new(raw);
    path.canonicalize()
        .or_else(|_: std::io::Error| Ok(path.to_path_buf()))
        .map_err(|e: std::io::Error| format!("Invalid path: {}", e))
}

pub(crate) fn normalize_lexical(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            _ => normalized.push(component.as_os_str()),
        }
    }
    normalized
}

/// Validate a path stays inside workspace without relying on string prefixes.
/// Allows non-existent targets (for create/write) while rejecting traversal and symlink hops.
pub fn validate_path_in_workspace(path: &Path, state: &State<AppState>) -> Result<(), String> {
    let workspace = state.get_workspace().ok_or("No workspace set")?;
    let workspace = workspace
        .canonicalize()
        .map_err(|_| "Workspace not found")?;

    let candidate = if path.is_absolute() {
        normalize_lexical(path)
    } else {
        normalize_lexical(&workspace.join(path))
    };

    if !candidate.starts_with(&workspace) {
        return Err("Path outside workspace".into());
    }

    // The workspace root itself has a parent outside the workspace. It is still
    // a valid directory to read when initially rendering the file tree.
    if candidate == workspace {
        return Ok(());
    }

    let parent = candidate.parent().ok_or("Invalid path")?;
    let relative_parent = parent
        .strip_prefix(&workspace)
        .map_err(|_| "Path outside workspace")?;

    let mut current = workspace.clone();
    for component in relative_parent.components() {
        current.push(component.as_os_str());
        if current.exists() {
            let metadata = fs::symlink_metadata(&current)
                .map_err(|e| format!("Failed to inspect path: {}", e))?;
            if metadata.file_type().is_symlink() {
                return Err("Symlink not allowed".into());
            }
        }
    }

    if candidate.exists() {
        let metadata = fs::symlink_metadata(&candidate)
            .map_err(|e| format!("Failed to inspect target: {}", e))?;
        if metadata.file_type().is_symlink() {
            return Err("Symlink not allowed".into());
        }
    }

    Ok(())
}

/// Validate only the parent directory of a not-yet-existing target.
pub(crate) fn validate_parent_in_workspace(
    path: &Path,
    state: &State<AppState>,
) -> Result<(), String> {
    let workspace = state.get_workspace().ok_or("No workspace set")?;
    let workspace = workspace
        .canonicalize()
        .map_err(|_| "Workspace not found")?;
    let parent = path.parent().ok_or("Invalid path")?;
    let parent = parent
        .canonicalize()
        .map_err(|_| "Parent directory does not exist")?;
    if !parent.starts_with(&workspace) {
        return Err("Path outside workspace".into());
    }
    if parent.is_symlink() {
        return Err("Symlink not allowed".into());
    }
    Ok(())
}
