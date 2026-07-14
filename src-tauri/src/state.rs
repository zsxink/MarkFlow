use crate::fs::watcher::{FileChangeEvent, FileWatcher};
use crate::paths::normalize_path;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tokio::sync::Semaphore;
use tracing::{debug, error};

pub struct AppState {
    pub workspace_root: Mutex<Option<PathBuf>>,
    watcher: Mutex<Option<FileWatcher>>,
    pub pending_file: Mutex<HashMap<String, String>>,
    pub cli_file: Mutex<Option<String>>,
    pub initial_file_handled: AtomicBool,
    pub close_allowed: Arc<AtomicBool>,
    pub image_download_semaphore: Semaphore,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            workspace_root: Mutex::new(None),
            watcher: Mutex::new(None),
            pending_file: Mutex::new(HashMap::new()),
            cli_file: Mutex::new(None),
            initial_file_handled: AtomicBool::new(false),
            close_allowed: Arc::new(AtomicBool::new(false)),
            image_download_semaphore: Semaphore::new(4),
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
