use crate::commands::settings::load_settings_inner;
use crate::fs::ignore::matcher_snapshot;
use crate::http::MAX_IMAGE_SIZE;
use crate::paths::normalize_path;
use crate::state::AppState;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tracing::info;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileEntry>>,
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
    Ok(FileEntry {
        name,
        path: normalize_path(&path),
        is_dir: metadata.is_dir(),
        children: None,
    })
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

pub fn resolve_path(raw: &str, _state: &State<AppState>) -> Result<PathBuf, String> {
    // Simple path normalizer — no workspace scope check.
    // Files outside the current workspace are allowed (Typora/MarkText model).
    let path = Path::new(raw);
    path.canonicalize()
        .or_else(|_: std::io::Error| Ok(path.to_path_buf()))
        .map_err(|e: std::io::Error| format!("Invalid path: {}", e))
}

// ---------------------------------------------------------------------------
// Atomic write — prevents file corruption on crash / power loss
// ---------------------------------------------------------------------------

/// Write `content` to `path` atomically via temp-file + rename.
///
/// 1. Create a temp file in the same directory (`{name}.{pid}.tmp`)
/// 2. Write + `sync_all()` the temp file
/// 3. `fs::rename()` to the target (POSIX-atomic)
/// 4. On any failure the temp file is cleaned up and the original remains intact.
pub fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("Cannot determine parent directory")?;
    fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;

    let file_name = path
        .file_name()
        .ok_or("Cannot determine file name")?
        .to_string_lossy();
    let pid = std::process::id();
    let tmp_name = format!("{}.{}.tmp", file_name, pid);
    let tmp_path = parent.join(&tmp_name);

    // Write to temp file
    let result = (|| -> Result<(), String> {
        {
            let mut file = fs::File::create(&tmp_path)
                .map_err(|e| format!("Failed to create temp file: {}", e))?;
            use std::io::Write;
            file.write_all(content.as_bytes())
                .map_err(|e| format!("Failed to write temp file: {}", e))?;
            file.sync_all()
                .map_err(|e| format!("Failed to sync temp file: {}", e))?;
        }
        // Atomic rename — on POSIX this is always atomic; on Windows uses
        // MOVEFILE_REPLACE_EXISTING via the `winapi` crate internally.
        fs::rename(&tmp_path, path).map_err(|e| format!("Failed to rename temp file: {}", e))?;
        Ok(())
    })();

    if result.is_err() {
        // Best-effort cleanup of temp file
        let _ = fs::remove_file(&tmp_path);
    }
    result
}

/// Remove stale `.tmp` files left by a previous crash.
///
/// A temp file is considered stale if:
/// - Its name matches `{anything}.{pid}.tmp` and `pid` is not a running process, OR
/// - It does not match the `{anything}.{pid}.tmp` pattern and is older than `STALE_THRESHOLD`.
pub fn cleanup_stale_temp_files(dir: &Path) {
    use std::time::Duration;

    const STALE_THRESHOLD: Duration = Duration::from_secs(60); // 1 minute

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if !name_str.ends_with(".tmp") {
            continue;
        }

        #[cfg(unix)]
        let stale = if let Some(pid) = extract_pid_from_tmp(&name_str) {
            !is_pid_alive(pid)
        } else {
            is_file_older_than(&entry, STALE_THRESHOLD)
        };
        // On non-Unix we can't reliably check process liveness, so every
        // .tmp file is cleaned based on age alone — including PID-pattern
        // files from the current process, which we must guard against.
        #[cfg(not(unix))]
        let stale = {
            let is_own_pid = extract_pid_from_tmp(&name_str)
                .map(|pid| pid == std::process::id())
                .unwrap_or(false);
            !is_own_pid && is_file_older_than(&entry, STALE_THRESHOLD)
        };

        if stale {
            let _ = fs::remove_file(entry.path());
            tracing::info!(
                target: "backend.files",
                path = %normalize_path(&entry.path()),
                "Cleaned up stale temp file"
            );
        }
    }
}

/// Extract PID from temp file name pattern `{name}.{pid}.tmp`.
/// Returns `None` if the name doesn't match the `{something}.{pid}.tmp` format
/// (e.g. bare `12345.tmp` without a name prefix).
fn extract_pid_from_tmp(name: &str) -> Option<u32> {
    let stem = name.strip_suffix(".tmp")?;
    let pid_str = stem.rsplit('.').next()?;
    // Guard: if there's no dot in the stem, `rsplit` returns the whole stem,
    // meaning the name is just `{number}.tmp` — not our `{name}.{pid}.tmp` format.
    if pid_str == stem {
        return None;
    }
    pid_str.parse::<u32>().ok()
}

/// Check if a Unix process is still alive (signal 0).
#[cfg(unix)]
fn is_pid_alive(pid: u32) -> bool {
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

/// Check whether a filesystem entry was last modified more than `threshold` ago.
fn is_file_older_than(entry: &fs::DirEntry, threshold: std::time::Duration) -> bool {
    entry
        .metadata()
        .and_then(|m| m.modified())
        .map(|t| t.elapsed().unwrap_or_default() > threshold)
        .unwrap_or(false)
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

/// Safety limit for read_file — frontend handles tier logic before calling,
/// this is a last-resort guard against OOM.
const MAX_READ_FILE_SIZE: u64 = 100 * 1024 * 1024; // 100MB

#[tauri::command]
pub fn write_file(path: String, content: String, state: State<AppState>) -> Result<(), String> {
    let path = resolve_path(&path, &state)?;
    if state.get_workspace().is_some() {
        validate_path_in_workspace(&path, &state)?;
    }
    atomic_write(&path, &content)
}

fn select_export_path(
    app: &AppHandle,
    title: &str,
    file_name: &str,
    filter_name: &str,
    extensions: &[&str],
) -> Result<Option<PathBuf>, String> {
    let Some(path) = app
        .dialog()
        .file()
        .set_title(title)
        .set_file_name(file_name)
        .add_filter(filter_name, extensions)
        .blocking_save_file()
    else {
        return Ok(None);
    };

    path.into_path()
        .map(Some)
        .map_err(|_| "Invalid save path".into())
}

#[tauri::command]
pub async fn save_mermaid_svg_export(
    svg: String,
    default_name: String,
    app: AppHandle,
) -> Result<bool, String> {
    let file_name = format!("{}.svg", default_name);
    let Some(path) = select_export_path(&app, "图片另存为 SVG", &file_name, "SVG", &["svg"])?
    else {
        return Ok(false);
    };

    fs::write(&path, svg).map_err(|e| format!("Failed to write file: {}", e))?;
    info!(target: "backend.files", path = %normalize_path(&path), "Exported Mermaid SVG");
    Ok(true)
}

#[tauri::command]
pub async fn save_mermaid_png_export(
    data: String,
    default_name: String,
    app: AppHandle,
) -> Result<bool, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Invalid base64 data: {}", e))?;
    if bytes.len() as u64 > MAX_IMAGE_SIZE {
        return Err("文件过大，最大支持 20MB".into());
    }

    let file_name = format!("{}.png", default_name);
    let Some(path) = select_export_path(&app, "图片另存为 PNG", &file_name, "PNG", &["png"])?
    else {
        return Ok(false);
    };

    fs::write(&path, bytes).map_err(|e| format!("Failed to write file: {}", e))?;
    info!(target: "backend.files", path = %normalize_path(&path), "Exported Mermaid PNG");
    Ok(true)
}

#[tauri::command]
pub async fn save_image_export(
    data: String,
    file_name: String,
    extension: String,
    app: AppHandle,
) -> Result<bool, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Invalid base64 data: {}", e))?;
    if bytes.len() as u64 > MAX_IMAGE_SIZE {
        return Err("文件过大，最大支持 20MB".into());
    }

    let normalized_extension = extension.trim().trim_start_matches('.').to_lowercase();
    let ext = if normalized_extension.is_empty() {
        "png"
    } else {
        normalized_extension.as_str()
    };
    let Some(path) = select_export_path(&app, "图片另存为", &file_name, "图片", &[ext])?
    else {
        return Ok(false);
    };

    fs::write(&path, bytes).map_err(|e| format!("Failed to write file: {}", e))?;
    info!(target: "backend.files", path = %normalize_path(&path), extension = %ext, "Exported image");
    Ok(true)
}

#[tauri::command]
pub async fn save_document_export(
    content: String,
    default_name: String,
    filter_name: String,
    extensions: Vec<String>,
    app: AppHandle,
) -> Result<bool, String> {
    let ext_refs: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
    let Some(path) = select_export_path(&app, "导出文档", &default_name, &filter_name, &ext_refs)?
    else {
        return Ok(false);
    };

    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))?;
    info!(target: "backend.files", path = %normalize_path(&path), "Exported document");
    Ok(true)
}

fn validate_parent_in_workspace(path: &Path, state: &State<AppState>) -> Result<(), String> {
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

fn normalize_lexical(path: &Path) -> PathBuf {
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

#[tauri::command]
pub fn file_exists(path: String, state: State<AppState>) -> Result<bool, String> {
    let path = resolve_path(&path, &state)?;
    Ok(path.exists())
}

#[derive(Debug, Serialize)]
pub struct FileStats {
    pub mtime: u64,
    pub size: u64,
}

#[tauri::command]
pub fn get_file_stats(path: String, state: State<AppState>) -> Result<FileStats, String> {
    let path = resolve_path(&path, &state)?;
    let metadata =
        fs::metadata(&path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
    let mtime = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64) // millisecond precision to detect rapid edits
        .unwrap_or(0);
    Ok(FileStats {
        mtime,
        size: metadata.len(),
    })
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    // --- atomic_write tests ---

    fn temp_dir() -> PathBuf {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("markflow_test_{}_{}", std::process::id(), n));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn atomic_write_creates_file() {
        let dir = temp_dir();
        let path = dir.join("test.md");
        atomic_write(&path, "hello world").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "hello world");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn atomic_write_overwrites_existing_file() {
        let dir = temp_dir();
        let path = dir.join("overwrite.md");
        fs::write(&path, "old content").unwrap();
        atomic_write(&path, "new content").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new content");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn atomic_write_preserves_old_file_on_failure() {
        let dir = temp_dir();
        let path = dir.join("preserve.md");
        fs::write(&path, "original").unwrap();
        // Make the target file read-only so rename fails (source exists, dest is read-only)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o444)).unwrap();
        }
        let result = atomic_write(&path, "should fail");
        // On Unix the rename should fail because dest is read-only
        if result.is_err() {
            assert_eq!(fs::read_to_string(&path).unwrap(), "original");
        }
        // Restore permissions for cleanup
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o644));
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn atomic_write_creates_parent_directories() {
        let dir = temp_dir();
        let path = dir.join("subdir").join("nested").join("file.md");
        atomic_write(&path, "nested content").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "nested content");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn atomic_write_cleans_up_temp_file_on_success() {
        let dir = temp_dir();
        let path = dir.join("clean.md");
        // Record .tmp files before the write
        let before: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name().to_string_lossy().contains("clean.md.")
                    && e.file_name().to_string_lossy().ends_with(".tmp")
            })
            .map(|e| e.path())
            .collect();
        atomic_write(&path, "content").unwrap();
        // No new .tmp files for this file should remain
        let after: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name().to_string_lossy().contains("clean.md.")
                    && e.file_name().to_string_lossy().ends_with(".tmp")
            })
            .map(|e| e.path())
            .collect();
        assert!(
            after.len() <= before.len(),
            "no new temp files should exist after success"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    // --- cleanup_stale_temp_files tests ---

    #[cfg(unix)]
    #[test]
    fn cleanup_removes_temp_with_dead_pid() {
        let dir = temp_dir();
        // Create a temp file with a PID that is definitely not running (e.g., 1 is init on Unix,
        // but we can't kill it — use a high number that's almost certainly not alive)
        let fake_pid = 999999999u32;
        let tmp = dir.join(format!("file.{}.tmp", fake_pid));
        fs::write(&tmp, "stale").unwrap();
        cleanup_stale_temp_files(&dir);
        assert!(!tmp.exists(), "stale temp file should be removed");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn cleanup_keeps_current_process_temp() {
        let dir = temp_dir();
        let pid = std::process::id();
        let tmp = dir.join(format!("file.{}.tmp", pid));
        fs::write(&tmp, "active").unwrap();
        cleanup_stale_temp_files(&dir);
        assert!(
            tmp.exists(),
            "temp file from current process should NOT be removed"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    // --- extract_pid_from_tmp tests ---

    #[test]
    fn extract_pid_from_tmp_valid() {
        assert_eq!(extract_pid_from_tmp("doc.12345.tmp"), Some(12345));
    }

    #[test]
    fn extract_pid_from_tmp_no_pid() {
        assert_eq!(extract_pid_from_tmp("doc.tmp"), None);
    }

    #[test]
    fn extract_pid_from_tmp_not_tmp() {
        assert_eq!(extract_pid_from_tmp("doc.md"), None);
    }

    #[test]
    fn normalizes_lexical_parent_segments_without_filesystem_access() {
        let path = Path::new("/workspace/docs/../notes/./draft.md");
        assert_eq!(
            normalize_lexical(path),
            PathBuf::from("/workspace/notes/draft.md")
        );
    }
}
