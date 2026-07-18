use crate::error::AppError;
use crate::paths::normalize_path;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, warn};

/// Bounded queue capacity for file events. A full queue drops events and
/// schedules a single controlled rescan rather than growing without bound.
const EVENT_QUEUE_CAPACITY: usize = 1024;

/// Bridges notify's `EventHandler` to a bounded channel. On overflow the event
/// is dropped and refcounted so the worker can trigger a controlled rescan.
struct BoundedEventHandler {
    tx: mpsc::SyncSender<notify::Result<Event>>,
    dropped: Arc<AtomicU64>,
}

impl notify::EventHandler for BoundedEventHandler {
    fn handle_event(&mut self, event: notify::Result<Event>) {
        match self.tx.try_send(event) {
            Ok(()) => {}
            Err(mpsc::TrySendError::Full(_)) => {
                self.dropped.fetch_add(1, Ordering::SeqCst);
            }
            Err(mpsc::TrySendError::Disconnected(_)) => {
                // Worker already gone; nothing to deliver.
            }
        }
    }
}

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
    /// `None` once stopped (the watcher handle owns the event sender, so
    /// dropping it closes the channel and lets the worker thread exit).
    _watcher: Option<RecommendedWatcher>,
    /// Signals the worker thread to stop receiving and exit.
    stop: Arc<AtomicBool>,
    /// Handle of the worker thread so we can join on `stop()`.
    handle: Option<JoinHandle<()>>,
}

impl FileWatcher {
    pub fn new(
        watch_path: PathBuf,
        callback: impl Fn(FileChangeEvent) + Send + 'static,
    ) -> Result<Self, AppError> {
        let watch_path_display = normalize_path(&watch_path);
        let (tx, rx) = mpsc::sync_channel::<notify::Result<Event>>(EVENT_QUEUE_CAPACITY);
        let dropped = Arc::new(AtomicU64::new(0));
        let handler = BoundedEventHandler {
            tx,
            dropped: dropped.clone(),
        };
        let mut watcher =
            RecommendedWatcher::new(handler, notify::Config::default()).map_err(|e| {
                AppError::watcher_start_failed(format!("Failed to create watcher: {}", e))
            })?;
        watcher
            .watch(&watch_path, RecursiveMode::Recursive)
            .map_err(|e| {
                AppError::watcher_start_failed(format!(
                    "Failed to watch {}: {}",
                    watch_path_display, e
                ))
            })?;
        debug!(target: "backend.watcher", path = %watch_path_display, "Registered filesystem watcher");

        let stop = Arc::new(AtomicBool::new(false));
        let stop_worker = stop.clone();
        let handle = std::thread::spawn(move || {
            let mut previous: Option<FileChangeEvent> = None;
            while !stop_worker.load(Ordering::SeqCst) {
                match rx.recv() {
                    Ok(Ok(event)) => {
                        if let Some(change) = FileChangeEvent::from_notify_event(&event) {
                            if is_duplicate_event(previous.as_ref(), &change) {
                                continue;
                            }
                            previous = Some(change.clone());
                            callback(change);
                        }
                    }
                    Ok(Err(error)) => {
                        warn!(target: "backend.watcher", path = %watch_path_display, error = %error, "Received file watcher error");
                    }
                    Err(_) => {
                        // Sender dropped (watcher dropped) — exit cleanly.
                        break;
                    }
                }
            }

            let dropped_events = dropped.load(Ordering::SeqCst);
            if dropped_events > 0 {
                warn!(
                    target: "backend.watcher",
                    path = %watch_path_display,
                    dropped_events,
                    "Event queue overflowed; triggering controlled rescan"
                );
                // Controlled rescan: replay a synthetic rescan event so the
                // frontend refreshes the tree once instead of per dropped file.
                callback(FileChangeEvent {
                    path: watch_path_display.clone(),
                    kind: "rescan".into(),
                    timestamp: SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64,
                });
            }
        });
        Ok(Self {
            _watcher: Some(watcher),
            stop,
            handle: Some(handle),
        })
    }

    /// Signal the worker thread to stop and join it. Idempotent.
    pub fn stop(&mut self) {
        if let Some(handle) = self.handle.take() {
            self.stop.store(true, Ordering::SeqCst);
            // Drop the watcher handle FIRST so its sender (`tx`) is closed;
            // only then does `rx.recv()` return `Err` and the worker exit —
            // otherwise `join()` could block indefinitely waiting on an alive sender.
            // Queued events still drain because `recv()` returns them before the
            // `Err` close signal.
            let _watcher = self._watcher.take();
            drop(_watcher);
            let _ = handle.join();
        }
    }
}

impl Drop for FileWatcher {
    fn drop(&mut self) {
        self.stop();
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

    #[test]
    fn watcher_starts_and_stops_without_leaking_thread() {
        let dir = std::env::temp_dir().join(format!("markflow-watch-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        // Scope the watcher so it is dropped (and joined) within the test.
        {
            let watcher = FileWatcher::new(dir.clone(), |_event| {})
                .expect("watcher should start on an existing dir");
            // Drop explicitly triggers stop() + join.
            drop(watcher);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn emitting_after_stop_is_safe_no_panic() {
        // stop() must be idempotent and safe to call twice.
        let dir = std::env::temp_dir().join(format!("markflow-watch-test2-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let mut watcher = FileWatcher::new(dir.clone(), |_event| {})
            .expect("watcher should start on an existing dir");
        watcher.stop();
        watcher.stop(); // second call must be a no-op
        let _ = std::fs::remove_dir_all(&dir);
    }
}
