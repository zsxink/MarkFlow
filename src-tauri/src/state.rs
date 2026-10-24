use crate::commands::settings::load_settings_inner;
use crate::config::settings::Settings;
use crate::error::{lock_mutex, AppError};
use crate::fs::ignore::matcher_snapshot;
use crate::fs::watcher::{FileChangeEvent, FileWatcher};
use crate::http::ValidatingResolver;
use crate::paths::normalize_path;
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::Semaphore;
use tracing::{debug, error, warn};

pub struct AppState {
    pub workspace_root: Mutex<Option<PathBuf>>,
    watcher: Mutex<Option<FileWatcher>>,
    pub pending_file: Mutex<HashMap<String, String>>,
    pub cli_files: Mutex<VecDeque<String>>,
    ready_windows: Mutex<HashSet<String>>,
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
            cli_files: Mutex::new(VecDeque::new()),
            ready_windows: Mutex::new(HashSet::new()),
            close_permissions: Arc::new(Mutex::new(HashSet::new())),
            image_download_semaphore: Semaphore::new(4),
            http_client,
            http_semaphore: Semaphore::new(3),
        })
    }

    /// Mark a frontend ready only after its file-open listener and initial document are ready.
    pub fn mark_window_ready(&self, label: &str) -> Result<(), String> {
        lock_mutex(&self.ready_windows)
            .map_err(|error| error.to_string())?
            .insert(label.to_string());
        Ok(())
    }

    pub fn remove_window(&self, label: &str) {
        if let Ok(mut ready) = lock_mutex(&self.ready_windows) {
            ready.remove(label);
        }
        if let Ok(mut pending) = lock_mutex(&self.pending_file) {
            pending.remove(label);
        }
    }

    /// Keep requests queued until a live frontend can receive them. Holding both
    /// locks through delivery preserves ordering when readiness and native opens race.
    pub fn dispatch_open_paths(
        &self,
        paths: impl IntoIterator<Item = String>,
        live_labels: impl IntoIterator<Item = String>,
        mut emit: impl FnMut(&str, &str) -> Result<(), String>,
    ) -> Result<(), String> {
        let mut pending = lock_mutex(&self.cli_files).map_err(|error| error.to_string())?;
        let ready = lock_mutex(&self.ready_windows).map_err(|error| error.to_string())?;
        pending.extend(paths);
        let live: HashSet<String> = live_labels.into_iter().collect();
        let mut failed = HashSet::new();

        while let Some(path) = pending.front() {
            let available = |label: &&String| live.contains(*label) && !failed.contains(*label);
            let target = ready
                .iter()
                .filter(available)
                .min_by_key(|label| (label.as_str() != "main", label.as_str()))
                .cloned();
            let Some(target) = target else { break };
            match emit(&target, path) {
                Ok(()) => {
                    pending.pop_front();
                }
                Err(error) => {
                    // A target may disappear between the live snapshot and delivery.
                    // Try another ready window without consuming the queued request.
                    failed.insert(target.clone());
                    warn!(target: "backend.app", label = %target, error = %error, "Cannot deliver opened file; retaining request");
                }
            }
        }
        Ok(())
    }

    /// Grant close permission for a specific window (called by `confirm_window_close`).
    pub fn grant_close_permission(&self, label: &str) {
        if let Ok(mut perms) = lock_mutex(&self.close_permissions) {
            perms.insert(label.to_string());
        }
    }

    /// Consume (and remove) the close permission for a specific window.
    /// Returns `true` if the permission existed and was consumed.
    #[allow(dead_code)]
    pub fn consume_close_permission(&self, label: &str) -> bool {
        lock_mutex(&self.close_permissions)
            .map(|mut perms| perms.remove(label))
            .unwrap_or(false)
    }

    /// Remove any stale close permission for a window that was destroyed.
    #[allow(dead_code)]
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

    /// Close the current workspace: stop the watcher and drop the session
    /// root. The persisted `last_workspace` is cleared by the `clear_workspace`
    /// command before this runs, so a failed settings write never leaves the
    /// session half-closed (spec: workspace-close).
    pub fn clear_workspace(&self) {
        {
            let mut watcher = match lock_mutex(&self.watcher) {
                Ok(g) => g,
                Err(e) => {
                    warn!(target: "backend.watcher", error = %e, "Cannot stop watcher on workspace close: lock poisoned");
                    return;
                }
            };
            if let Some(mut active) = watcher.take() {
                active.stop();
                debug!(target: "backend.watcher", "Stopped workspace watcher on workspace close");
            }
        }

        match lock_mutex(&self.workspace_root) {
            Ok(mut root) => {
                *root = None;
            }
            Err(e) => {
                warn!(target: "backend.watcher", error = %e, "Cannot clear workspace root: lock poisoned");
            }
        }
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

/// The settings to persist when a workspace is closed: `last_workspace` is
/// removed so the next start does not restore the closed workspace (spec:
/// workspace-close). Kept as a pure transform so tests can assert the
/// persisted payload without writing the developer's real settings file.
pub fn settings_without_last_workspace(current: &Settings) -> Settings {
    let mut next = current.clone();
    next.last_workspace = None;
    next
}

#[cfg(test)]
mod tests;
