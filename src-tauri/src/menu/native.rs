//! Turning the menu description into Tauri menu items.
//!
//! Every `set_enabled` is a blocking main-thread round-trip, so the handles
//! remember the last applied payload and skip redundant work.

use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Wry};

use std::sync::Mutex;

use super::recent::rebuild_recent_submenu;
use super::{
    current_platform, enabled_for, menu_specs, Entry, MenuState, Native, Requires,
    RECENT_FILES_TITLE, RECENT_FILE_PREFIX, RECENT_FOLDERS_TITLE, RECENT_FOLDER_PREFIX,
};

/// Handles of the items whose enabled state follows the reported app state.
#[derive(Default)]
pub struct MenuHandles {
    pub(crate) items: Vec<(Requires, MenuItem<Wry>)>,
    pub(crate) submenus: Vec<(Requires, Submenu<Wry>)>,
    pub(crate) recent_files: Option<Submenu<Wry>>,
    pub(crate) recent_folders: Option<Submenu<Wry>>,
    /// Last applied payload. Every `set_enabled` is a blocking main-thread
    /// round-trip, so an unchanged payload must not touch ~40 items again.
    pub(crate) last_applied: Mutex<Option<MenuState>>,
}

impl MenuHandles {
    /// Apply a state payload to every state-dependent item.
    pub fn apply(&self, state: &MenuState) -> tauri::Result<()> {
        {
            let mut last = self
                .last_applied
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if last.as_ref() == Some(state) {
                return Ok(());
            }
            *last = Some(state.clone());
        }
        for (requires, item) in &self.items {
            item.set_enabled(enabled_for(*requires, state))?;
        }
        for (requires, submenu) in &self.submenus {
            submenu.set_enabled(enabled_for(*requires, state))?;
        }
        if let Some(submenu) = &self.recent_files {
            rebuild_recent_submenu(submenu, RECENT_FILE_PREFIX, &state.recent_files)?;
        }
        if let Some(submenu) = &self.recent_folders {
            rebuild_recent_submenu(submenu, RECENT_FOLDER_PREFIX, &state.recent_folders)?;
        }
        Ok(())
    }

    fn track(&mut self, requires: Requires, item: MenuItem<Wry>) {
        if requires != Requires::Always {
            self.items.push((requires, item));
        }
    }

    fn track_submenu(&mut self, requires: Requires, submenu: Submenu<Wry>) {
        if requires != Requires::Always {
            self.submenus.push((requires, submenu));
        }
    }
}

pub(crate) fn native_item(
    app: &AppHandle,
    kind: Native,
    label: &'static str,
) -> tauri::Result<PredefinedMenuItem<Wry>> {
    let text = Some(label);
    match kind {
        // Windows/Linux render the about dialog from the metadata; macOS uses
        // the bundle's own about panel.
        Native::About => PredefinedMenuItem::about(
            app,
            text,
            Some(
                tauri::menu::AboutMetadataBuilder::new()
                    .name(Some("MarkFlow"))
                    .version(Some(env!("CARGO_PKG_VERSION")))
                    .comments(Some("所见即所得 Markdown 编辑器"))
                    .build(),
            ),
        ),
        Native::Services => PredefinedMenuItem::services(app, text),
        Native::Hide => PredefinedMenuItem::hide(app, text),
        Native::HideOthers => PredefinedMenuItem::hide_others(app, text),
        Native::ShowAll => PredefinedMenuItem::show_all(app, text),
        Native::Quit => PredefinedMenuItem::quit(app, text),
        Native::Undo => PredefinedMenuItem::undo(app, text),
        Native::Redo => PredefinedMenuItem::redo(app, text),
        Native::Cut => PredefinedMenuItem::cut(app, text),
        Native::Copy => PredefinedMenuItem::copy(app, text),
        Native::Paste => PredefinedMenuItem::paste(app, text),
        Native::SelectAll => PredefinedMenuItem::select_all(app, text),
        Native::Minimize => PredefinedMenuItem::minimize(app, text),
        Native::Maximize => PredefinedMenuItem::maximize(app, text),
        Native::Fullscreen => PredefinedMenuItem::fullscreen(app, text),
    }
}

/// Build the native menu bar and the handles needed for state updates.
pub fn build(app: &AppHandle) -> tauri::Result<(Menu<Wry>, MenuHandles)> {
    let mut handles = MenuHandles::default();
    let mut roots: Vec<Box<dyn IsMenuItem<Wry>>> = Vec::new();

    for spec in menu_specs(current_platform()) {
        roots.push(Box::new(build_submenu(
            app,
            spec.title,
            &spec.entries,
            &mut handles,
        )?));
    }

    let refs: Vec<&dyn IsMenuItem<Wry>> = roots.iter().map(|item| item.as_ref()).collect();
    let menu = Menu::with_items(app, &refs)?;
    Ok((menu, handles))
}

pub(crate) fn build_submenu(
    app: &AppHandle,
    title: &str,
    entries: &[Entry],
    handles: &mut MenuHandles,
) -> tauri::Result<Submenu<Wry>> {
    // State-dependent items start disabled and are enabled by the first
    // `update_menu_state` call, so an unknown state can never expose an
    // action that would fail.
    let initial = MenuState::default();
    let mut built: Vec<Box<dyn IsMenuItem<Wry>>> = Vec::new();

    for entry in entries {
        match entry {
            Entry::Item {
                id,
                label,
                accelerator,
                requires,
            } => {
                let menu_item = MenuItem::with_id(
                    app,
                    *id,
                    *label,
                    enabled_for(*requires, &initial),
                    *accelerator,
                )?;
                handles.track(*requires, menu_item.clone());
                built.push(Box::new(menu_item));
            }
            Entry::System { kind, label } => {
                built.push(Box::new(native_item(app, *kind, label)?));
            }
            Entry::Submenu {
                title,
                requires,
                entries,
            } => {
                let submenu = build_submenu(app, title, entries, handles)?;
                submenu.set_enabled(enabled_for(*requires, &initial))?;
                handles.track_submenu(*requires, submenu.clone());
                built.push(Box::new(submenu));
            }
            Entry::RecentFiles => {
                let submenu = Submenu::with_items(app, RECENT_FILES_TITLE, false, &[])?;
                handles.recent_files = Some(submenu.clone());
                built.push(Box::new(submenu));
            }
            Entry::RecentFolders => {
                let submenu = Submenu::with_items(app, RECENT_FOLDERS_TITLE, false, &[])?;
                handles.recent_folders = Some(submenu.clone());
                built.push(Box::new(submenu));
            }
            Entry::Separator => {
                built.push(Box::new(PredefinedMenuItem::separator(app)?));
            }
        }
    }

    let refs: Vec<&dyn IsMenuItem<Wry>> = built.iter().map(|item| item.as_ref()).collect();
    Submenu::with_items(app, title, true, &refs)
}
