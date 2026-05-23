use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{SystemTime, UNIX_EPOCH};

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
        let path = event.paths.first()?.to_string_lossy().to_string().replace('\\', "/");
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
        let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
        let mut watcher =
            RecommendedWatcher::new(tx, notify::Config::default()).map_err(|e| e.to_string())?;
        watcher
            .watch(&watch_path, RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;
        std::thread::spawn(move || {
            while let Ok(Ok(event)) = rx.recv() {
                if let Some(change) = FileChangeEvent::from_notify_event(&event) {
                    callback(change);
                }
            }
        });
        Ok(Self { _watcher: watcher })
    }
}
