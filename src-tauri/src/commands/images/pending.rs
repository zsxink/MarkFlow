//! Pending (unsaved-document) image drafts.
//!
//! An unsaved document cannot write into its final storage directory yet, so
//! images are staged in a per-draft directory with a manifest that makes the
//! migration idempotent and lets startup clean up abandoned drafts.

use crate::commands::images::io::{atomic_write_image, validate_image_bytes};
use crate::commands::images::storage::{
    ensure_safe_directory, normalize_lexical, reject_symlink_hops, unique_destination,
    validate_image_destination, IMAGE_EXTENSIONS,
};
use crate::paths::normalize_path;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const PENDING_MANIFEST_VERSION: u32 = 1;
const PENDING_MANIFEST_FILE: &str = "manifest.json";
pub(crate) const PENDING_RETENTION: Duration = Duration::from_secs(7 * 24 * 60 * 60);
static DRAFT_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedImage {
    pub path: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingImageWriteResult {
    pub draft_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PendingImageMapping {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingImageMigrationResult {
    pub draft_id: String,
    pub mappings: Vec<PendingImageMapping>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PendingImageEntry {
    pub(crate) staged_path: String,
    #[serde(default)]
    pub(crate) migrated_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PendingImageManifest {
    pub(crate) version: u32,
    pub(crate) draft_id: String,
    pub(crate) created_at_ms: u64,
    pub(crate) updated_at_ms: u64,
    pub(crate) entries: Vec<PendingImageEntry>,
}

pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}
fn is_valid_draft_id(draft_id: &str) -> bool {
    draft_id.len() == 32 && draft_id.bytes().all(|byte| byte.is_ascii_hexdigit())
}
fn generate_draft_id() -> String {
    let timestamp = now_ms();
    let counter = DRAFT_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!(
        "{:016x}{:08x}{:08x}",
        timestamp,
        std::process::id(),
        counter
    )
}
pub(crate) fn pending_draft_dir(pending_root: &Path, draft_id: &str) -> Result<PathBuf, String> {
    if !is_valid_draft_id(draft_id) {
        return Err("无效的图片草稿标识".into());
    }
    if !pending_root.is_absolute() {
        return Err("图片暂存根目录必须是绝对路径".into());
    }
    let root = normalize_lexical(pending_root);
    let draft = normalize_lexical(&root.join(draft_id));
    if !draft.starts_with(&root) || draft == root {
        return Err("不允许的路径：草稿目录超出允许范围".into());
    }
    Ok(draft)
}
fn manifest_path(draft_dir: &Path) -> PathBuf {
    draft_dir.join(PENDING_MANIFEST_FILE)
}
pub(crate) fn write_manifest(
    draft_dir: &Path,
    manifest: &PendingImageManifest,
) -> Result<(), String> {
    let content = serde_json::to_vec_pretty(manifest)
        .map_err(|error| format!("无法序列化图片暂存清单: {}", error))?;
    let path = manifest_path(draft_dir);
    let temp = draft_dir.join(format!("manifest.{}.tmp", now_ms()));
    fs::write(&temp, content).map_err(|error| format!("无法写入图片暂存清单: {}", error))?;
    let result = (|| {
        if path.exists() {
            fs::remove_file(&path).map_err(|error| format!("无法更新图片暂存清单: {}", error))?;
        }
        fs::rename(&temp, &path).map_err(|error| format!("无法保存图片暂存清单: {}", error))
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}
pub(crate) fn load_manifest(
    pending_root: &Path,
    draft_id: &str,
) -> Result<(PathBuf, PendingImageManifest), String> {
    let draft_dir = pending_draft_dir(pending_root, draft_id)?;
    let metadata =
        fs::symlink_metadata(&draft_dir).map_err(|_| "图片草稿不存在或已清理".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("不允许的路径：图片草稿目录不是普通目录".into());
    }
    reject_symlink_hops(pending_root, &draft_dir)?;
    let content = fs::read(manifest_path(&draft_dir))
        .map_err(|error| format!("无法读取图片暂存清单: {}", error))?;
    let manifest: PendingImageManifest = serde_json::from_slice(&content)
        .map_err(|error| format!("无法解析图片暂存清单: {}", error))?;
    if manifest.version != PENDING_MANIFEST_VERSION || manifest.draft_id != draft_id {
        return Err("图片暂存清单与草稿标识不一致".into());
    }
    Ok((draft_dir, manifest))
}
fn create_pending_draft(pending_root: &Path) -> Result<(PathBuf, PendingImageManifest), String> {
    ensure_safe_directory(pending_root)?;
    for _ in 0..16 {
        let draft_id = generate_draft_id();
        let draft_dir = pending_draft_dir(pending_root, &draft_id)?;
        match fs::create_dir(&draft_dir) {
            Ok(()) => {
                let timestamp = now_ms();
                let manifest = PendingImageManifest {
                    version: PENDING_MANIFEST_VERSION,
                    draft_id,
                    created_at_ms: timestamp,
                    updated_at_ms: timestamp,
                    entries: Vec::new(),
                };
                if let Err(error) = write_manifest(&draft_dir, &manifest) {
                    let _ = fs::remove_dir_all(&draft_dir);
                    return Err(error);
                }
                return Ok((draft_dir, manifest));
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("无法创建图片草稿目录: {}", error)),
        }
    }
    Err("无法生成唯一的图片草稿标识".into())
}
pub(crate) fn validate_pending_file_name(file_name: &str) -> Result<&str, String> {
    let path = Path::new(file_name);
    if file_name.is_empty()
        || path.file_name().and_then(|value| value.to_str()) != Some(file_name)
        || path.components().count() != 1
    {
        return Err("图片文件名不能包含目录或路径分隔符".into());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err("不支持的图片文件扩展名".into());
    }
    Ok(file_name)
}
fn staged_entry_path(
    pending_root: &Path,
    draft_dir: &Path,
    entry: &PendingImageEntry,
) -> Result<PathBuf, String> {
    let staged = PathBuf::from(&entry.staged_path);
    let staged = validate_image_destination(&staged, draft_dir)?;
    if staged.parent() != Some(draft_dir) {
        return Err("不允许的路径：暂存图片必须直接位于草稿目录".into());
    }
    if !staged.starts_with(pending_root) {
        return Err("不允许的路径：暂存图片超出允许范围".into());
    }
    Ok(staged)
}
pub(crate) fn write_pending_image_at(
    pending_root: &Path,
    draft_id: Option<&str>,
    file_name: &str,
    data: &str,
) -> Result<PendingImageWriteResult, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|error| format!("无效的图片数据: {}", error))?;
    write_pending_image_bytes_at(pending_root, draft_id, file_name, &bytes)
}
pub(crate) fn write_pending_image_bytes_at(
    pending_root: &Path,
    draft_id: Option<&str>,
    file_name: &str,
    bytes: &[u8],
) -> Result<PendingImageWriteResult, String> {
    validate_pending_file_name(file_name)?;
    validate_image_bytes(bytes)?;

    ensure_safe_directory(pending_root)?;
    let (draft_dir, mut manifest) = match draft_id {
        Some(draft_id) => load_manifest(pending_root, draft_id)?,
        None => create_pending_draft(pending_root)?,
    };
    let destination = unique_destination(draft_dir.join(file_name));
    let destination = validate_image_destination(&destination, &draft_dir)?;
    atomic_write_image(&destination, bytes)?;
    let normalized = normalize_path(&destination);
    manifest.entries.push(PendingImageEntry {
        staged_path: normalized.clone(),
        migrated_path: None,
    });
    manifest.updated_at_ms = now_ms();
    if let Err(error) = write_manifest(&draft_dir, &manifest) {
        let _ = fs::remove_file(&destination);
        return Err(error);
    }
    Ok(PendingImageWriteResult {
        draft_id: manifest.draft_id,
        path: normalized,
    })
}
pub(crate) fn migrate_pending_images_to_root(
    pending_root: &Path,
    draft_id: &str,
    storage_root: &Path,
) -> Result<PendingImageMigrationResult, String> {
    ensure_safe_directory(storage_root)?;
    let (draft_dir, mut manifest) = load_manifest(pending_root, draft_id)?;
    let mut mappings = Vec::with_capacity(manifest.entries.len());

    for index in 0..manifest.entries.len() {
        let staged = staged_entry_path(pending_root, &draft_dir, &manifest.entries[index])?;
        let bytes = fs::read(&staged).map_err(|error| format!("无法读取暂存图片: {}", error))?;
        validate_image_bytes(&bytes)?;
        let file_name = staged.file_name().ok_or("暂存图片缺少文件名")?;

        let previous = manifest.entries[index]
            .migrated_path
            .as_deref()
            .map(PathBuf::from)
            .and_then(|path| validate_image_destination(&path, storage_root).ok());
        let mut destination =
            previous.unwrap_or_else(|| unique_destination(storage_root.join(file_name)));

        if destination.exists() {
            let existing =
                fs::read(&destination).map_err(|error| format!("无法读取已迁移图片: {}", error))?;
            if existing != bytes {
                destination = unique_destination(storage_root.join(file_name));
            }
        }
        destination = validate_image_destination(&destination, storage_root)?;
        if !destination.exists() {
            atomic_write_image(&destination, &bytes)?;
        }

        let from = normalize_path(&staged);
        let to = normalize_path(&destination);
        manifest.entries[index].migrated_path = Some(to.clone());
        manifest.updated_at_ms = now_ms();
        // Persist every successful item so a partially failed migration retries
        // with the same destination and never creates duplicate orphan files.
        write_manifest(&draft_dir, &manifest)?;
        mappings.push(PendingImageMapping { from, to });
    }

    Ok(PendingImageMigrationResult {
        draft_id: draft_id.to_owned(),
        mappings,
    })
}
pub(crate) fn cleanup_pending_images_at(pending_root: &Path, draft_id: &str) -> Result<(), String> {
    let (draft_dir, manifest) = load_manifest(pending_root, draft_id)?;
    for entry in &manifest.entries {
        let _ = staged_entry_path(pending_root, &draft_dir, entry)?;
    }
    fs::remove_dir_all(&draft_dir).map_err(|error| format!("无法清理图片草稿: {}", error))
}
pub(crate) fn cleanup_expired_pending_images_at(
    pending_root: &Path,
    recoverable_draft_ids: &[String],
    current_time_ms: u64,
) -> Result<u64, String> {
    if !pending_root.exists() {
        return Ok(0);
    }
    ensure_safe_directory(pending_root)?;
    let protected: HashSet<&str> = recoverable_draft_ids.iter().map(String::as_str).collect();
    let retention_ms: u64 = PENDING_RETENTION.as_millis().try_into().unwrap_or(u64::MAX);
    let cutoff = current_time_ms.saturating_sub(retention_ms);
    let mut removed = 0;

    for entry in
        fs::read_dir(pending_root).map_err(|error| format!("无法读取图片暂存目录: {}", error))?
    {
        let entry = entry.map_err(|error| format!("无法读取图片草稿: {}", error))?;
        let Some(draft_id) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if !is_valid_draft_id(&draft_id) || protected.contains(draft_id.as_str()) {
            continue;
        }
        let Ok((_, manifest)) = load_manifest(pending_root, &draft_id) else {
            // Unknown or tampered directories are not deleted automatically.
            continue;
        };
        if manifest.updated_at_ms <= cutoff {
            cleanup_pending_images_at(pending_root, &draft_id)?;
            removed += 1;
        }
    }
    Ok(removed)
}
