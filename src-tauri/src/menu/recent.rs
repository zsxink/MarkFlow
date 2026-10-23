//! Recent-history submenus.
//!
//! Rebuilt only when the reported path list actually changed, so repeated state
//! syncs from the frontend do not churn native menu items.

use tauri::menu::{MenuItem, Submenu};
use tauri::Wry;

/// Replace the recent-history submenu entries with the reported paths.
pub(crate) fn rebuild_recent_submenu(
    submenu: &Submenu<Wry>,
    prefix: &str,
    paths: &[String],
) -> tauri::Result<()> {
    let expected: Vec<String> = dedup_paths(paths)
        .into_iter()
        .map(|path| format!("{prefix}{path}"))
        .collect();
    let current: Vec<String> = submenu
        .items()?
        .iter()
        .map(|item| item.id().as_ref().to_string())
        .collect();

    if current != expected {
        for existing in submenu.items()? {
            submenu.remove(&existing)?;
        }
        for id in &expected {
            let path = id.strip_prefix(prefix).unwrap_or(id);
            let menu_item = MenuItem::with_id(
                submenu.app_handle(),
                id.as_str(),
                recent_label(path),
                true,
                None::<&str>,
            )?;
            submenu.append(&menu_item)?;
        }
    }

    submenu.set_enabled(!expected.is_empty())
}

pub(crate) fn dedup_paths(paths: &[String]) -> Vec<&str> {
    let mut seen = std::collections::HashSet::new();
    paths
        .iter()
        .map(|path| path.as_str())
        .filter(|path| !path.is_empty() && seen.insert(*path))
        .collect()
}

/// Menu label for a recent path: the file/folder name, falling back to the path.
pub(crate) fn recent_label(path: &str) -> String {
    path.rsplit(['/', '\\'])
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or(path)
        .to_string()
}
