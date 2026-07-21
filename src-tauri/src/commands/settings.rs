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
    let mut value: serde_json::Value = serde_json::from_str(content)?;
    // Migration: version 1 → version 2
    let version = value.get("version").and_then(|v| v.as_u64()).unwrap_or(1);
    if version < 2 {
        migrate_v1_to_v2(&mut value);
        value["version"] = serde_json::Value::Number(2u64.into());
    }
    serde_json::from_value(value)
}

/// Migrate version 1 settings to version 2:
/// - imageStorageMode: none → "workspace-assets"
/// - imageAutoCopyLocal: true → imageLocalFileBehavior: "copy", false → "reference"
/// - imageDownloadNetwork: true → imageNetworkBehavior: "download", false → "keep-url"
/// - imagePreferRelative: false → imageReferenceStyle: "absolute", else "relative"
fn migrate_v1_to_v2(value: &mut serde_json::Value) {
    let obj = match value.as_object_mut() {
        Some(o) => o,
        None => return,
    };

    // Migrate image_storage_mode: "none" → "workspace-assets"
    if let Some(mode) = obj.get("imageStorageMode").and_then(|v| v.as_str()) {
        if mode == "none" {
            obj["imageStorageMode"] = serde_json::Value::String("workspace-assets".into());
            // When old mode was "none", the old behavior was equivalent to "reference"
            if !obj.contains_key("imageLocalFileBehavior") {
                obj["imageLocalFileBehavior"] = serde_json::Value::String("reference".into());
            }
        }
    } else if !obj.contains_key("imageStorageMode") {
        obj["imageStorageMode"] = serde_json::Value::String("workspace-assets".into());
    }

    // Migrate image_auto_copy_local → image_local_file_behavior
    if !obj.contains_key("imageLocalFileBehavior") {
        if let Some(auto_copy) = obj.get("imageAutoCopyLocal").and_then(|v| v.as_bool()) {
            obj["imageLocalFileBehavior"] = serde_json::Value::String(
                if auto_copy { "copy" } else { "reference" }.into()
            );
        }
    }

    // Migrate image_download_network → image_network_behavior
    if !obj.contains_key("imageNetworkBehavior") {
        if let Some(download) = obj.get("imageDownloadNetwork").and_then(|v| v.as_bool()) {
            obj["imageNetworkBehavior"] = serde_json::Value::String(
                if download { "download" } else { "keep-url" }.into()
            );
        }
    }

    // Migrate image_prefer_relative → image_reference_style
    if !obj.contains_key("imageReferenceStyle") {
        if let Some(relative) = obj.get("imagePreferRelative").and_then(|v| v.as_bool()) {
            obj["imageReferenceStyle"] = serde_json::Value::String(
                if relative { "relative" } else { "absolute" }.into()
            );
        }
    }
}

pub fn load_settings_inner() -> Settings {
    // Return cached settings if available
    {
        let cache = match lock_mutex(settings_cache()) {
            Ok(guard) => guard.clone(),
            Err(e) => {
                warn!(target: "backend.settings", error = %e, "Settings cache lock poisoned, ignoring cache");
                None
            }
        };
        if let Some(cached) = cache {
            return cached;
        }
    }

    let path = settings_path();
    if !path.exists() {
        debug!(target: "backend.settings", path = %normalize_path(&path), "Settings file not found, using defaults");
        let settings = Settings::default();
        match lock_mutex(settings_cache()) {
            Ok(mut cache) => {
                *cache = Some(settings.clone());
            }
            Err(e) => {
                warn!(target: "backend.settings", error = %e, "Cannot update settings cache");
            }
        }
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
    match lock_mutex(settings_cache()) {
        Ok(mut cache) => {
            *cache = Some(settings.clone());
        }
        Err(e) => {
            warn!(target: "backend.settings", error = %e, "Cannot update settings cache");
        }
    }
    settings
}

pub fn save_settings_inner(settings: &Settings) -> Result<(), AppError> {
    let path = settings_path();
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| AppError::serialization(format!("Failed to serialize settings: {}", e)))?;
    atomic_write(&path, &content).map_err(AppError::io)?;
    debug!(target: "backend.settings", path = %normalize_path(&path), "Saved settings");

    // Update cache after successful write
    match lock_mutex(settings_cache()) {
        Ok(mut cache) => {
            *cache = Some(settings.clone());
        }
        Err(e) => {
            warn!(target: "backend.settings", error = %e, "Cannot update settings cache after save");
        }
    }
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
