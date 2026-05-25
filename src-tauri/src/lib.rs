mod commands;
mod config;
mod fs;
mod logger;
mod paths;
mod state;

use commands::files;
use commands::settings;
use paths::normalize_path;
use state::AppState;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

#[tauri::command]
fn set_workspace(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let workspace = PathBuf::from(&path);
    if !workspace.is_dir() {
        tracing::warn!(target: "backend.workspace", path = %path, "Rejected non-directory workspace path");
        return Err("Workspace path is not a directory".into());
    }

    tracing::info!(target: "backend.workspace", path = %path, "Switching workspace");

    let app_handle = app.clone();
    state.set_workspace(workspace, move |event| {
        let _ = app_handle.emit("file-changed", &event);
    });

    let mut settings = settings::load_settings_inner();
    settings.last_workspace = Some(path.clone());
    if let Err(error) = settings::save_settings_inner(&settings) {
        tracing::warn!(target: "backend.workspace", path = %path, error = %error, "Failed to persist workspace setting");
    }

    tracing::info!(target: "backend.workspace", path = %path, "Workspace switched");
    Ok(())
}

#[tauri::command]
fn get_workspace(state: tauri::State<AppState>) -> Result<Option<String>, String> {
    Ok(state.get_workspace().map(|p| normalize_path(&p)))
}

pub fn run() {
    if let Err(error) = logger::init_logging() {
        eprintln!("Failed to initialize logger: {}", error);
    }
    tracing::info!(target: "backend.app", "Application starting");

    let app_state = AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            files::read_file,
            files::write_file,
            files::save_mermaid_svg_export,
            files::save_mermaid_png_export,
            files::save_image_export,
            files::read_dir_recursive,
            files::create_file,
            files::create_dir,
            files::rename_path,
            files::delete_path,
            files::copy_file,
            files::read_single_dir,
            files::file_exists,
            files::read_file_as_base64,
            files::write_file_from_base64,
            files::fetch_remote_image_as_base64,
            files::download_image,
            settings::load_settings,
            settings::save_settings,
            logger::log_frontend_event,
            set_workspace,
            get_workspace,
        ])
        .setup(|app| {
            let settings = settings::load_settings_inner();
            if let Some(last_ws) = settings.last_workspace {
                let path = PathBuf::from(&last_ws);
                if path.is_dir() {
                    let state = app.state::<AppState>();
                    let app_handle = app.handle().clone();
                    state.set_workspace(path, move |event| {
                        let _ = app_handle.emit("file-changed", &event);
                    });
                    tracing::info!(target: "backend.workspace", path = %last_ws, "Restored last workspace");
                } else {
                    tracing::warn!(target: "backend.workspace", path = %last_ws, "Skipped missing last workspace");
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MarkFlow");
}
