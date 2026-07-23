mod commands;
mod config;
mod error;
mod fs;
mod http;
mod logger;
mod paths;
mod state;

use commands::files;
use commands::files_image;
use commands::files_meta;
use commands::files_pagination;
use commands::settings;
use error::AppError;
use paths::normalize_path;
use state::AppState;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use tauri::EventTarget;
use tauri::RunEvent;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_single_instance::init as single_instance_init;

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

    // Determine window size and position by examining existing windows
    let saved = settings::load_settings_inner();
    let windows = app.webview_windows();

    // Used to check if a window fills the screen
    let monitor: Option<tauri::Monitor> = app.primary_monitor().unwrap_or_default();

    let (win_w, win_h, pos_x, pos_y) = if windows.is_empty() {
        (
            saved.last_window_width,
            saved.last_window_height,
            saved.last_window_x,
            saved.last_window_y,
        )
    } else {
        // Check screen bounds using a standalone variable (avoid capture issues)
        let can_offset = monitor.as_ref().is_some();
        let mon_size = monitor.as_ref().map(|m| m.size());

        let ref_window = windows.values().find(|w| {
            if w.is_maximized().unwrap_or(false) {
                return false;
            }
            if let (Ok(_pos), Ok(size)) = (w.outer_position(), w.outer_size()) {
                if let Some(ms) = mon_size {
                    if size.width as i32 >= ms.width as i32 - 20
                        && size.height as i32 >= ms.height as i32 - 20
                    {
                        return false;
                    }
                }
            }
            true
        });
        if let Some(w) = ref_window {
            if let (Ok(pos), Ok(size)) = (w.outer_position(), w.outer_size()) {
                let new_x = (pos.x + 80) as f64;
                let new_y = (pos.y + 80) as f64;
                if can_offset {
                    if let Some(ms) = mon_size {
                        if (new_x as i32) < ms.width as i32 && (new_y as i32) < ms.height as i32 {
                            (size.width as f64, size.height as f64, new_x, new_y)
                        } else {
                            (
                                saved.last_window_width,
                                saved.last_window_height,
                                saved.last_window_x,
                                saved.last_window_y,
                            )
                        }
                    } else {
                        (size.width as f64, size.height as f64, new_x, new_y)
                    }
                } else {
                    (size.width as f64, size.height as f64, new_x, new_y)
                }
            } else {
                (
                    saved.last_window_width,
                    saved.last_window_height,
                    saved.last_window_x,
                    saved.last_window_y,
                )
            }
        } else {
            (
                saved.last_window_width,
                saved.last_window_height,
                saved.last_window_x,
                saved.last_window_y,
            )
        }
    };

    let window_result =
        WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
            .title(&file_name)
            .inner_size(win_w, win_h)
            .position(pos_x, pos_y)
            .build();

    let window = match window_result {
        Ok(w) => w,
        Err(e) => return Err(format!("Failed to create window: {}", e)),
    };

    intercept_close_request(&window, app.state::<AppState>().close_permissions.clone());

    // Store pending file path for the new window's frontend to pull
    {
        let state = app.state::<AppState>();
        let mut pending = error::lock_mutex(&state.pending_file).map_err(|e| e.to_string())?;
        pending.insert(label.clone(), path.clone());
    }

    Ok(())
}

#[tauri::command]
fn take_pending_file(window_label: String, state: tauri::State<AppState>) -> Option<String> {
    let mut pending = match error::lock_mutex(&state.pending_file) {
        Ok(g) => g,
        Err(e) => {
            tracing::warn!(target: "backend.commands", error = %e, "Skipping take_pending_file due to poisoned lock");
            return None;
        }
    };
    pending.remove(&window_label)
}

#[tauri::command]
fn take_cli_file(state: tauri::State<AppState>) -> Option<String> {
    let mut cli_file = match error::lock_mutex(&state.cli_file) {
        Ok(g) => g,
        Err(e) => {
            tracing::warn!(target: "backend.commands", error = %e, "Skipping take_cli_file due to poisoned lock");
            return None;
        }
    };
    cli_file.take()
}

#[tauri::command]
fn mark_initial_file_handled(state: tauri::State<AppState>) -> Result<(), String> {
    state.initial_file_handled.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn save_last_window_state(x: f64, y: f64, width: f64, height: f64) -> Result<(), AppError> {
    let mut s = settings::load_settings_inner();
    s.last_window_x = x;
    s.last_window_y = y;
    s.last_window_width = width;
    s.last_window_height = height;
    settings::save_settings_inner(&s)
}

/// Register close-request interception on a WebviewWindow.
/// Uses a per-window permission pattern to avoid macOS CloseRequested one-shot behavior:
///   1st close → no permission → prevent_close + emit "close-requested" to this window only
///   2nd close → permission granted → consume and let it through
fn intercept_close_request(
    window: &tauri::WebviewWindow,
    close_permissions: std::sync::Arc<std::sync::Mutex<std::collections::HashSet<String>>>,
) {
    let w = window.clone();
    let label = window.label().to_string();
    window.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // Try to consume this window's close permission
                let has_permission = error::lock_mutex(&close_permissions)
                    .map(|mut perms| perms.remove(&label))
                    .unwrap_or(false);
                if has_permission {
                    tracing::debug!(target: "backend.close", label = %label, "Close permission consumed, allowing close");
                    return;
                }
                api.prevent_close();
                tracing::debug!(target: "backend.close", label = %label, "Close intercepted, emitting close-requested");
                let _ = w.emit_to(
                    EventTarget::WebviewWindow { label: label.clone() },
                    "close-requested",
                    serde_json::json!({ "windowLabel": label }),
                );
            }
            tauri::WindowEvent::Destroyed => {
                // Clean up any stale close permission for this window
                if let Ok(mut perms) = error::lock_mutex(&close_permissions) {
                    perms.remove(&label);
                }
                tracing::debug!(target: "backend.close", label = %label, "Cleaned up close permission on window destroy");
            }
            _ => {}
        }
    });
}

#[tauri::command]
fn confirm_window_close(
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let label = window.label();
    state.grant_close_permission(label);
    tracing::debug!(target: "backend.close", label = %label, "Close permission granted");
    let _ = window.close(); // triggers CloseRequested again, but permission is now granted → let it through
    Ok(())
}

#[tauri::command]
fn add_recent_file(path: String) -> Result<(), AppError> {
    let mut s = settings::load_settings_inner();
    s.recent_files.retain(|p| p != &path);
    s.recent_files.insert(0, path);
    if s.recent_files.len() > 10 {
        s.recent_files.truncate(10);
    }
    settings::save_settings_inner(&s)
}

#[tauri::command]
fn add_recent_folder(path: String) -> Result<(), AppError> {
    let mut s = settings::load_settings_inner();
    s.recent_folders.retain(|p| p != &path);
    s.recent_folders.insert(0, path);
    if s.recent_folders.len() > 5 {
        s.recent_folders.truncate(5);
    }
    settings::save_settings_inner(&s)
}

#[tauri::command]
fn clear_recent_history() -> Result<(), AppError> {
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
) -> Result<(), AppError> {
    let workspace = PathBuf::from(&path);
    if !workspace.is_dir() {
        tracing::warn!(target: "backend.workspace", path = %path, "Rejected non-directory workspace path");
        return Err(AppError::workspace_invalid(
            "Workspace path is not a directory",
        ));
    }

    // Clean up stale temp files in the workspace
    files::cleanup_stale_temp_files(&workspace);

    tracing::info!(target: "backend.workspace", path = %path, "Switching workspace");

    let app_handle = app.clone();
    state.set_workspace(workspace, move |events| {
        // Emit is best-effort: if the frontend receiver is gone, log and skip
        // rather than propagating a panic into the watcher thread.
        if let Err(error) = app_handle.emit("file-tree-events", &events) {
            tracing::warn!(target: "backend.workspace", error = %error, "Failed to emit file-tree-events event (receiver closed)");
        }
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
fn get_workspace(state: tauri::State<AppState>) -> Result<Option<String>, AppError> {
    Ok(state.get_workspace().map(|p| normalize_path(&p)))
}

pub fn run() {
    if let Err(error) = logger::init_logging() {
        eprintln!("Failed to initialize logger: {}", error);
    }
    tracing::info!(target: "backend.app", "Application starting");

    let app_state = match AppState::new() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Fatal: {}", e);
            std::process::exit(1);
        }
    };

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(single_instance_init(|app, args, _cwd| {
            if let Some(file) = args.get(1) {
                let path = std::path::Path::new(file);
                if path.is_file() {
                    let path_str = path.to_string_lossy().to_string();
                    tracing::info!(target: "backend.app", path = %path_str, "File opened via single-instance plugin");
                    let _ = open_file_in_new_window(path_str, app.clone());
                }
            }
        }));

    #[cfg(feature = "e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    let app = builder
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::export::print_webview,
            commands::export::write_file_binary,
            commands::export::save_binary_export,
            files::read_file,
            files::file_metadata,
            files::write_file,
            files::save_mermaid_svg_export,
            files::save_mermaid_png_export,
            files::save_plantuml_svg_export,
            files::save_plantuml_png_export,
            files::save_image_export,
            files::save_document_export,
            files_pagination::read_dir,
            files::read_path_entry,
            files::create_file,
            files::create_dir,
            files::rename_path,
            files::delete_path,
            files::copy_file,
            files::read_single_dir,
            files::file_exists,
            files::get_file_stats,
            files::read_file_as_base64,
            files::write_file_from_base64,
            files_image::write_image_to_storage,
            files_image::copy_image_to_storage,
            files_image::authorize_image_storage,
            files_image::write_pending_image,
            files_image::copy_image_to_pending,
            files_image::download_image_to_pending,
            files_image::migrate_pending_images,
            files_image::cleanup_pending_images,
            files_image::cleanup_expired_pending_images,
            files_image::fetch_remote_image_as_base64,
            files_meta::fetch_page_title,
            files_image::download_image,
            files_image::download_image_to_storage,
            confirm_window_close,
            settings::load_settings,
            settings::save_settings,
            logger::log_frontend_event,
            open_file_in_new_window,
            take_pending_file,
            take_cli_file,
            mark_initial_file_handled,
            save_last_window_state,
            add_recent_file,
            add_recent_folder,
            clear_recent_history,
            set_workspace,
            get_workspace,
        ])
        .setup(|app| {
            let settings = settings::load_settings_inner();

            // Clean up stale temp files from previous crashed writes
            files::cleanup_stale_temp_files(&paths::app_config_dir());
            files_image::cleanup_expired_pending_images_on_startup();

            let cli_file: Option<PathBuf> = std::env::args().nth(1).map(PathBuf::from).filter(|p| p.is_file());

            if let Some(file_path) = cli_file {
                tracing::info!(target: "backend.app", path = %file_path.display(), "Opened via file association (single-file mode)");
                let state = app.state::<AppState>();
                let mut cli_file_lock = error::lock_mutex(&state.cli_file)?;
                *cli_file_lock = Some(file_path.to_string_lossy().to_string());
            } else if let Some(last_ws) = settings.last_workspace {
                let path = PathBuf::from(&last_ws);
                if path.is_dir() {
                    let state = app.state::<AppState>();
                    let app_handle = app.handle().clone();
                    state.set_workspace(path, move |events| {
                        let _ = app_handle.emit("file-tree-events", &events);
                    });
                    tracing::info!(target: "backend.workspace", path = %last_ws, "Restored last workspace");
                } else {
                    tracing::warn!(target: "backend.workspace", path = %last_ws, "Skipped missing last workspace");
                }
            }

            // Intercept close requests on all windows — emit to frontend for dirty check
            let close_permissions = app.state::<AppState>().close_permissions.clone();
            for (_, window) in app.webview_windows() {
                intercept_close_request(&window, close_permissions.clone());
            }

            // Window destruction cleanup is handled inside intercept_close_request

            Ok(())
        })
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Fatal: failed to build MarkFlow: {}", e);
            std::process::exit(1);
        });

    app.run(|_app_handle, _event| {
        #[cfg(target_os = "macos")]
        if let RunEvent::Opened { urls } = &_event {
            for url in urls {
                let path_str = match url.to_file_path() {
                    Ok(path) => path.to_string_lossy().to_string(),
                    Err(_) => {
                        tracing::warn!(target: "backend.app", url = %url, "Failed to convert URL to file path");
                        continue;
                    }
                };

                let state = _app_handle.state::<AppState>();

                if !state.initial_file_handled.load(Ordering::SeqCst) {
                    tracing::info!(target: "backend.app", path = %path_str, "First RunEvent::Opened — storing to cli_file");
                    let mut cli_file_lock = match error::lock_mutex(&state.cli_file) {
                        Ok(g) => g,
                        Err(e) => {
                            tracing::warn!(target: "backend.app", error = %e, "Skipping RunEvent::Opened cli_file lock");
                            continue;
                        }
                    };
                    *cli_file_lock = Some(path_str);
                } else {
                    tracing::info!(target: "backend.app", path = %path_str, "File opened via RunEvent::Opened (new window)");
                    let _ = open_file_in_new_window(path_str, _app_handle.clone());
                }
            }
        }

        // Stop background tasks (watcher) on exit so the process terminates
        // without leaking threads, even if network/file tasks are still in flight.
        if let RunEvent::Exit = _event {
            _app_handle.state::<AppState>().stop_all();
            tracing::info!(target: "backend.app", "Application exiting — background tasks stopped");
        }
    });
}
