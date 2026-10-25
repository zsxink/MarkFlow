//! Directory listing and file-tree CRUD: create/rename/delete/copy.

use crate::commands::files::entry::is_supported_browser_entry;
use crate::commands::files::paths::{
    resolve_path, validate_parent_in_workspace, validate_path_in_workspace,
};
use crate::commands::files::FileEntry;
use crate::commands::settings::load_settings_inner;
use crate::paths::normalize_path;
use crate::state::AppState;
use std::fs;
use std::path::Path;
use tauri::State;
use tracing::info;

#[tauri::command]
pub fn create_file(
    path: String,
    content: Option<String>,
    state: State<AppState>,
) -> Result<(), String> {
    let path = Path::new(&path);
    if state.get_workspace().is_some() {
        validate_path_in_workspace(path, &state)?;
    }
    if path.exists() {
        return Err("File already exists".into());
    }
    let content = content.unwrap_or_default();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    fs::write(path, content).map_err(|e| format!("Failed to create file: {}", e))?;
    info!(target: "backend.files", path = %normalize_path(path), "Created file");
    Ok(())
}

#[tauri::command]
pub fn create_dir(path: String, state: State<AppState>) -> Result<(), String> {
    let path = Path::new(&path);
    validate_parent_in_workspace(path, &state)?;
    if path.exists() {
        return Err("Directory already exists".into());
    }
    fs::create_dir_all(path).map_err(|e| format!("Failed to create dir: {}", e))
}

#[tauri::command]
pub fn rename_path(from: String, to: String, state: State<AppState>) -> Result<(), String> {
    let from = resolve_path(&from, &state)?;
    if state.get_workspace().is_some() {
        validate_path_in_workspace(&from, &state)?;
    }
    let to = Path::new(&to);
    validate_parent_in_workspace(to, &state)?;
    if !from.exists() {
        return Err("Source path does not exist".into());
    }
    fs::rename(&from, to).map_err(|e| format!("Failed to rename: {}", e))?;
    info!(target: "backend.files", from = %normalize_path(&from), to = %normalize_path(to), "Renamed path");
    Ok(())
}

#[tauri::command]
pub fn delete_path(path: String, state: State<AppState>) -> Result<(), String> {
    let path = resolve_path(&path, &state)?;
    if state.get_workspace().is_some() {
        validate_path_in_workspace(&path, &state)?;
    }
    if !path.exists() {
        return Err("Path does not exist".into());
    }
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| format!("Failed to remove dir: {}", e))?;
    } else {
        fs::remove_file(&path).map_err(|e| format!("Failed to remove file: {}", e))?;
    }
    info!(target: "backend.files", path = %normalize_path(&path), "Deleted path");
    Ok(())
}

fn copy_dir_recursive(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|e| format!("Failed to create dir: {}", e))?;
    for entry in fs::read_dir(from).map_err(|e| format!("Failed to read dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let from_path = entry.path();
        let metadata = fs::symlink_metadata(&from_path)
            .map_err(|e| format!("Failed to inspect entry: {}", e))?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        let to_path = to.join(entry.file_name());
        if metadata.is_dir() {
            copy_dir_recursive(&from_path, &to_path)?;
        } else {
            fs::copy(&from_path, &to_path).map_err(|e| format!("Failed to copy: {}", e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn copy_file(from: String, to: String, state: State<AppState>) -> Result<(), String> {
    let from = resolve_path(&from, &state)?;
    if state.get_workspace().is_some() {
        validate_path_in_workspace(&from, &state)?;
    }
    if !from.exists() {
        return Err("Source path does not exist".into());
    }
    let to = Path::new(&to);
    validate_parent_in_workspace(to, &state)?;
    if from.is_dir() {
        copy_dir_recursive(&from, to)?;
    } else {
        fs::copy(&from, to).map_err(|e| format!("Failed to copy: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn read_single_dir(path: String, state: State<AppState>) -> Result<Vec<FileEntry>, String> {
    let dir = resolve_path(&path, &state)?;
    if !dir.is_dir() {
        return Err("Not a directory".into());
    }
    let show_unsupported = load_settings_inner().file_browser_show_unsupported_files;
    let mut entries = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("Failed to read dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let metadata =
            fs::symlink_metadata(&path).map_err(|e| format!("Failed to inspect entry: {}", e))?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        // Same listing rule as the paged `read_dir`, so directory views built
        // from this full listing never disagree with their paged siblings.
        if !show_unsupported && !metadata.is_dir() && !is_supported_browser_entry(&name) {
            continue;
        }
        entries.push(FileEntry {
            name,
            path: normalize_path(&path),
            is_dir: metadata.is_dir(),
            children: None,
        });
    }
    entries.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.cmp(&b.name)
        } else {
            b.is_dir.cmp(&a.is_dir)
        }
    });
    Ok(entries)
}
