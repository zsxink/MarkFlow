mod commands;
mod config;
mod fs;
mod state;

use commands::files;
use commands::settings;
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
        return Err("Workspace path is not a directory".into());
    }

    let app_handle = app.clone();
    state.set_workspace(workspace, move |event| {
        let _ = app_handle.emit("file-changed", &event);
    });

    // Persist to settings
    let mut settings = settings::load_settings_inner();
    settings.last_workspace = Some(path);
    let _ = settings::save_settings_inner(&settings);

    Ok(())
}

#[tauri::command]
fn get_workspace(state: tauri::State<AppState>) -> Result<Option<String>, String> {
    Ok(state.get_workspace().map(|p| {
        let s = p.to_string_lossy().to_string();
        // Strip Windows \\?\ prefix and normalize to /
        let s = if s.starts_with(r"\\?\") { &s[4..] } else { &s };
        s.replace('\\', "/")
    }))
}

pub fn run() {
    let app_state = AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            files::read_file,
            files::write_file,
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
            files::download_image,
            settings::load_settings,
            settings::save_settings,
            set_workspace,
            get_workspace,
        ])
        .setup(|app| {
            // Restore last workspace on startup
            let settings = settings::load_settings_inner();
            if let Some(last_ws) = settings.last_workspace {
                let path = PathBuf::from(&last_ws);
                if path.is_dir() {
                    let state = app.state::<AppState>();
                    let app_handle = app.handle().clone();
                    state.set_workspace(path, move |event| {
                        let _ = app_handle.emit("file-changed", &event);
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MarkFlow");
}
