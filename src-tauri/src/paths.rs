use std::path::{Path, PathBuf};

pub fn app_config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("MarkFlow")
}

pub fn settings_path() -> PathBuf {
    app_config_dir().join("settings.json")
}

pub fn normalize_path(path: &Path) -> String {
    let path = path.to_string_lossy();
    let normalized = path.strip_prefix(r"\\?\").unwrap_or(&path);
    normalized.replace('\\', "/")
}
