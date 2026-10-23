//! Image storage settings, directory safety and destination validation.
//!
//! Everything here answers "may this path be written?" — the storage mode comes
//! from persisted settings, never from the frontend, and symlink hops are
//! rejected component by component.

use crate::commands::settings::load_settings_inner;
use crate::config::settings::Settings;
use crate::state::AppState;
use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::paths::normalize_path;

pub(crate) const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];

pub(crate) fn normalize_lexical(path: &Path) -> PathBuf {
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
pub(crate) fn configured_storage_root(document_path: Option<&str>) -> Result<PathBuf, String> {
    let settings = load_settings_inner();
    storage_root_for_settings(&settings, document_path)
}
pub(crate) fn storage_root_for_settings(
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
pub(crate) fn authorized_storage_root(
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
pub(crate) fn ensure_safe_directory(path: &Path) -> Result<(), String> {
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

/// Validate an existing storage directory without creating it.
///
/// If the path does not exist, this returns `Ok(())` — directory creation is
/// deferred to the first image write (the write commands call
/// [`ensure_safe_directory`]). If it does exist, it must be a real directory,
/// not a symlink and not a plain file.
pub(crate) fn reject_unsafe_existing_dir(path: &Path) -> Result<(), String> {
    if path.exists() {
        let metadata =
            fs::symlink_metadata(path).map_err(|error| format!("无法检查图片目录: {}", error))?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("不允许的路径：图片目录必须是普通目录，且不能是符号链接".into());
        }
    }
    Ok(())
}
pub(crate) fn reject_symlink_hops(root: &Path, path: &Path) -> Result<(), String> {
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
pub(crate) fn validate_image_destination(
    path: &Path,
    storage_root: &Path,
) -> Result<PathBuf, String> {
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
pub(crate) fn extension_for_mime(mime_type: &str) -> Option<&'static str> {
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
pub(crate) fn unique_destination(path: PathBuf) -> PathBuf {
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

/// Validate and authorize a storage root without creating it. The asset-allow
/// step is injected so tests can exercise the full flow without an `AppHandle`.
pub(crate) fn authorize_image_storage_with_settings(
    document_path: &str,
    settings: &Settings,
    allow_asset: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<String, String> {
    let root = storage_root_for_settings(settings, Some(document_path))?;
    if !root.is_absolute() {
        return Err("图片存储路径必须是绝对路径".into());
    }
    reject_unsafe_existing_dir(&root)?;
    reject_symlink_hops(&root, &root)?;
    allow_asset(&root)?;
    Ok(normalize_path(&root))
}
