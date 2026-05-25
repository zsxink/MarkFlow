use crate::config::settings::Settings;
use crate::paths::{normalize_path, settings_path};
use std::fs;
use tracing::{debug, warn};

pub fn load_settings_inner() -> Settings {
    let path = settings_path();
    if !path.exists() {
        debug!(target: "backend.settings", path = %normalize_path(&path), "Settings file not found, using defaults");
        return Settings::default();
    }
    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str(&content) {
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
    }
}

pub fn save_settings_inner(settings: &Settings) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    let content =
        serde_json::to_string_pretty(settings).map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write settings: {}", e))?;
    debug!(target: "backend.settings", path = %normalize_path(&path), "Saved settings");
    Ok(())
}

#[tauri::command]
pub fn load_settings() -> Result<Settings, String> {
    Ok(load_settings_inner())
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<(), String> {
    save_settings_inner(&settings)
}
