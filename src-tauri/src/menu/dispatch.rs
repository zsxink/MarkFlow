//! Menu activation routing.
//!
//! Rust owns no menu business logic: an activated id is forwarded to the
//! frontend dispatcher, which reuses the existing command implementations.

use tauri::{AppHandle, Emitter, Manager, WebviewWindow, Wry};

use super::native::MenuHandles;
use super::{MenuState, DEVTOOLS_ACTION, MENU_ACTION_EVENT};

/// Report frontend state so the native menu reflects what is available.
#[tauri::command]
pub fn update_menu_state(
    app: AppHandle,
    has_workspace: bool,
    has_document: bool,
    recent_files: Vec<String>,
    recent_folders: Vec<String>,
) -> Result<(), String> {
    let state = MenuState {
        has_workspace,
        has_document,
        recent_files,
        recent_folders,
    };
    app.state::<MenuHandles>().apply(&state).map_err(|error| {
        tracing::warn!(
            target: "backend.menu",
            error = %error,
            "Failed to update native menu state"
        );
        error.to_string()
    })
}

/// Handle a native menu event: forward the application action id to the
/// focused window's frontend dispatcher (the only Rust-side action is opening
/// devtools).
pub fn dispatch(app: &AppHandle, id: &str) {
    // Info, not debug: release builds only keep info and above, and whether a
    // menu activation arrived at all is the first question when a shortcut is
    // reported dead (issue #410 could not be settled from debug-only logs).
    // One line per user activation is cheap next to the frontend event log.
    tracing::info!(target: "backend.menu", action = %id, "Native menu action");
    let Some(window) = target_window(app) else {
        tracing::warn!(target: "backend.menu", action = %id, "No window to dispatch the menu action to");
        return;
    };
    if id == DEVTOOLS_ACTION {
        open_devtools(&window);
        return;
    }
    if let Err(error) = window.emit(MENU_ACTION_EVENT, id) {
        tracing::warn!(target: "backend.menu", action = %id, error = %error, "Failed to emit menu action");
    }
}

/// The menu is application-wide, so actions go to the focused window and fall
/// back to the main window (multi-window support).
fn target_window(app: &AppHandle) -> Option<WebviewWindow<Wry>> {
    let mut windows = app.webview_windows();
    if let Some(focused) = windows
        .values()
        .find(|window| window.is_focused().unwrap_or(false))
    {
        return Some(focused.clone());
    }
    windows
        .remove("main")
        .or_else(|| windows.into_values().next())
}

fn open_devtools(window: &WebviewWindow<Wry>) {
    // The project does not enable tauri's `devtools` feature, so the inspector
    // is only available in debug builds.
    #[cfg(debug_assertions)]
    window.open_devtools();
    #[cfg(not(debug_assertions))]
    {
        tracing::debug!(
            target: "backend.menu",
            "Developer tools are unavailable in this build"
        );
        let _ = window;
    }
}
