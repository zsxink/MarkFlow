use crate::commands::files::atomic_write;
use crate::config::settings::Settings;
use crate::error::{lock_mutex, AppError};
use crate::paths::{normalize_path, settings_path};
use std::fs;
use std::sync::Mutex;
use tracing::{debug, warn};

fn settings_cache() -> &'static Mutex<Option<Settings>> {
    static CACHE: Mutex<Option<Settings>> = Mutex::new(None);
    &CACHE
}

fn parse_settings(content: &str) -> Result<Settings, serde_json::Error> {
    serde_json::from_str(content)
}

pub fn load_settings_inner() -> Settings {
    // Return cached settings if available
    {
        let cache = lock_mutex(settings_cache())
            .expect("settings cache mutex poisoned")
            .clone();
        if let Some(cached) = cache {
            return cached;
        }
    }

    let path = settings_path();
    if !path.exists() {
        debug!(target: "backend.settings", path = %normalize_path(&path), "Settings file not found, using defaults");
        let settings = Settings::default();
        *lock_mutex(settings_cache()).expect("settings cache mutex poisoned") =
            Some(settings.clone());
        return settings;
    }
    let settings = match fs::read_to_string(&path) {
        Ok(content) => match parse_settings(&content) {
            Ok(settings) => settings,
            Err(error) => {
                warn!(target: "backend.settings", path = %normalize_path(&path), error = %error, "Failed to parse settings, using defaults");
                Settings::default()
            }
        },
        Err(error) => {
            warn!(target: "backend.settings", path = %normalize_path(&path), error = %error, "Failed to read settings, using defaults");
            Settings::default()
        }
    };
    *lock_mutex(settings_cache()).expect("settings cache mutex poisoned") = Some(settings.clone());
    settings
}

pub fn save_settings_inner(settings: &Settings) -> Result<(), AppError> {
    let path = settings_path();
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| AppError::serialization(format!("Failed to serialize settings: {}", e)))?;
    atomic_write(&path, &content).map_err(AppError::io)?;
    debug!(target: "backend.settings", path = %normalize_path(&path), "Saved settings");

    // Update cache after successful write
    *lock_mutex(settings_cache()).expect("settings cache mutex poisoned") = Some(settings.clone());
    Ok(())
}

#[tauri::command]
pub fn load_settings() -> Result<Settings, AppError> {
    Ok(load_settings_inner())
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<(), AppError> {
    save_settings_inner(&settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_settings_without_dropping_values() {
        let settings = Settings {
            theme: "dark".into(),
            ..Settings::default()
        };
        let json = serde_json::to_string(&settings).unwrap();
        assert_eq!(parse_settings(&json).unwrap().theme, "dark");
    }

    #[test]
    fn invalid_settings_fall_back_to_defaults() {
        assert!(parse_settings("{not-json").is_err());
    }

    #[test]
    fn legacy_settings_receive_file_tree_defaults() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        let object = value.as_object_mut().unwrap();
        object.remove("fileTreeIgnorePatterns");
        object.remove("fileTreePageSize");
        object.remove("fileTreeAutoLoadDepth");
        let parsed = parse_settings(&serde_json::to_string(&value).unwrap()).unwrap();
        assert_eq!(
            parsed.file_tree_ignore_patterns,
            vec![".git", "node_modules", "target", "dist"]
        );
        assert_eq!(parsed.file_tree_page_size, 500);
        assert_eq!(parsed.file_tree_auto_load_depth, 8);
    }

    #[test]
    fn legacy_settings_receive_empty_plantuml_server_url() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        value.as_object_mut().unwrap().remove("plantumlServerUrl");
        let parsed = parse_settings(&serde_json::to_string(&value).unwrap()).unwrap();
        assert_eq!(parsed.plantuml_server_url, "");
    }
}
