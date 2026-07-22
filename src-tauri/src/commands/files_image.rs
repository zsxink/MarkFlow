use crate::commands::files::RemoteImageData;
use crate::commands::settings::load_settings_inner;
use crate::config::settings::Settings;
use crate::http::{
    redact_url_for_log, validate_external_url, validate_image_magic, MAX_IMAGE_SIZE,
};
use crate::paths::{normalize_path, pending_images_dir};
use crate::state::AppState;
use base64::Engine;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use tracing::info;

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
const PENDING_MANIFEST_VERSION: u32 = 1;
const PENDING_MANIFEST_FILE: &str = "manifest.json";
const PENDING_RETENTION: Duration = Duration::from_secs(7 * 24 * 60 * 60);
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
struct PendingImageEntry {
    staged_path: String,
    #[serde(default)]
    migrated_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingImageManifest {
    version: u32,
    draft_id: String,
    created_at_ms: u64,
    updated_at_ms: u64,
    entries: Vec<PendingImageEntry>,
}

fn normalize_lexical(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            _ => normalized.push(component.as_os_str()),
        }
    }
    normalized
}

fn configured_storage_root(document_path: Option<&str>) -> Result<PathBuf, String> {
    let settings = load_settings_inner();
    storage_root_for_settings(&settings, document_path)
}

fn storage_root_for_settings(
    settings: &Settings,
    document_path: Option<&str>,
) -> Result<PathBuf, String> {
    let expected = match settings.image_storage_mode.as_str() {
        "document-dir" => Path::new(document_path.ok_or("图片存储需要已保存的当前文档")?)
            .parent()
            .ok_or("无法确定当前文档目录")?
            .to_path_buf(),
        "document-named-dir" => {
            let document = Path::new(document_path.ok_or("图片存储需要已保存的当前文档")?);
            let parent = document.parent().ok_or("无法确定当前文档目录")?;
            let name = document
                .file_stem()
                .and_then(|value| value.to_str())
                .filter(|value| !value.is_empty())
                .ok_or("无法确定当前文档文件名")?;
            parent.join(format!("{}-images", name))
        }
        "custom" => {
            let custom = settings
                .image_custom_path
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("./images");
            let custom_path = Path::new(custom);
            if custom_path.is_absolute() {
                custom_path.to_path_buf()
            } else {
                Path::new(document_path.ok_or("相对图片路径需要已保存的当前文档")?)
                    .parent()
                    .ok_or("无法确定当前文档目录")?
                    .join(custom_path)
            }
        }
        _ => return Err("无效的图片存储模式".into()),
    };
    Ok(normalize_lexical(&expected))
}

fn authorized_storage_root(
    supplied_root: &Path,
    document_path: Option<&str>,
    _state: &AppState,
) -> Result<PathBuf, String> {
    let expected = configured_storage_root(document_path)?;
    let supplied = normalize_lexical(supplied_root);
    if supplied != expected {
        return Err("不允许的路径：存储目录与当前设置不一致".into());
    }
    Ok(expected)
}

fn allow_asset_directory(app: &AppHandle, root: &Path) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(root, true)
        .map_err(|error| format!("无法授权图片显示目录: {}", error))
}

fn ensure_safe_directory(path: &Path) -> Result<(), String> {
    if path.exists() {
        let metadata =
            fs::symlink_metadata(path).map_err(|error| format!("无法检查图片目录: {}", error))?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("不允许的路径：图片目录必须是普通目录，且不能是符号链接".into());
        }
    }
    fs::create_dir_all(path).map_err(|error| format!("无法创建图片目录: {}", error))?;
    let metadata =
        fs::symlink_metadata(path).map_err(|error| format!("无法检查图片目录: {}", error))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("不允许的路径：图片目录必须是普通目录，且不能是符号链接".into());
    }
    Ok(())
}

#[tauri::command]
pub fn authorize_image_storage(document_path: String, app: AppHandle) -> Result<String, String> {
    let root = configured_storage_root(Some(&document_path))?;
    if !root.is_absolute() {
        return Err("图片存储路径必须是绝对路径".into());
    }
    ensure_safe_directory(&root)?;
    reject_symlink_hops(&root, &root)?;
    allow_asset_directory(&app, &root)?;
    Ok(normalize_path(&root))
}

fn reject_symlink_hops(root: &Path, path: &Path) -> Result<(), String> {
    if root.exists() {
        let metadata =
            fs::symlink_metadata(root).map_err(|e| format!("无法检查图片存储路径: {}", e))?;
        if metadata.file_type().is_symlink() {
            return Err("不允许的路径：符号链接指向存储目录外".into());
        }
    }
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "不允许的路径：路径超出允许范围")?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        current.push(component.as_os_str());
        if current.exists() {
            let metadata = fs::symlink_metadata(&current)
                .map_err(|e| format!("无法检查图片存储路径: {}", e))?;
            if metadata.file_type().is_symlink() {
                return Err("不允许的路径：符号链接指向存储目录外".into());
            }
        }
    }
    Ok(())
}

fn validate_image_destination(path: &Path, storage_root: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() || !storage_root.is_absolute() {
        return Err("图片存储路径必须是绝对路径".into());
    }
    let root = normalize_lexical(storage_root);
    let destination = normalize_lexical(path);
    if destination == root || !destination.starts_with(&root) {
        return Err("不允许的路径：路径超出允许范围".into());
    }
    let extension = destination
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err("不支持的图片文件扩展名".into());
    }
    reject_symlink_hops(&root, destination.parent().ok_or("无效的图片存储路径")?)?;
    if destination.exists() {
        let metadata =
            fs::symlink_metadata(&destination).map_err(|e| format!("无法检查目标图片: {}", e))?;
        if metadata.file_type().is_symlink() {
            return Err("不允许的路径：符号链接指向存储目录外".into());
        }
    }
    Ok(destination)
}

fn atomic_write_image(path: &Path, bytes: &[u8]) -> Result<(), String> {
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

fn validate_image_bytes(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() as u64 > MAX_IMAGE_SIZE {
        return Err("文件过大，最大支持 20MB".into());
    }
    if !validate_image_magic(bytes) {
        return Err("文件内容不是受支持的图片格式".into());
    }
    Ok(())
}

fn read_local_image_source(source: &Path) -> Result<Vec<u8>, String> {
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

fn extension_for_mime(mime_type: &str) -> Option<&'static str> {
    match mime_type {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/svg+xml" => Some("svg"),
        "image/bmp" => Some("bmp"),
        _ => None,
    }
}

fn unique_destination(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let parent = path.parent().unwrap_or(Path::new(""));
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png");
    for index in 1.. {
        let candidate = parent.join(format!("{}-{}.{}", stem, index, extension));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

fn now_ms() -> u64 {
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

fn pending_draft_dir(pending_root: &Path, draft_id: &str) -> Result<PathBuf, String> {
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

fn write_manifest(draft_dir: &Path, manifest: &PendingImageManifest) -> Result<(), String> {
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

fn load_manifest(
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

fn validate_pending_file_name(file_name: &str) -> Result<&str, String> {
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

fn write_pending_image_at(
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

fn write_pending_image_bytes_at(
    pending_root: &Path,
    draft_id: Option<&str>,
    file_name: &str,
    bytes: &[u8],
) -> Result<PendingImageWriteResult, String> {
    validate_pending_file_name(file_name)?;
    validate_image_bytes(&bytes)?;

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

fn migrate_pending_images_to_root(
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

fn cleanup_pending_images_at(pending_root: &Path, draft_id: &str) -> Result<(), String> {
    let (draft_dir, manifest) = load_manifest(pending_root, draft_id)?;
    for entry in &manifest.entries {
        let _ = staged_entry_path(pending_root, &draft_dir, entry)?;
    }
    fs::remove_dir_all(&draft_dir).map_err(|error| format!("无法清理图片草稿: {}", error))
}

fn cleanup_expired_pending_images_at(
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const PNG_BYTES: &[u8] = b"\x89PNG\r\n\x1a\nmock";
    const JPEG_BYTES: &[u8] = b"\xff\xd8\xff\xe0mock";

    fn temp_dir() -> PathBuf {
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        let index = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "markflow_image_storage_{}_{}",
            std::process::id(),
            index
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn destination_must_stay_inside_storage_root() {
        let root = temp_dir();
        let outside = root.parent().unwrap().join("escape.png");
        let error = validate_image_destination(&outside, &root).unwrap_err();
        assert!(error.contains("路径超出允许范围"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn destination_accepts_nonexistent_nested_directory() {
        let root = temp_dir();
        let destination = root.join("nested").join("image.png");
        assert_eq!(
            validate_image_destination(&destination, &root).unwrap(),
            destination
        );
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn destination_rejects_symlink_hop() {
        use std::os::unix::fs::symlink;
        let root = temp_dir();
        let outside = temp_dir();
        symlink(&outside, root.join("linked")).unwrap();
        let destination = root.join("linked").join("image.png");
        let error = validate_image_destination(&destination, &root).unwrap_err();
        assert!(error.contains("符号链接"));
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }

    #[test]
    fn mime_extension_uses_canonical_jpeg_suffix() {
        assert_eq!(extension_for_mime("image/jpeg"), Some("jpg"));
        assert_eq!(extension_for_mime("text/html"), None);
    }

    #[test]
    fn storage_modes_resolve_from_the_document_without_a_second_level_directory() {
        let root = temp_dir();
        let document = root.join("README.zh-CN.md");
        let document_string = document.to_string_lossy();
        let mut settings = Settings::default();

        settings.image_storage_mode = "document-dir".into();
        assert_eq!(
            storage_root_for_settings(&settings, Some(&document_string)).unwrap(),
            root
        );

        settings.image_storage_mode = "document-named-dir".into();
        assert_eq!(
            storage_root_for_settings(&settings, Some(&document_string)).unwrap(),
            root.join("README.zh-CN-images")
        );

        settings.image_storage_mode = "custom".into();
        settings.image_custom_path = Some("./images".into());
        assert_eq!(
            storage_root_for_settings(&settings, Some(&document_string)).unwrap(),
            root.join("images")
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn pending_write_generates_draft_and_never_overwrites_same_name() {
        let pending_root = temp_dir();
        let data = base64::engine::general_purpose::STANDARD.encode(PNG_BYTES);
        let first = write_pending_image_at(&pending_root, None, "image.png", &data).unwrap();
        let second =
            write_pending_image_at(&pending_root, Some(&first.draft_id), "image.png", &data)
                .unwrap();

        assert!(first.path.ends_with("/image.png"));
        assert!(second.path.ends_with("/image-1.png"));
        let (_, manifest) = load_manifest(&pending_root, &first.draft_id).unwrap();
        assert_eq!(manifest.entries.len(), 2);
        let _ = fs::remove_dir_all(pending_root);
    }

    #[test]
    fn pending_migration_is_idempotent_and_reuses_its_manifest_mapping() {
        let pending_root = temp_dir();
        let storage_root = temp_dir();
        let data = base64::engine::general_purpose::STANDARD.encode(PNG_BYTES);
        let staged = write_pending_image_at(&pending_root, None, "image.png", &data).unwrap();
        fs::write(storage_root.join("image.png"), JPEG_BYTES).unwrap();

        let first =
            migrate_pending_images_to_root(&pending_root, &staged.draft_id, &storage_root).unwrap();
        let second =
            migrate_pending_images_to_root(&pending_root, &staged.draft_id, &storage_root).unwrap();

        assert_eq!(first.mappings, second.mappings);
        assert!(first.mappings[0].to.ends_with("/image-1.png"));
        assert_eq!(
            fs::read(storage_root.join("image-1.png")).unwrap(),
            PNG_BYTES
        );
        assert!(!storage_root.join("image-2.png").exists());
        let _ = fs::remove_dir_all(pending_root);
        let _ = fs::remove_dir_all(storage_root);
    }

    #[test]
    fn pending_manifest_cannot_redirect_migration_outside_the_draft() {
        let pending_root = temp_dir();
        let storage_root = temp_dir();
        let data = base64::engine::general_purpose::STANDARD.encode(PNG_BYTES);
        let staged = write_pending_image_at(&pending_root, None, "image.png", &data).unwrap();
        let (draft_dir, mut manifest) = load_manifest(&pending_root, &staged.draft_id).unwrap();
        manifest.entries[0].staged_path = storage_root.join("outside.png").to_string_lossy().into();
        write_manifest(&draft_dir, &manifest).unwrap();

        let error = migrate_pending_images_to_root(&pending_root, &staged.draft_id, &storage_root)
            .unwrap_err();
        assert!(error.contains("路径超出允许范围"));
        let _ = fs::remove_dir_all(pending_root);
        let _ = fs::remove_dir_all(storage_root);
    }

    #[test]
    fn expired_cleanup_preserves_recoverable_drafts_then_removes_them() {
        let pending_root = temp_dir();
        let data = base64::engine::general_purpose::STANDARD.encode(PNG_BYTES);
        let staged = write_pending_image_at(&pending_root, None, "image.png", &data).unwrap();
        let (draft_dir, mut manifest) = load_manifest(&pending_root, &staged.draft_id).unwrap();
        manifest.updated_at_ms = 0;
        write_manifest(&draft_dir, &manifest).unwrap();
        let after_retention = PENDING_RETENTION.as_millis() as u64 + 1;

        assert_eq!(
            cleanup_expired_pending_images_at(
                &pending_root,
                std::slice::from_ref(&staged.draft_id),
                after_retention,
            )
            .unwrap(),
            0
        );
        assert!(draft_dir.exists());
        assert_eq!(
            cleanup_expired_pending_images_at(&pending_root, &[], after_retention).unwrap(),
            1
        );
        assert!(!draft_dir.exists());
        let _ = fs::remove_dir_all(pending_root);
    }

    #[test]
    fn pending_draft_id_rejects_path_components() {
        let pending_root = temp_dir();
        let error = pending_draft_dir(&pending_root, "../outside").unwrap_err();
        assert!(error.contains("草稿标识"));
        let _ = fs::remove_dir_all(pending_root);
    }

    #[test]
    fn local_image_source_requires_valid_image_content() {
        let root = temp_dir();
        let source = root.join("image.png");
        fs::write(&source, PNG_BYTES).unwrap();
        assert_eq!(read_local_image_source(&source).unwrap(), PNG_BYTES);

        fs::write(&source, b"not an image").unwrap();
        assert!(read_local_image_source(&source).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn local_image_source_rejects_symlinks() {
        use std::os::unix::fs::symlink;
        let root = temp_dir();
        let source = root.join("source.png");
        let linked = root.join("linked.png");
        fs::write(&source, PNG_BYTES).unwrap();
        symlink(&source, &linked).unwrap();
        assert!(read_local_image_source(&linked)
            .unwrap_err()
            .contains("符号链接"));
        let _ = fs::remove_dir_all(root);
    }
}
