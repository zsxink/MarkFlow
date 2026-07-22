use std::path::{Path, PathBuf};

pub fn app_config_dir() -> PathBuf {
    #[cfg(feature = "e2e")]
    {
        return e2e_data_dir(std::env::var_os("MARKFLOW_E2E_DATA_DIR"));
    }

    #[cfg(not(feature = "e2e"))]
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("MarkFlow")
}

/// Per-user local application data. Pending images live here rather than in a
/// public temporary directory so they survive an application restart.
pub fn app_local_data_dir() -> PathBuf {
    #[cfg(feature = "e2e")]
    {
        return e2e_data_dir(std::env::var_os("MARKFLOW_E2E_DATA_DIR"));
    }

    #[cfg(not(feature = "e2e"))]
    dirs::data_local_dir()
        .unwrap_or_else(app_config_dir)
        .join("MarkFlow")
}

pub fn pending_images_dir() -> PathBuf {
    app_local_data_dir().join("pending-images")
}

#[cfg(feature = "e2e")]
fn e2e_data_dir(value: Option<std::ffi::OsString>) -> PathBuf {
    let path = value
        .map(PathBuf::from)
        .unwrap_or_else(|| panic!("MARKFLOW_E2E_DATA_DIR is required for E2E builds"));
    assert!(
        path.is_absolute(),
        "MARKFLOW_E2E_DATA_DIR must be an absolute path"
    );
    std::fs::create_dir_all(&path)
        .unwrap_or_else(|error| panic!("Failed to create MARKFLOW_E2E_DATA_DIR: {error}"));
    path
}

pub fn settings_path() -> PathBuf {
    app_config_dir().join("settings.json")
}

pub fn normalize_path(path: &Path) -> String {
    let path = path.to_string_lossy();
    let normalized = path.strip_prefix(r"\\?\").unwrap_or(&path);
    normalized.replace('\\', "/")
}

#[cfg(all(test, feature = "e2e"))]
mod tests {
    use super::*;

    #[test]
    fn e2e_data_dir_rejects_missing_and_relative_values() {
        assert!(std::panic::catch_unwind(|| e2e_data_dir(None)).is_err());
        assert!(std::panic::catch_unwind(|| e2e_data_dir(Some("relative".into()))).is_err());
    }

    #[test]
    fn e2e_data_dir_uses_the_explicit_absolute_root() {
        let dir = std::env::temp_dir().join(format!("markflow-e2e-paths-{}", std::process::id()));
        let resolved = e2e_data_dir(Some(dir.clone().into_os_string()));
        assert_eq!(resolved, dir);
        assert!(resolved.is_dir());
        let _ = std::fs::remove_dir_all(resolved);
    }
}
