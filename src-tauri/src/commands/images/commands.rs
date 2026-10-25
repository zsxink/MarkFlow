//! Image command surface: storage writes, remote downloads and draft lifecycle.
//!
//! Each command validates its destination through [`super::storage`] before any
//! bytes are written; the frontend never supplies an unchecked path.

use crate::commands::files::RemoteImageData;
use crate::commands::images::io::atomic_write_image;
use crate::commands::images::io::{
    allow_asset_directory, fetch_remote_image_bytes, read_local_image_source, validate_image_bytes,
};
use crate::commands::images::pending::{
    cleanup_expired_pending_images_at, cleanup_pending_images_at, migrate_pending_images_to_root,
    now_ms, pending_draft_dir, validate_pending_file_name, write_pending_image_at,
    write_pending_image_bytes_at, DownloadedImage, PendingImageMigrationResult,
    PendingImageWriteResult,
};
use crate::commands::images::storage::{
    authorize_image_storage_with_settings, authorized_storage_root, configured_storage_root,
    ensure_safe_directory, extension_for_mime, unique_destination, validate_image_destination,
};
use crate::commands::settings::load_settings_inner;
use crate::http::redact_url_for_log;
use crate::paths::{normalize_path, pending_images_dir};
use crate::state::AppState;
use base64::Engine;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tracing::info;

#[tauri::command]
pub fn authorize_image_storage(document_path: String, app: AppHandle) -> Result<String, String> {
    let settings = load_settings_inner();
    authorize_image_storage_with_settings(&document_path, &settings, |root| {
        allow_asset_directory(&app, root)
    })
}

/// Grant asset-protocol access to an image preview file's parent directory.
/// Unlike `authorize_image_storage` (which grants the *storage* root for
/// pasted images), previews render from whatever directory the opened image
/// already lives in.
#[tauri::command]
pub fn authorize_preview_directory(path: String, app: AppHandle) -> Result<(), String> {
    let parent = Path::new(&path)
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
        .ok_or_else(|| "无效的预览路径".to_string())?;
    allow_asset_directory(&app, parent)
}

#[tauri::command]
pub fn write_pending_image(
    draft_id: Option<String>,
    file_name: String,
    data: String,
    app: AppHandle,
) -> Result<PendingImageWriteResult, String> {
    let pending_root = pending_images_dir();
    let result = write_pending_image_at(&pending_root, draft_id.as_deref(), &file_name, &data)?;
    let draft_dir = pending_draft_dir(&pending_root, &result.draft_id)?;
    allow_asset_directory(&app, &draft_dir)?;
    Ok(result)
}

#[tauri::command]
pub fn copy_image_to_pending(
    draft_id: Option<String>,
    file_name: String,
    from: String,
    app: AppHandle,
) -> Result<PendingImageWriteResult, String> {
    let source = Path::new(&from);
    let bytes = read_local_image_source(source)?;
    let pending_root = pending_images_dir();
    let result =
        write_pending_image_bytes_at(&pending_root, draft_id.as_deref(), &file_name, &bytes)?;
    let draft_dir = pending_draft_dir(&pending_root, &result.draft_id)?;
    allow_asset_directory(&app, &draft_dir)?;
    Ok(result)
}

#[tauri::command]
pub fn migrate_pending_images(
    draft_id: String,
    document_path: String,
    app: AppHandle,
) -> Result<PendingImageMigrationResult, String> {
    let storage_root = configured_storage_root(Some(&document_path))?;
    if !storage_root.is_absolute() {
        return Err("图片存储路径必须是绝对路径".into());
    }
    let result = migrate_pending_images_to_root(&pending_images_dir(), &draft_id, &storage_root)?;
    allow_asset_directory(&app, &storage_root)?;
    Ok(result)
}

#[tauri::command]
pub fn cleanup_pending_images(draft_id: String) -> Result<(), String> {
    cleanup_pending_images_at(&pending_images_dir(), &draft_id)
}

#[tauri::command]
pub fn cleanup_expired_pending_images(
    recoverable_draft_ids: Option<Vec<String>>,
) -> Result<u64, String> {
    cleanup_expired_pending_images_at(
        &pending_images_dir(),
        recoverable_draft_ids.as_deref().unwrap_or(&[]),
        now_ms(),
    )
}

pub fn cleanup_expired_pending_images_on_startup() {
    match cleanup_expired_pending_images_at(&pending_images_dir(), &[], now_ms()) {
        Ok(removed) if removed > 0 => info!(
            target: "backend.files",
            removed,
            "Cleaned expired pending image drafts"
        ),
        Ok(_) => {}
        Err(error) => tracing::warn!(
            target: "backend.files",
            error = %error,
            "Failed to clean expired pending image drafts"
        ),
    }
}
#[tauri::command]
pub fn write_image_to_storage(
    path: String,
    storage_root: String,
    data: String,
    document_path: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let root = authorized_storage_root(Path::new(&storage_root), document_path.as_deref(), &state)?;
    ensure_safe_directory(&root)?;
    let destination = validate_image_destination(Path::new(&path), &root)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("无效的图片数据: {}", e))?;
    validate_image_bytes(&bytes)?;
    atomic_write_image(&destination, &bytes)?;
    allow_asset_directory(&app, &root)
}

#[tauri::command]
pub fn copy_image_to_storage(
    from: String,
    to: String,
    storage_root: String,
    document_path: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let source = Path::new(&from);
    let bytes = read_local_image_source(source)?;
    let root = authorized_storage_root(Path::new(&storage_root), document_path.as_deref(), &state)?;
    ensure_safe_directory(&root)?;
    let destination = validate_image_destination(Path::new(&to), &root)?;
    atomic_write_image(&destination, &bytes)?;
    allow_asset_directory(&app, &root)
}
#[tauri::command]
pub async fn download_image_to_pending(
    draft_id: Option<String>,
    file_name: String,
    url: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<PendingImageWriteResult, String> {
    let _permit = state
        .image_download_semaphore
        .acquire()
        .await
        .map_err(|error| format!("Semaphore error: {}", error))?;
    validate_pending_file_name(&file_name)?;
    let (bytes, mime_type) = fetch_remote_image_bytes(&url, &state).await?;
    let mut actual_name = PathBuf::from(file_name);
    if let Some(extension) = extension_for_mime(&mime_type) {
        actual_name.set_extension(extension);
    }
    let actual_name = actual_name
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("无效的网络图片文件名")?;
    let pending_root = pending_images_dir();
    let result =
        write_pending_image_bytes_at(&pending_root, draft_id.as_deref(), actual_name, &bytes)?;
    let draft_dir = pending_draft_dir(&pending_root, &result.draft_id)?;
    allow_asset_directory(&app, &draft_dir)?;
    info!(
        target: "backend.files",
        path = %result.path,
        url = %redact_url_for_log(&url),
        bytes = bytes.len(),
        "Downloaded image to pending draft"
    );
    Ok(result)
}

#[tauri::command]
pub async fn fetch_remote_image_as_base64(
    url: String,
    state: State<'_, AppState>,
) -> Result<RemoteImageData, String> {
    let _permit = state
        .image_download_semaphore
        .acquire()
        .await
        .map_err(|e| format!("Semaphore error: {}", e))?;
    let (bytes, mime_type) = fetch_remote_image_bytes(&url, &state).await?;
    Ok(RemoteImageData {
        data: base64::engine::general_purpose::STANDARD.encode(&bytes),
        mime_type,
    })
}

#[tauri::command]
pub async fn download_image_to_storage(
    url: String,
    dest: String,
    storage_root: String,
    use_mime_extension: bool,
    document_path: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DownloadedImage, String> {
    let _permit = state
        .image_download_semaphore
        .acquire()
        .await
        .map_err(|e| format!("Semaphore error: {}", e))?;
    let root = authorized_storage_root(Path::new(&storage_root), document_path.as_deref(), &state)?;
    ensure_safe_directory(&root)?;
    let initial_destination = validate_image_destination(Path::new(&dest), &root)?;
    let (bytes, mime_type) = fetch_remote_image_bytes(&url, &state).await?;
    let mut destination = initial_destination;
    if use_mime_extension {
        if let Some(extension) = extension_for_mime(&mime_type) {
            destination.set_extension(extension);
        }
    }
    destination = unique_destination(destination);
    destination = validate_image_destination(&destination, &root)?;
    atomic_write_image(&destination, &bytes)?;
    allow_asset_directory(&app, &root)?;
    info!(
        target: "backend.files",
        path = %normalize_path(&destination),
        url = %redact_url_for_log(&url),
        bytes = bytes.len(),
        "Downloaded image to authorized storage"
    );
    Ok(DownloadedImage {
        path: normalize_path(&destination),
        mime_type,
    })
}

#[tauri::command]
pub async fn download_image(
    url: String,
    dest: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    use crate::commands::files::paths::validate_path_in_workspace;

    let _permit = state
        .image_download_semaphore
        .acquire()
        .await
        .map_err(|e| format!("Semaphore error: {}", e))?;
    let dest_path = Path::new(&dest);
    validate_path_in_workspace(dest_path, &state)?;
    let (bytes, _) = fetch_remote_image_bytes(&url, &state).await?;
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    // Write to temp file first, then atomically rename to destination
    let temp_path = dest_path.with_extension(format!(
        "{}.tmp",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    fs::write(&temp_path, &bytes).map_err(|e| format!("Failed to write temp file: {}", e))?;
    // Clean up temp file if rename fails (e.g. antivirus lock, cross-device edge case)
    let cleanup = || {
        let _ = fs::remove_file(&temp_path);
    };
    fs::remove_file(dest_path).ok();
    if let Err(e) = fs::rename(&temp_path, dest_path) {
        cleanup();
        return Err(format!("Failed to rename temp file: {}", e));
    }
    info!(
        target: "backend.files",
        path = %normalize_path(dest_path),
        url = %redact_url_for_log(&url),
        bytes = bytes.len(),
        "Downloaded image"
    );
    Ok(dest)
}
