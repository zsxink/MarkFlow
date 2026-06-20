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
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

static HAS_CLI_FILE: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn open_file_in_new_window(path: String, app: tauri::AppHandle) -> Result<(), String> {
    let label = format!(
        "window-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "Time error".to_string())?
            .as_millis()
    );

    let file_name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("MarkFlow")
        .to_string();

    if let Err(e) = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title(&file_name)
        .inner_size(900.0, 700.0)
        .build()
    {
        return Err(format!("Failed to create window: {}", e));
    }

    // After a short delay, emit the file path to the new window's frontend
    let app_handle = app.clone();
    let win_label = label.clone();
    let file_path = path.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        if let Some(w) = app_handle.get_webview_window(&win_label) {
            let _ = w.emit("open-file-in-window", &file_path);
        }
    });

    Ok(())
}

#[tauri::command]
fn add_recent_file(path: String) -> Result<(), String> {
    let mut s = settings::load_settings_inner();
    s.recent_files.retain(|p| p != &path);
    s.recent_files.insert(0, path);
    if s.recent_files.len() > 10 { s.recent_files.truncate(10); }
    settings::save_settings_inner(&s)
}

#[tauri::command]
fn add_recent_folder(path: String) -> Result<(), String> {
    let mut s = settings::load_settings_inner();
    s.recent_folders.retain(|p| p != &path);
    s.recent_folders.insert(0, path);
    if s.recent_folders.len() > 5 { s.recent_folders.truncate(5); }
    settings::save_settings_inner(&s)
}

#[tauri::command]
fn clear_recent_history() -> Result<(), String> {
    let mut s = settings::load_settings_inner();
    s.recent_files.clear();
    s.recent_folders.clear();
    settings::save_settings_inner(&s)
}

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

#[tauri::command]
fn has_cli_file() -> bool {
    HAS_CLI_FILE.load(Ordering::Relaxed)
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
            open_file_in_new_window,
            add_recent_file,
            add_recent_folder,
            clear_recent_history,
            set_workspace,
            get_workspace,
            has_cli_file,
        ])
        .setup(|app| {
            let settings = settings::load_settings_inner();

            // Check CLI args for file path (opened via file association)
            let cli_file: Option<PathBuf> = std::env::args().nth(1).map(PathBuf::from).filter(|p| p.is_file());

            if cli_file.is_some() {
                HAS_CLI_FILE.store(true, Ordering::Relaxed);
                tracing::info!(target: "backend.app", path = %cli_file.as_ref().unwrap().display(), "Opened via file association (single-file mode)");
            } else if let Some(last_ws) = settings.last_workspace {
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

            // Emit file path to frontend after a short delay to ensure it's ready
            if let Some(file_path) = cli_file {
                let app_handle = app.handle().clone();
                let path_str = file_path.to_string_lossy().to_string();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    let _ = app_handle.emit("open-file-from-cli", &path_str);
                    tracing::info!(target: "backend.app", "Emitted open-file-from-cli event");
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MarkFlow");
}
