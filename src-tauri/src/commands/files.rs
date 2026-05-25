use crate::paths::normalize_path;
use crate::state::AppState;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::net::IpAddr;
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
        let canonical = path.canonicalize().map_err(|e| format!("Failed to resolve path: {}", e))?;
        if !canonical.starts_with(root) {
            continue;
        }
        let is_dir = metadata.is_dir();
        let children = if is_dir {
            Some(read_dir_inner(&canonical, root)?)
        } else {
            None
        };
        entries.push(FileEntry {
            name,
            path: normalize_path(&canonical),
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

const MAX_IMAGE_SIZE: u64 = 20 * 1024 * 1024; // 20MB

fn validate_remote_image_url(raw: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(raw).map_err(|_| "Invalid URL")?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err("Only http/https URLs are allowed".into()),
    }

    let host = url.host_str().ok_or("URL host required")?;
    if host.eq_ignore_ascii_case("localhost") {
        return Err("Localhost URLs are not allowed".into());
    }

    if let Ok(ip) = host.parse::<IpAddr>() {
        let blocked = match ip {
            IpAddr::V4(v4) => {
                v4.is_private()
                    || v4.is_loopback()
                    || v4.is_link_local()
                    || v4.is_multicast()
                    || v4.is_unspecified()
            }
            IpAddr::V6(v6) => {
                v6.is_loopback() || v6.is_multicast() || v6.is_unspecified() || v6.is_unique_local()
            }
        };
        if blocked {
            return Err("Private or local network URLs are not allowed".into());
        }
    }

    Ok(url)
}

async fn fetch_remote_image_bytes(url: &str) -> Result<(Vec<u8>, String), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut current_url = validate_remote_image_url(url)?;
    let mut redirects_remaining = 5;

    let response = loop {
        let response = client
            .get(current_url.clone())
            .send()
            .await
            .map_err(|e| format!("Failed to download: {}", e))?;

        if response.status().is_redirection() {
            if redirects_remaining == 0 {
                return Err("Too many redirects".into());
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or("Redirect location missing")?;
            let next_url = current_url
                .join(location)
                .map_err(|e| format!("Invalid redirect URL: {}", e))?;
            current_url = validate_remote_image_url(next_url.as_ref())?;
            redirects_remaining -= 1;
            continue;
        }

        break response;
    };

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
    let bytes = response.bytes().await.map_err(|e| format!("Failed to read response: {}", e))?;
    if bytes.len() as u64 > MAX_IMAGE_SIZE {
        return Err("文件过大，最大支持 20MB".into());
    }

    Ok((bytes.to_vec(), mime_type))
}

#[tauri::command]
pub async fn fetch_remote_image_as_base64(url: String) -> Result<RemoteImageData, String> {
    let (bytes, mime_type) = fetch_remote_image_bytes(&url).await?;
    Ok(RemoteImageData {
        data: base64::engine::general_purpose::STANDARD.encode(&bytes),
        mime_type,
    })
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
    let to = Path::new(&to);
    validate_parent_in_workspace(to, &state)?;
    fs::rename(&from, to).map_err(|e| format!("Failed to rename: {}", e))?;
    info!(target: "backend.files", from = %normalize_path(&from), to = %normalize_path(to), "Renamed path");
    Ok(())
}

#[tauri::command]
pub fn delete_path(path: String, state: State<AppState>) -> Result<(), String> {
    let path = resolve_path(&path, &state)?;
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
        let canonical = path.canonicalize().map_err(|e| format!("Failed to resolve path: {}", e))?;
        entries.push(FileEntry {
            name,
            path: normalize_path(&canonical),
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
pub async fn download_image(url: String, dest: String, state: State<'_, AppState>) -> Result<String, String> {
    let dest_path = Path::new(&dest);
    validate_path_in_workspace(dest_path, &state)?;
    let (bytes, _) = fetch_remote_image_bytes(&url).await?;
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    fs::write(dest_path, &bytes).map_err(|e| format!("Failed to write file: {}", e))?;
    info!(target: "backend.files", path = %normalize_path(dest_path), url = %url, bytes = bytes.len(), "Downloaded image");
    Ok(dest)
}
