use crate::fs::watcher::{FileChangeEvent, FileWatcher};
use std::path::PathBuf;
use std::sync::Mutex;

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
        // Stop previous watcher by dropping it
        let mut watcher = self.watcher.lock().unwrap();
        *watcher = None;

        // Start new watcher
        match FileWatcher::new(path.clone(), event_handler) {
            Ok(w) => {
                *watcher = Some(w);
            }
            Err(e) => {
                eprintln!("Failed to start file watcher: {}", e);
            }
        }

        let mut root = self.workspace_root.lock().unwrap();
        *root = Some(path);
    }

    pub fn get_workspace(&self) -> Option<PathBuf> {
        self.workspace_root.lock().unwrap().clone()
    }
}
