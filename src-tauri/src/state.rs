use crate::commands::settings::load_settings_inner;
use crate::error::{lock_mutex, AppError};
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
use tracing::{debug, error, warn};

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
    pub fn new() -> Result<Self, AppError> {
        let http_client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .read_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .pool_max_idle_per_host(4)
            .dns_resolver(Arc::new(ValidatingResolver))
            .build()
            .map_err(|e| AppError::internal(format!("Failed to build HTTP client: {}", e)))?;

        Ok(Self {
            workspace_root: Mutex::new(None),
            watcher: Mutex::new(None),
            pending_file: Mutex::new(HashMap::new()),
            cli_file: Mutex::new(None),
            initial_file_handled: AtomicBool::new(false),
            close_allowed: Arc::new(AtomicBool::new(false)),
            image_download_semaphore: Semaphore::new(4),
            http_client,
            http_semaphore: Semaphore::new(3),
        })
    }

    pub fn set_workspace(
        &self,
        path: PathBuf,
        event_handler: impl Fn(Vec<FileChangeEvent>) + Send + 'static,
    ) {
        let path_display = normalize_path(&path);

        // Narrow the lock scope: stop the previous watcher first, then start a
        // new one without holding the lock across the (potentially slow) setup.
        {
            let mut watcher = lock_mutex(&self.watcher).expect("watcher mutex poisoned");
            if let Some(mut previous) = watcher.take() {
                previous.stop();
                debug!(target: "backend.watcher", path = %path_display, "Replaced previous workspace watcher");
            }
        }

        let settings = load_settings_inner();
        let matcher = matcher_snapshot(&settings.file_tree_ignore_patterns);
        match FileWatcher::new(path.clone(), matcher, event_handler) {
            Ok(w) => {
                let mut watcher = lock_mutex(&self.watcher).expect("watcher mutex poisoned");
                *watcher = Some(w);
                debug!(target: "backend.watcher", path = %path_display, "Workspace watcher ready");
            }
            Err(error) => {
                error!(target: "backend.watcher", path = %path_display, error = %error, "Failed to start workspace watcher");
            }
        }

        let mut root = lock_mutex(&self.workspace_root).expect("workspace_root mutex poisoned");
        *root = Some(path);
    }

    pub fn get_workspace(&self) -> Option<PathBuf> {
        lock_mutex(&self.workspace_root)
            .expect("workspace_root mutex poisoned")
            .clone()
    }

    /// Stop all background tasks (watcher) so the process can exit cleanly.
    /// Safe to call multiple times.
    pub fn stop_all(&self) {
        let mut watcher = match lock_mutex(&self.watcher) {
            Ok(g) => g,
            Err(e) => {
                warn!(target: "backend.lifecycle", error = %e, "Skipping watcher stop due to poisoned lock");
                return;
            }
        };
        if let Some(mut active) = watcher.take() {
            active.stop();
            debug!(target: "backend.lifecycle", "Stopped workspace watcher on shutdown");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_workspace_switches_without_leaking_watcher_thread() {
        let state = AppState::new().unwrap();
        let dir_a = std::env::temp_dir().join(format!("markflow-ws-a-{}", std::process::id()));
        let dir_b = std::env::temp_dir().join(format!("markflow-ws-b-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir_a);
        let _ = std::fs::create_dir_all(&dir_b);

        state.set_workspace(dir_a.clone(), |_event| {});
        state.set_workspace(dir_b.clone(), |_event| {});
        // Switching again must not panic and must leave exactly one active watcher.
        state.set_workspace(dir_a.clone(), |_event| {});

        assert_eq!(state.get_workspace(), Some(dir_a.clone()));

        state.stop_all();
        let _ = std::fs::remove_dir_all(&dir_a);
        let _ = std::fs::remove_dir_all(&dir_b);
    }

    #[test]
    fn stop_all_is_safe_to_call_repeatedly() {
        let state = AppState::new().unwrap();
        state.stop_all();
        state.stop_all();
    }
}
