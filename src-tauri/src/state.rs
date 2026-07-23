use crate::commands::settings::load_settings_inner;
use crate::error::{lock_mutex, AppError};
use crate::fs::ignore::matcher_snapshot;
use crate::fs::watcher::{FileChangeEvent, FileWatcher};
use crate::http::ValidatingResolver;
use crate::paths::normalize_path;
use std::collections::{HashMap, HashSet};
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
    /// Per-window close permissions keyed by window label.
    /// A label is present only between `confirm_window_close` and the
    /// subsequent `CloseRequested` event that consumes it.
    pub close_permissions: Arc<Mutex<HashSet<String>>>,
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
            close_permissions: Arc::new(Mutex::new(HashSet::new())),
            image_download_semaphore: Semaphore::new(4),
            http_client,
            http_semaphore: Semaphore::new(3),
        })
    }

    /// Grant close permission for a specific window (called by `confirm_window_close`).
    pub fn grant_close_permission(&self, label: &str) {
        if let Ok(mut perms) = lock_mutex(&self.close_permissions) {
            perms.insert(label.to_string());
        }
    }

    /// Consume (and remove) the close permission for a specific window.
    /// Returns `true` if the permission existed and was consumed.
    pub fn consume_close_permission(&self, label: &str) -> bool {
        lock_mutex(&self.close_permissions)
            .map(|mut perms| perms.remove(label))
            .unwrap_or(false)
    }

    /// Remove any stale close permission for a window that was destroyed.
    pub fn cleanup_close_permission(&self, label: &str) {
        if let Ok(mut perms) = lock_mutex(&self.close_permissions) {
            perms.remove(label);
        }
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
            let mut watcher = match lock_mutex(&self.watcher) {
                Ok(g) => g,
                Err(e) => {
                    warn!(target: "backend.watcher", error = %e, "Cannot stop previous watcher: lock poisoned");
                    return;
                }
            };
            if let Some(mut previous) = watcher.take() {
                previous.stop();
                debug!(target: "backend.watcher", path = %path_display, "Replaced previous workspace watcher");
            }
        }

        let settings = load_settings_inner();
        let matcher = matcher_snapshot(&settings.file_tree_ignore_patterns);
        match FileWatcher::new(path.clone(), matcher, event_handler) {
            Ok(w) => match lock_mutex(&self.watcher) {
                Ok(mut watcher) => {
                    *watcher = Some(w);
                    debug!(target: "backend.watcher", path = %path_display, "Workspace watcher ready");
                }
                Err(e) => {
                    warn!(target: "backend.watcher", error = %e, "Cannot store workspace watcher: lock poisoned");
                }
            },
            Err(error) => {
                error!(target: "backend.watcher", path = %path_display, error = %error, "Failed to start workspace watcher");
            }
        }

        match lock_mutex(&self.workspace_root) {
            Ok(mut root) => {
                *root = Some(path);
            }
            Err(e) => {
                warn!(target: "backend.watcher", error = %e, "Cannot set workspace root: lock poisoned");
            }
        }
    }

    pub fn get_workspace(&self) -> Option<PathBuf> {
        lock_mutex(&self.workspace_root)
            .ok()
            .and_then(|guard| guard.clone())
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

    // --- Per-window close permission tests ---

    #[test]
    fn grant_for_window_a_does_not_grant_for_window_b() {
        let state = AppState::new().unwrap();
        state.grant_close_permission("window-a");
        // window-a has permission
        assert!(state.consume_close_permission("window-a"));
        // window-b must NOT have permission
        assert!(!state.consume_close_permission("window-b"));
    }

    #[test]
    fn consumed_permission_is_removed_and_cannot_be_consumed_again() {
        let state = AppState::new().unwrap();
        state.grant_close_permission("main-1");
        assert!(state.consume_close_permission("main-1"));
        // Second consume must return false (already consumed)
        assert!(!state.consume_close_permission("main-1"));
    }

    #[test]
    fn cleanup_removes_correct_label_without_affecting_others() {
        let state = AppState::new().unwrap();
        state.grant_close_permission("window-a");
        state.grant_close_permission("window-b");

        state.cleanup_close_permission("window-a");

        // window-a cleaned up
        assert!(!state.consume_close_permission("window-a"));
        // window-b still present
        assert!(state.consume_close_permission("window-b"));
    }
}
