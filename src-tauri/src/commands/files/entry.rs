//! Single-entry reads and writes: content, metadata, stats, base64.

use crate::commands::files::atomic::{atomic_write, atomic_write_checked, ExpectedFileStats};
use crate::commands::files::paths::{resolve_path, validate_path_in_workspace};
use crate::commands::files::{FileEntry, FileMetadata, FileStats};
use crate::commands::settings::load_settings_inner;
use crate::fs::ignore::matcher_snapshot;
use crate::http::MAX_IMAGE_SIZE;
use crate::paths::normalize_path;
use crate::state::AppState;
use base64::Engine;
use std::fs;
use std::io::Read;
use std::path::Path;
use tauri::State;

/// Safety limit for read_file — frontend handles tier logic before calling,
/// this is a last-resort guard against OOM.
const MAX_READ_FILE_SIZE: u64 = 100 * 1024 * 1024; // 100MB

/// File-browser supported-format predicate: `.md` plus the seven image
/// extensions, compared case-insensitively via the final `.`-suffix.
/// Directories are always listed; callers let them through before checking.
/// Mirrors `IMAGE_EXTENSIONS` in `src/utils/openable-files.ts` — both sides'
/// tests assert the same list, so new formats must be added in both places.
pub(crate) fn is_supported_browser_entry(name: &str) -> bool {
    let Some((_, extension)) = name.rsplit_once('.') else {
        return false;
    };
    matches!(
        extension.to_lowercase().as_str(),
        "md" | "svg" | "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp"
    )
}

#[tauri::command]
pub fn read_path_entry(path: String, state: State<AppState>) -> Result<FileEntry, String> {
    let path = resolve_path(&path, &state)?;
    validate_path_in_workspace(&path, &state)?;
    let metadata =
        fs::symlink_metadata(&path).map_err(|e| format!("Failed to inspect entry: {}", e))?;
    if metadata.file_type().is_symlink() {
        return Err("Symlink not allowed".into());
    }
    let name = path
        .file_name()
        .ok_or("Invalid path")?
        .to_string_lossy()
        .to_string();
    let workspace = state.get_workspace().ok_or("No workspace set")?;
    let settings = load_settings_inner();
    let matcher = matcher_snapshot(&settings.file_tree_ignore_patterns);
    if name.starts_with('.') || matcher.is_ignored(&workspace, &path) {
        return Err("Path is ignored".into());
    }
    // Same listing rule as `read_dir` pages, so watcher-incremental inserts
    // never resurface a file the paged listing would have hidden.
    if !metadata.is_dir()
        && !settings.file_browser_show_unsupported_files
        && !is_supported_browser_entry(&name)
    {
        return Err("Unsupported file type".into());
    }
    Ok(FileEntry {
        name,
        path: normalize_path(&path),
        is_dir: metadata.is_dir(),
        children: None,
    })
}

#[tauri::command]
pub fn file_metadata(path: String, state: State<AppState>) -> Result<FileMetadata, String> {
    let path = resolve_path(&path, &state)?;
    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to read metadata: {}", e))?;
    let size = metadata.len();
    let lines = count_lines(&path)?;
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    Ok(FileMetadata {
        size,
        lines,
        extension,
    })
}

/// Count lines in a file by scanning for newline characters.
/// Uses a fixed buffer to avoid allocating per-line strings.
fn count_lines(path: &Path) -> Result<u32, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut count = 0u32;
    let mut buf = [0u8; 65536];
    let mut trailing = false;
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        if n == 0 {
            break;
        }
        for &b in &buf[..n] {
            if b == b'\n' {
                count += 1;
            }
        }
        trailing = buf[n - 1] != b'\n';
    }
    if trailing {
        count += 1;
    }
    Ok(count)
}

#[tauri::command]
pub fn read_file(path: String, state: State<AppState>) -> Result<String, String> {
    let path = resolve_path(&path, &state)?;
    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    if metadata.len() > MAX_READ_FILE_SIZE {
        return Err("文件过大（超过 100MB），无法直接打开".into());
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn write_file(path: String, content: String, state: State<AppState>) -> Result<(), String> {
    // Document save — user-opened files may live outside the workspace.
    // Workspace boundary is enforced by file-tree commands, not by document save.
    let path = resolve_path(&path, &state)?;
    atomic_write(&path, &content)
}

/// Compare-and-write for a previously opened verified document.  Unlike
/// `write_file`, this command never creates a missing target and never accepts
/// unknown metadata: callers supply the mtime/size observed at open or after a
/// successful save, and the final comparison happens in this command directly
/// before replacement.
#[tauri::command]
pub fn write_file_if_unchanged(
    path: String,
    content: String,
    expected_mtime: u64,
    expected_size: u64,
    state: State<AppState>,
) -> Result<(), String> {
    let path = resolve_path(&path, &state)?;
    atomic_write_checked(
        &path,
        &content,
        Some(ExpectedFileStats {
            mtime: expected_mtime,
            size: expected_size,
        }),
    )
}

#[tauri::command]
pub fn file_exists(path: String, state: State<AppState>) -> Result<bool, String> {
    let path = resolve_path(&path, &state)?;
    Ok(path.exists())
}

#[tauri::command]
pub fn get_file_stats(path: String, state: State<AppState>) -> Result<FileStats, String> {
    let path = resolve_path(&path, &state)?;
    let metadata =
        fs::metadata(&path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
    Ok(crate::commands::files::atomic::stats_from_metadata(
        &metadata,
    ))
}

#[tauri::command]
pub fn read_file_as_base64(path: String, state: State<AppState>) -> Result<String, String> {
    let path = resolve_path(&path, &state)?;
    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to read metadata: {}", e))?;
    if metadata.len() > MAX_IMAGE_SIZE {
        return Err("文件过大，最大支持 20MB".into());
    }
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
pub fn write_file_from_base64(
    path: String,
    data: String,
    state: State<AppState>,
) -> Result<(), String> {
    let path = Path::new(&path);
    validate_path_in_workspace(path, &state)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Invalid base64 data: {}", e))?;
    if bytes.len() as u64 > MAX_IMAGE_SIZE {
        return Err("文件过大，最大支持 20MB".into());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    fs::write(path, bytes).map_err(|e| format!("Failed to write file: {}", e))
}
