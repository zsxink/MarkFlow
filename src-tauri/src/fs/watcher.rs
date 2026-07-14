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

fn is_duplicate_event(previous: Option<&FileChangeEvent>, current: &FileChangeEvent) -> bool {
    previous.is_some_and(|previous| {
        previous.path == current.path
            && previous.kind == current.kind
            && current.timestamp.saturating_sub(previous.timestamp) <= 100
    })
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
            let mut previous: Option<FileChangeEvent> = None;
            while let Ok(event) = rx.recv() {
                match event {
                    Ok(event) => {
                        if let Some(change) = FileChangeEvent::from_notify_event(&event) {
                            if is_duplicate_event(previous.as_ref(), &change) {
                                continue;
                            }
                            previous = Some(change.clone());
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

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::CreateKind;
    use std::path::PathBuf;

    #[test]
    fn ignores_non_file_change_events() {
        let event = Event::new(EventKind::Other).add_path(PathBuf::from("/tmp/ignored"));
        assert!(FileChangeEvent::from_notify_event(&event).is_none());
    }

    #[test]
    fn maps_create_event_and_normalizes_path() {
        let event = Event::new(EventKind::Create(CreateKind::File))
            .add_path(PathBuf::from("/tmp/markflow/file.md"));
        let change = FileChangeEvent::from_notify_event(&event).unwrap();
        assert_eq!(change.kind, "create");
        assert_eq!(change.path, "/tmp/markflow/file.md");
    }

    #[test]
    fn coalesces_adjacent_duplicate_events() {
        let first = FileChangeEvent {
            path: "/tmp/file.md".into(),
            kind: "modify".into(),
            timestamp: 1,
        };
        let duplicate = FileChangeEvent {
            timestamp: 2,
            ..first.clone()
        };
        let different_kind = FileChangeEvent {
            kind: "delete".into(),
            ..duplicate.clone()
        };
        assert!(is_duplicate_event(Some(&first), &duplicate));
        assert!(!is_duplicate_event(Some(&first), &different_kind));
    }
}
