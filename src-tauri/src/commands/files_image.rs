use crate::commands::files::RemoteImageData;
use crate::http::{
    redact_url_for_log, validate_external_url, validate_image_magic, MAX_IMAGE_SIZE,
};
use crate::paths::normalize_path;
use crate::state::AppState;
use base64::Engine;
use futures::StreamExt;
use std::fs;
use std::path::Path;
use tauri::State;
use tracing::info;

/// Fetch a remote image as bytes + MIME type.
///
/// Safety measures:
/// - URL validated (scheme, host, DNS-resolved IPs)
/// - Redirect targets re-validated with DNS check
/// - Streaming read with hard 20 MB cap
/// - Magic bytes validated against Content-Type
/// - Concurrency bounded by `AppState::http_semaphore`
async fn fetch_remote_image_bytes(
    url: &str,
    state: &AppState,
) -> Result<(Vec<u8>, String), String> {
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
        Some(MAX_IMAGE_SIZE),
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
    let mime_type = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
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
pub async fn download_image(
    url: String,
    dest: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    use crate::commands::files::validate_path_in_workspace;

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
