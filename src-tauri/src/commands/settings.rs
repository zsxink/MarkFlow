use crate::config::settings::Settings;
use crate::commands::files::atomic_write;
use crate::paths::{normalize_path, settings_path};
use std::fs;
use std::sync::Mutex;
use tracing::{debug, warn};

fn settings_cache() -> &'static Mutex<Option<Settings>> {
    static CACHE: Mutex<Option<Settings>> = Mutex::new(None);
    &CACHE
}

pub fn load_settings_inner() -> Settings {
    // Return cached settings if available
    {
        let cache = settings_cache().lock().unwrap();
        if let Some(ref cached) = *cache {
            return cached.clone();
        }
    }

    let path = settings_path();
    if !path.exists() {
        debug!(target: "backend.settings", path = %normalize_path(&path), "Settings file not found, using defaults");
        let settings = Settings::default();
        settings_cache().lock().unwrap().replace(settings.clone());
        return settings;
    }
    let settings = match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(s) => s,
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
    settings_cache().lock().unwrap().replace(settings.clone());
    settings
}

pub fn save_settings_inner(settings: &Settings) -> Result<(), String> {
    let path = settings_path();
    let content =
        serde_json::to_string_pretty(settings).map_err(|e| format!("Failed to serialize: {}", e))?;
    atomic_write(&path, &content)?;
    debug!(target: "backend.settings", path = %normalize_path(&path), "Saved settings");

    // Update cache after successful write
    settings_cache().lock().unwrap().replace(settings.clone());
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
