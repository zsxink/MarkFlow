use crate::http::{
    MAX_IMAGE_SIZE, MAX_TITLE_LEN, MAX_TITLE_READ_BYTES, redact_url_for_log,
    validate_external_url, validate_image_magic,
};
use crate::paths::normalize_path;
use crate::state::AppState;
use base64::Engine;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::fs;
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

#[derive(Debug, Serialize)]
pub struct RemoteImageData {
    pub data: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
}

fn resolve_path(raw: &str, _state: &State<AppState>) -> Result<PathBuf, String> {
    // Simple path normalizer — no workspace scope check.
    // Files outside the current workspace are allowed (Typora/MarkText model).
    let path = Path::new(raw);
    path.canonicalize()
        .or_else(|_: std::io::Error| Ok(path.to_path_buf()))
        .map_err(|e: std::io::Error| format!("Invalid path: {}", e))
}

#[tauri::command]
pub fn read_file(path: String, state: State<AppState>) -> Result<String, String> {
    let path = resolve_path(&path, &state)?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn write_file(path: String, content: String, state: State<AppState>) -> Result<(), String> {
    let path = resolve_path(&path, &state)?;
    if state.get_workspace().is_some() {
        validate_path_in_workspace(&path, &state)?;
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    fs::write(&path, &content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
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
    let Some(path) = select_export_path(&app, "图片另存为 SVG", &file_name, "SVG", &["svg"])? else {
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
    let Some(path) = select_export_path(&app, "图片另存为 PNG", &file_name, "PNG", &["png"])? else {
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
    let Some(path) = select_export_path(&app, "图片另存为", &file_name, "图片", &[ext])? else {
        return Ok(false);
    };

    fs::write(&path, bytes).map_err(|e| format!("Failed to write file: {}", e))?;
    info!(target: "backend.files", path = %normalize_path(&path), extension = %ext, "Exported image");
    Ok(true)
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
        let metadata = fs::symlink_metadata(&path).map_err(|e| format!("Failed to inspect entry: {}", e))?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        // Symlinks already filtered above; non-symlink entries from read_dir are
        // inherently within the parent directory. Skip expensive canonicalize().
        let is_dir = metadata.is_dir();
        let children = if is_dir {
            Some(read_dir_inner(&path, root)?)
        } else {
            None
        };
        entries.push(FileEntry {
            name,
            path: normalize_path(&path),
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
fn validate_path_in_workspace(path: &Path, state: &State<AppState>) -> Result<(), String> {
    let workspace = state.get_workspace().ok_or("No workspace set")?;
    let workspace = workspace.canonicalize().map_err(|_| "Workspace not found")?;

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

// ---------------------------------------------------------------------------
// Remote content fetching — streaming, size-limited, SSRF-protected
// ---------------------------------------------------------------------------

/// Fetch a remote image as bytes + MIME type.
///
/// Safety measures:
/// - URL validated (scheme, host, DNS-resolved IPs)
/// - Redirect targets re-validated with DNS check
/// - Streaming read with hard 20 MB cap
/// - Magic bytes validated against Content-Type
/// - Concurrency bounded by `AppState::http_semaphore`
async fn fetch_remote_image_bytes(url: &str, state: &AppState) -> Result<(Vec<u8>, String), String> {
    let _permit = state
        .http_semaphore
        .acquire()
        .await
        .map_err(|_| "Semaphore closed".to_string())?;

    let response = crate::http::fetch_with_redirects(
        &state.http_client,
        url,
        5,
        validate_external_url,
    )
    .await?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let mime_type = content_type.split(';').next().unwrap_or("").trim().to_string();
    if !mime_type.starts_with("image/") {
        return Err("Only image responses are allowed".into());
    }

    // Stream the response body in chunks, accumulating size and validating magic bytes
    let mut stream = response.bytes_stream();
    let mut bytes: Vec<u8> = Vec::new();
    let mut checked_magic = false;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Failed to read response: {}", e))?;
        bytes.extend_from_slice(&chunk);

        // Validate magic bytes after receiving at least a few bytes
        if !checked_magic && bytes.len() >= 12 {
            if !validate_image_magic(&bytes) {
                return Err("Content does not match a supported image format".into());
            }
            checked_magic = true;
        }

        if bytes.len() as u64 > MAX_IMAGE_SIZE {
            return Err("文件过大，最大支持 20MB".into());
        }
    }

    if !checked_magic && !bytes.is_empty() {
        // Short response — still validate what we got
        if !validate_image_magic(&bytes) {
            return Err("Content does not match a supported image format".into());
        }
    }

    Ok((bytes, mime_type))
}

#[tauri::command]
pub async fn fetch_remote_image_as_base64(
    url: String,
    state: State<'_, AppState>,
) -> Result<RemoteImageData, String> {
    let (bytes, mime_type) = fetch_remote_image_bytes(&url, &state).await?;
    Ok(RemoteImageData {
        data: base64::engine::general_purpose::STANDARD.encode(&bytes),
        mime_type,
    })
}

/// Fetch the `<title>` from a remote page.
///
/// Safety measures:
/// - Same URL/DNS validation as image fetches
/// - Streaming read, hard 256 KB cap
/// - Title string truncated to 512 chars
/// - Concurrency bounded by semaphore
async fn fetch_page_title_inner(url: &str, state: &AppState) -> Result<String, String> {
    let _permit = state
        .http_semaphore
        .acquire()
        .await
        .map_err(|_| "Semaphore closed".to_string())?;

    let response = crate::http::fetch_with_redirects(
        &state.http_client,
        url,
        5,
        validate_external_url,
    )
    .await?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    // Stream at most MAX_TITLE_READ_BYTES, looking for <title>...</title>
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::with_capacity(8192);
    let mut total_read = 0usize;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "Failed to read response body".to_string())?;
        total_read += chunk.len();

        if total_read > MAX_TITLE_READ_BYTES {
            return Err("No title found".into());
        }

        buffer.extend_from_slice(&chunk);

        // Once we have enough data, try to extract the title
        if let Some(title) = extract_title_from_bytes(&buffer) {
            return Ok(title);
        }
    }

    // Stream ended — try extracting from whatever we read
    extract_title_from_bytes(&buffer).ok_or_else(|| "No title found".into())
}

/// Scan a byte buffer for `<title>...</title>` (case-insensitive).
/// Performs a single pass without allocating a lowercased copy.
fn extract_title_from_bytes(buf: &[u8]) -> Option<String> {
    // Case-insensitive search for "<title" — scan one byte at a time
    let tag_start = find_case_insensitive(buf, b"<title")?;
    let rest = &buf[tag_start..];
    let close = rest.iter().position(|&b| b == b'>')?;

    let content_start = tag_start + close + 1;
    let rest2 = &buf[content_start..];
    let title_end = content_start
        + find_case_insensitive(rest2, b"</title>")?;

    let raw_title = &buf[content_start..title_end];
    let title = String::from_utf8_lossy(raw_title).trim().to_string();
    if title.is_empty() {
        return None;
    }
    // Safe truncation: floor to a char boundary to avoid panicking on
    // multi-byte UTF-8 characters (CJK, emoji, etc.)
    if title.len() > MAX_TITLE_LEN {
        let boundary = title.floor_char_boundary(MAX_TITLE_LEN);
        Some(title[..boundary].to_string())
    } else {
        Some(title)
    }
}

/// Case-insensitive byte-pattern search in `haystack`.
/// Returns the byte offset of the first match, or `None`.
fn find_case_insensitive(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    'outer: for i in 0..=haystack.len() - needle.len() {
        for (j, &nb) in needle.iter().enumerate() {
            if haystack[i + j].to_ascii_lowercase() != nb.to_ascii_lowercase() {
                continue 'outer;
            }
        }
        return Some(i);
    }
    None
}

#[tauri::command]
pub async fn fetch_page_title(
    url: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    fetch_page_title_inner(&url, &state).await
}

#[tauri::command]
pub fn create_file(path: String, content: Option<String>, state: State<AppState>) -> Result<(), String> {
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
        let metadata = fs::symlink_metadata(&from_path).map_err(|e| format!("Failed to inspect entry: {}", e))?;
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
        let metadata = fs::symlink_metadata(&path).map_err(|e| format!("Failed to inspect entry: {}", e))?;
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
pub fn write_file_from_base64(path: String, data: String, state: State<AppState>) -> Result<(), String> {
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

#[tauri::command]
pub async fn download_image(
    url: String,
    dest: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let dest_path = Path::new(&dest);
    validate_path_in_workspace(dest_path, &state)?;
    let (bytes, _) = fetch_remote_image_bytes(&url, &state).await?;
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    fs::write(dest_path, &bytes).map_err(|e| format!("Failed to write file: {}", e))?;
    info!(
        target: "backend.files",
        path = %normalize_path(dest_path),
        url = %redact_url_for_log(&url),
        bytes = bytes.len(),
        "Downloaded image"
    );
    Ok(dest)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_title_basic() {
        let html = b"<html><head><title>My Page</title></head></html>";
        assert_eq!(extract_title_from_bytes(html).as_deref(), Some("My Page"));
    }

    #[test]
    fn extract_title_case_insensitive() {
        let html = b"<HTML><HEAD><TITLE>Test</TITLE></HEAD></HTML>";
        assert_eq!(extract_title_from_bytes(html).as_deref(), Some("Test"));
    }

    #[test]
    fn extract_title_with_surrounding_text() {
        let html = b"<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Hello World</title></head><body></body></html>";
        assert_eq!(extract_title_from_bytes(html).as_deref(), Some("Hello World"));
    }

    #[test]
    fn extract_title_empty_returns_none() {
        let html = b"<html><head><title></title></head></html>";
        assert!(extract_title_from_bytes(html).is_none());
    }

    #[test]
    fn extract_title_no_title_tag() {
        let html = b"<html><head></head><body>No title here</body></html>";
        assert!(extract_title_from_bytes(html).is_none());
    }

    #[test]
    fn extract_title_truncates_long_title() {
        let long_title = "A".repeat(600);
        let html = format!("<title>{}</title>", long_title);
        let result = extract_title_from_bytes(html.as_bytes()).unwrap();
        assert_eq!(result.len(), MAX_TITLE_LEN);
    }

    #[test]
    fn extract_title_truncates_multibyte_utf8_safely() {
        // 200 CJK chars = 600 bytes — truncation at 512 must not panic
        let long_title = "中".repeat(200);
        let html = format!("<title>{}</title>", long_title);
        let result = extract_title_from_bytes(html.as_bytes()).unwrap();
        // Result should be valid UTF-8 and <= MAX_TITLE_LEN bytes
        assert!(result.len() <= MAX_TITLE_LEN);
        assert!(String::from_utf8(result.into_bytes()).is_ok());
    }

    #[test]
    fn extract_title_whitespace_trimmed() {
        let html = b"<title>  Spaced  </title>";
        assert_eq!(extract_title_from_bytes(html).as_deref(), Some("Spaced"));
    }

    #[test]
    fn extract_title_short_buffer() {
        assert!(extract_title_from_bytes(b"hi").is_none());
    }
}
