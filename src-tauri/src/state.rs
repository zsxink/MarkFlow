use crate::commands::settings::load_settings_inner;
use crate::error::{lock_mutex, AppError};
use crate::fs::ignore::matcher_snapshot;
use crate::fs::watcher::{FileChangeEvent, FileWatcher};
use crate::http::ValidatingResolver;
use crate::paths::normalize_path;
use markflow_runtime::host_contract::{
    HostCapability, HostErrorCode, HostRequestContext, HOST_PROTOCOL_VERSION,
};
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
    /// Request-bound Host window lifecycle tasks keyed by window label and
    /// request id. Window close/destroy cancels the bound tasks so late results
    /// can be dropped instead of routed to a different window.
    pub window_tasks: Arc<Mutex<WindowTaskRegistry>>,
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
            window_tasks: Arc::new(Mutex::new(WindowTaskRegistry::new())),
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

    pub fn create_window_host_context(
        &self,
        request_id: impl Into<String>,
        client_id: impl Into<String>,
        window_label: impl Into<String>,
    ) -> Result<HostRequestContext, HostErrorCode> {
        let context = HostRequestContext {
            protocol_version: HOST_PROTOCOL_VERSION,
            request_id: request_id.into(),
            client_id: client_id.into(),
            window_label: Some(window_label.into()),
            session_id: None,
            document_id: None,
            base_revision: None,
            capability: HostCapability::Windows,
        };
        context.validate_required_scope()?;
        Ok(context)
    }

    pub fn register_window_task(&self, context: HostRequestContext) -> Result<(), HostErrorCode> {
        context.validate_required_scope()?;
        if context.capability != HostCapability::Windows {
            return Err(HostErrorCode::HostMissingCapability);
        }
        let window_label = context
            .window_label
            .as_ref()
            .ok_or(HostErrorCode::HostWindowMismatch)?
            .clone();
        if let Ok(mut registry) = lock_mutex(&self.window_tasks) {
            registry.register(WindowTask {
                request_id: context.request_id,
                client_id: context.client_id,
                window_label,
                session_id: context.session_id,
                base_revision: context.base_revision,
            });
        }
        Ok(())
    }

    pub fn cancel_window_tasks(&self, window_label: &str) -> Vec<String> {
        lock_mutex(&self.window_tasks)
            .map(|mut registry| registry.cancel_window(window_label))
            .unwrap_or_default()
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowTask {
    pub request_id: String,
    pub client_id: String,
    pub window_label: String,
    pub session_id: Option<u64>,
    pub base_revision: Option<u64>,
}

#[derive(Debug, Default)]
pub struct WindowTaskRegistry {
    active: HashMap<String, WindowTask>,
    cancelled: HashSet<String>,
}

impl WindowTaskRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, task: WindowTask) {
        self.cancelled.remove(&task.request_id);
        self.active.insert(task.request_id.clone(), task);
    }

    pub fn cancel_window(&mut self, window_label: &str) -> Vec<String> {
        let request_ids: Vec<String> = self
            .active
            .iter()
            .filter_map(|(request_id, task)| {
                (task.window_label == window_label).then_some(request_id.clone())
            })
            .collect();
        for request_id in &request_ids {
            self.active.remove(request_id);
            self.cancelled.insert(request_id.clone());
        }
        request_ids
    }

    #[cfg(test)]
    pub fn is_cancelled(&self, request_id: &str) -> bool {
        self.cancelled.contains(request_id)
    }

    #[cfg(test)]
    pub fn should_route(
        &self,
        window_label: &str,
        request_id: &str,
        session_id: Option<u64>,
        base_revision: Option<u64>,
    ) -> bool {
        self.active.get(request_id).is_some_and(|task| {
            task.window_label == window_label
                && task.session_id == session_id
                && task.base_revision == base_revision
                && !self.is_cancelled(request_id)
        })
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

    #[test]
    fn window_host_context_requires_window_scope() {
        let state = AppState::new().unwrap();
        let context = state
            .create_window_host_context("close-1", "client-a", "main")
            .unwrap();

        assert_eq!(context.capability, HostCapability::Windows);
        assert_eq!(context.window_label.as_deref(), Some("main"));
        assert_eq!(context.request_id, "close-1");
        assert!(context.validate_required_scope().is_ok());
    }

    #[test]
    fn window_task_registry_cancels_by_window_label() {
        let mut registry = WindowTaskRegistry::new();
        registry.register(WindowTask {
            request_id: "req-main".into(),
            client_id: "client-a".into(),
            window_label: "main".into(),
            session_id: Some(7),
            base_revision: Some(3),
        });
        registry.register(WindowTask {
            request_id: "req-other".into(),
            client_id: "client-a".into(),
            window_label: "secondary".into(),
            session_id: Some(9),
            base_revision: Some(1),
        });

        assert!(registry.should_route("main", "req-main", Some(7), Some(3)));
        let cancelled = registry.cancel_window("main");
        assert_eq!(cancelled.len(), 1);
        assert!(cancelled.contains(&"req-main".to_string()));
        assert!(!registry.should_route("main", "req-main", Some(7), Some(3)));
        assert!(registry.is_cancelled("req-main"));
        assert!(registry.should_route("secondary", "req-other", Some(9), Some(1)));
    }

    #[test]
    fn window_result_routing_rejects_mismatched_identity() {
        let mut registry = WindowTaskRegistry::new();
        registry.register(WindowTask {
            request_id: "req-1".into(),
            client_id: "client-a".into(),
            window_label: "main".into(),
            session_id: Some(7),
            base_revision: Some(3),
        });

        assert!(!registry.should_route("secondary", "req-1", Some(7), Some(3)));
        assert!(!registry.should_route("main", "req-1", Some(8), Some(3)));
        assert!(!registry.should_route("main", "req-1", Some(7), Some(4)));
        assert!(!registry.should_route("main", "req-missing", Some(7), Some(3)));
    }
}
