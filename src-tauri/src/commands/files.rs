use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileEntry>>,
}

fn validate_path(target: &Path, workspace_root: &Path) -> Result<PathBuf, String> {
    let target = target.canonicalize().map_err(|_| "Path does not exist")?;
    let root = workspace_root
        .canonicalize()
        .map_err(|_| "Workspace not found")?;
    if !target.starts_with(&root) {
        return Err("Path outside workspace".into());
    }
    if target.is_symlink() {
        return Err("Symlink not allowed".into());
    }
    Ok(target)
}

fn resolve_path(raw: &str, state: &State<AppState>) -> Result<PathBuf, String> {
    let path = Path::new(raw);
    match state.get_workspace() {
        Some(root) => validate_path(path, &root),
        None => {
            // No workspace set — allow paths for initial setup (settings, etc.)
            path.canonicalize()
                .or_else(|_: std::io::Error| Ok(path.to_path_buf()))
                .map_err(|e: std::io::Error| format!("Invalid path: {}", e))
        }
    }
}

#[tauri::command]
pub fn read_file(path: String, state: State<AppState>) -> Result<String, String> {
    let path = resolve_path(&path, &state)?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn write_file(path: String, content: String, state: State<AppState>) -> Result<(), String> {
    let path = resolve_path(&path, &state)?;
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub fn read_dir_recursive(path: String, state: State<AppState>) -> Result<Vec<FileEntry>, String> {
    let root = resolve_path(&path, &state)?;
    if !root.is_dir() {
        return Err("Not a directory".into());
    }
    read_dir_inner(&root, &root)
}

fn read_dir_inner(dir: &Path, root: &Path) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    let read = fs::read_dir(dir).map_err(|e| format!("Failed to read dir: {}", e))?;
    for entry in read {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let is_dir = path.is_dir();
        let children = if is_dir {
            Some(read_dir_inner(&path, root)?)
        } else {
            None
        };
        entries.push(FileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            children,
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

fn validate_parent_in_workspace(path: &Path, state: &State<AppState>) -> Result<(), String> {
    let workspace = state.get_workspace().ok_or("No workspace set")?;
    let workspace = workspace.canonicalize().map_err(|_| "Workspace not found")?;

    // For create operations, check parent directory
    let parent = path.parent().ok_or("Invalid path")?;
    let parent = parent.canonicalize().map_err(|_| "Parent directory does not exist")?;

    if !parent.starts_with(&workspace) {
        return Err("Path outside workspace".into());
    }
    if parent.is_symlink() {
        return Err("Symlink not allowed".into());
    }
    Ok(())
}

#[tauri::command]
pub fn create_file(path: String, content: Option<String>, state: State<AppState>) -> Result<(), String> {
    let path = Path::new(&path);
    validate_parent_in_workspace(path, &state)?;
    if path.exists() {
        return Err("File already exists".into());
    }
    let content = content.unwrap_or_default();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    fs::write(path, content).map_err(|e| format!("Failed to create file: {}", e))
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
    let to = resolve_path(&to, &state)?;
    fs::rename(&from, &to).map_err(|e| format!("Failed to rename: {}", e))
}

#[tauri::command]
pub fn delete_path(path: String, state: State<AppState>) -> Result<(), String> {
    let path = resolve_path(&path, &state)?;
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| format!("Failed to remove dir: {}", e))
    } else {
        fs::remove_file(&path).map_err(|e| format!("Failed to remove file: {}", e))
    }
}

#[tauri::command]
pub fn copy_file(from: String, to: String, state: State<AppState>) -> Result<(), String> {
    let from = resolve_path(&from, &state)?;
    let to = resolve_path(&to, &state)?;
    fs::copy(&from, &to).map_err(|e| format!("Failed to copy: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn file_exists(path: String, state: State<AppState>) -> Result<bool, String> {
    let path = resolve_path(&path, &state)?;
    Ok(path.exists())
}
