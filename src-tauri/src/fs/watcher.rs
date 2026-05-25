use crate::paths::normalize_path;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, warn};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeEvent {
    pub path: String,
    pub kind: String,
    pub timestamp: u64,
}

impl FileChangeEvent {
    fn from_notify_event(event: &Event) -> Option<Self> {
        let kind = match event.kind {
            EventKind::Create(_) => "create",
            EventKind::Modify(_) => "modify",
            EventKind::Remove(_) => "delete",
            _ => return None,
        };
        let path = normalize_path(event.paths.first()?);
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        Some(FileChangeEvent {
            path,
            kind: kind.to_string(),
            timestamp,
        })
    }
}

pub struct FileWatcher {
    _watcher: RecommendedWatcher,
}

impl FileWatcher {
    pub fn new(
        watch_path: PathBuf,
        callback: impl Fn(FileChangeEvent) + Send + 'static,
    ) -> Result<Self, String> {
        let watch_path_display = normalize_path(&watch_path);
        let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
        let mut watcher =
            RecommendedWatcher::new(tx, notify::Config::default()).map_err(|e| e.to_string())?;
        watcher
            .watch(&watch_path, RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;
        debug!(target: "backend.watcher", path = %watch_path_display, "Registered filesystem watcher");
        std::thread::spawn(move || {
            while let Ok(event) = rx.recv() {
                match event {
                    Ok(event) => {
                        if let Some(change) = FileChangeEvent::from_notify_event(&event) {
                            callback(change);
                        }
                    }
                    Err(error) => {
                        warn!(target: "backend.watcher", path = %watch_path_display, error = %error, "Received file watcher error");
                    }
                }
            }
        });
        Ok(Self { _watcher: watcher })
    }
}
