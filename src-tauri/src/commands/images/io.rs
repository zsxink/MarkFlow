//! Image byte I/O: magic-byte validation, asset scope grants and remote fetch.
//!
//! Remote fetches are bounded (semaphore + 20 MB cap) and validate magic bytes
//! while streaming so a mislabelled response never reaches the disk.

use crate::http::{validate_external_url, validate_image_magic, MAX_IMAGE_SIZE};
use crate::state::AppState;
use futures::StreamExt;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager};

pub(crate) fn allow_asset_directory(app: &AppHandle, root: &Path) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(root, true)
        .map_err(|error| format!("无法授权图片显示目录: {}", error))
}
pub(crate) fn atomic_write_image(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("无效的图片存储路径")?;
    fs::create_dir_all(parent).map_err(|e| format!("无法创建图片存储目录: {}", e))?;
    let temp_path = path.with_extension(format!(
        "{}.{}.tmp",
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or("image"),
        std::process::id(),
    ));
    let result = (|| {
        use std::io::Write;
        let mut file =
            fs::File::create(&temp_path).map_err(|e| format!("无法创建临时图片文件: {}", e))?;
        file.write_all(bytes)
            .map_err(|e| format!("无法写入临时图片文件: {}", e))?;
        file.sync_all()
            .map_err(|e| format!("无法同步临时图片文件: {}", e))?;
        drop(file);
        if path.exists() {
            fs::remove_file(path).map_err(|e| format!("无法替换目标图片: {}", e))?;
        }
        fs::rename(&temp_path, path).map_err(|e| format!("无法保存图片: {}", e))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}
pub(crate) fn validate_image_bytes(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() as u64 > MAX_IMAGE_SIZE {
        return Err("文件过大，最大支持 20MB".into());
    }
    if !validate_image_magic(bytes) {
        return Err("文件内容不是受支持的图片格式".into());
    }
    Ok(())
}
pub(crate) fn read_local_image_source(source: &Path) -> Result<Vec<u8>, String> {
    let metadata =
        fs::symlink_metadata(source).map_err(|error| format!("无法读取源图片: {}", error))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("源图片必须是普通文件，且不能是符号链接".into());
    }
    if metadata.len() > MAX_IMAGE_SIZE {
        return Err("文件过大，最大支持 20MB".into());
    }
    let bytes = fs::read(source).map_err(|error| format!("无法读取源图片: {}", error))?;
    validate_image_bytes(&bytes)?;
    Ok(bytes)
}
/// Fetch a remote image as bytes + MIME type.
///
/// Safety measures:
/// - URL validated (scheme, host, DNS-resolved IPs)
/// - Redirect targets re-validated with DNS check
/// - Streaming read with hard 20 MB cap
/// - Magic bytes validated against Content-Type
/// - Concurrency bounded by `AppState::http_semaphore`
pub(crate) async fn fetch_remote_image_bytes(
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
