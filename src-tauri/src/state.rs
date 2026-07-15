use crate::commands::settings::load_settings_inner;
use crate::fs::ignore::matcher_snapshot;
use crate::fs::watcher::{FileChangeEvent, FileWatcher};
use crate::http::ValidatingResolver;
use crate::paths::normalize_path;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::Duration;
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
    /// Shared HTTP client with configured timeouts and connection pooling.
    pub http_client: reqwest::Client,
    /// Limits concurrent outbound HTTP requests (default: 3).
    pub http_semaphore: Semaphore,
}

impl AppState {
    pub fn new() -> Self {
        let http_client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .read_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .pool_max_idle_per_host(4)
            .dns_resolver(Arc::new(ValidatingResolver))
            .build()
            .expect("Failed to build HTTP client");

        Self {
            workspace_root: Mutex::new(None),
            watcher: Mutex::new(None),
            pending_file: Mutex::new(HashMap::new()),
            cli_file: Mutex::new(None),
            initial_file_handled: AtomicBool::new(false),
            close_allowed: Arc::new(AtomicBool::new(false)),
            image_download_semaphore: Semaphore::new(4),
            http_client,
            http_semaphore: Semaphore::new(3),
        }
    }

    pub fn set_workspace(
        &self,
        path: PathBuf,
        event_handler: impl Fn(Vec<FileChangeEvent>) + Send + 'static,
    ) {
        let path_display = normalize_path(&path);

        let mut watcher = self.watcher.lock().unwrap();
        if watcher.take().is_some() {
            debug!(target: "backend.watcher", path = %path_display, "Replaced previous workspace watcher");
        }

        let settings = load_settings_inner();
        let matcher = matcher_snapshot(&settings.file_tree_ignore_patterns);
        match FileWatcher::new(path.clone(), matcher, event_handler) {
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
