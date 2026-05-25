use crate::fs::watcher::{FileChangeEvent, FileWatcher};
use crate::paths::normalize_path;
use std::path::PathBuf;
use std::sync::Mutex;
use tracing::{debug, error};

pub struct AppState {
    pub workspace_root: Mutex<Option<PathBuf>>,
    watcher: Mutex<Option<FileWatcher>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            workspace_root: Mutex::new(None),
            watcher: Mutex::new(None),
        }
    }

    pub fn set_workspace(&self, path: PathBuf, event_handler: impl Fn(FileChangeEvent) + Send + 'static) {
        let path_display = normalize_path(&path);

        let mut watcher = self.watcher.lock().unwrap();
        if watcher.take().is_some() {
            debug!(target: "backend.watcher", path = %path_display, "Replaced previous workspace watcher");
        }

        match FileWatcher::new(path.clone(), event_handler) {
            Ok(w) => {
                *watcher = Some(w);
                debug!(target: "backend.watcher", path = %path_display, "Workspace watcher ready");
            }
            Err(error) => {
                error!(target: "backend.watcher", path = %path_display, error = %error, "Failed to start workspace watcher");
            }
        }

        let mut root = self.workspace_root.lock().unwrap();
        *root = Some(path);
    }

    pub fn get_workspace(&self) -> Option<PathBuf> {
        self.workspace_root.lock().unwrap().clone()
    }
}
