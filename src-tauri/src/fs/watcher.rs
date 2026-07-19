use crate::fs::ignore::IgnoreMatcher;
use crate::paths::normalize_path;
use notify::event::{ModifyKind, RenameMode};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tracing::{debug, info, warn};

const EVENT_QUEUE_CAPACITY: usize = 2048;
const COALESCE_WINDOW: Duration = Duration::from_millis(150);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeEvent {
    pub path: String,
    pub kind: String,
    pub timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn normalize_event(event: Event, root: &Path, matcher: &IgnoreMatcher) -> Vec<FileChangeEvent> {
    let paths = event.paths;
    let now = timestamp();
    if let EventKind::Modify(ModifyKind::Name(mode)) = event.kind {
        return match mode {
            RenameMode::Both if paths.len() >= 2 => {
                let from_ignored = matcher.is_ignored(root, &paths[0]);
                let to_ignored = matcher.is_ignored(root, &paths[1]);
                match (from_ignored, to_ignored) {
                    (false, false) => vec![FileChangeEvent {
                        path: normalize_path(&paths[0]),
                        kind: "rename".into(),
                        timestamp: now,
                        to_path: Some(normalize_path(&paths[1])),
                        reason: None,
                    }],
                    (false, true) => vec![FileChangeEvent {
                        path: normalize_path(&paths[0]),
                        kind: "delete".into(),
                        timestamp: now,
                        to_path: None,
                        reason: Some("renamed-into-ignored".into()),
                    }],
                    (true, false) => vec![FileChangeEvent {
                        path: normalize_path(&paths[1]),
                        kind: "create".into(),
                        timestamp: now,
                        to_path: None,
                        reason: Some("renamed-out-of-ignored".into()),
                    }],
                    (true, true) => vec![],
                }
            }
            _ if !paths.is_empty() => {
                let recovery_path = minimal_rescan_path(root, &paths);
                vec![FileChangeEvent {
                    path: normalize_path(&recovery_path),
                    kind: "rescan".into(),
                    timestamp: now,
                    to_path: None,
                    reason: Some("unpaired-rename".into()),
                }]
            }
            _ => vec![],
        };
    }
    let kind = match event.kind {
        EventKind::Create(_) => "create",
        EventKind::Modify(_) => "modify",
        EventKind::Remove(_) => "delete",
        _ => return vec![],
    };
    paths
        .into_iter()
        .filter(|path| !matcher.is_ignored(root, path))
        .map(|path| FileChangeEvent {
            path: normalize_path(&path),
            kind: kind.into(),
            timestamp: now,
            to_path: None,
            reason: None,
        })
        .collect()
}

fn coalesce(events: Vec<FileChangeEvent>) -> Vec<FileChangeEvent> {
    let mut merged: HashMap<(String, String), FileChangeEvent> = HashMap::new();
    for event in events {
        let key = (event.path.clone(), event.kind.clone());
        if event.kind == "delete" {
            merged.remove(&(event.path.clone(), "create".into()));
            merged.remove(&(event.path.clone(), "modify".into()));
        }
        merged.insert(key, event);
    }
    let mut result: Vec<_> = merged.into_values().collect();
    result.sort_by(|a, b| {
        a.timestamp
            .cmp(&b.timestamp)
            .then_with(|| a.path.cmp(&b.path))
    });
    result
}

fn enqueue_bounded<T>(
    tx: &mpsc::SyncSender<T>,
    value: T,
    queue_len: &AtomicUsize,
    queue_peak: &AtomicUsize,
    overflow_count: &AtomicUsize,
) -> Result<(), T> {
    let current = queue_len.fetch_add(1, Ordering::Relaxed) + 1;
    match tx.try_send(value) {
        Ok(()) => {
            queue_peak.fetch_max(current, Ordering::Relaxed);
            Ok(())
        }
        Err(mpsc::TrySendError::Full(value)) => {
            queue_len.fetch_sub(1, Ordering::Relaxed);
            overflow_count.fetch_add(1, Ordering::Relaxed);
            Err(value)
        }
        Err(mpsc::TrySendError::Disconnected(value)) => {
            queue_len.fetch_sub(1, Ordering::Relaxed);
            Err(value)
        }
    }
}

fn minimal_rescan_path(root: &Path, paths: &[PathBuf]) -> PathBuf {
    let Some(first) = paths.first() else {
        return root.to_path_buf();
    };
    let mut ancestor = first.parent().unwrap_or(root).to_path_buf();
    for path in &paths[1..] {
        while !path.starts_with(&ancestor) && ancestor.starts_with(root) {
            if !ancestor.pop() {
                return root.to_path_buf();
            }
        }
    }
    if ancestor.starts_with(root) {
        ancestor
    } else {
        root.to_path_buf()
    }
}

fn merge_recovery_scope(root: &Path, current: Option<PathBuf>, path: &Path) -> PathBuf {
    match current {
        None => path.parent().unwrap_or(root).to_path_buf(),
        Some(scope) => minimal_rescan_path(root, &[scope.join("event"), path.to_path_buf()]),
    }
}

pub struct FileWatcher {
    /// `None` once stopped. The watcher handle owns the event sender, so
    /// dropping it closes the channel and lets the worker thread exit.
    _watcher: Option<RecommendedWatcher>,
    /// Handle of the worker thread so we can join on `stop()`.
    handle: Option<JoinHandle<()>>,
}

impl FileWatcher {
    pub fn new(
        watch_path: PathBuf,
        matcher: IgnoreMatcher,
        callback: impl Fn(Vec<FileChangeEvent>) + Send + 'static,
    ) -> Result<Self, String> {
        let path_display = normalize_path(&watch_path);
        let (tx, rx) = mpsc::sync_channel::<notify::Result<Event>>(EVENT_QUEUE_CAPACITY);
        let overflowed = Arc::new(AtomicBool::new(false));
        let queue_len = Arc::new(AtomicUsize::new(0));
        let queue_peak = Arc::new(AtomicUsize::new(0));
        let overflow_count = Arc::new(AtomicUsize::new(0));
        let recovery_scope = Arc::new(Mutex::new(None::<PathBuf>));
        let producer_overflow = overflowed.clone();
        let producer_len = queue_len.clone();
        let producer_peak = queue_peak.clone();
        let producer_overflow_count = overflow_count.clone();
        let producer_recovery_scope = recovery_scope.clone();
        let producer_matcher = matcher.clone();
        let producer_root = watch_path.clone();
        let mut watcher = RecommendedWatcher::new(
            move |event| {
                if let Err(dropped) = enqueue_bounded(
                    &tx,
                    event,
                    &producer_len,
                    &producer_peak,
                    &producer_overflow_count,
                ) {
                    if let Ok(event) = dropped {
                        let mut scope = producer_recovery_scope.lock().unwrap();
                        for path in event
                            .paths
                            .into_iter()
                            .filter(|path| !producer_matcher.is_ignored(&producer_root, path))
                        {
                            *scope =
                                Some(merge_recovery_scope(&producer_root, scope.take(), &path));
                        }
                    }
                    producer_overflow.store(true, Ordering::Release);
                }
            },
            notify::Config::default(),
        )
        .map_err(|e| e.to_string())?;
        watcher
            .watch(&watch_path, RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;
        debug!(target: "backend.watcher", path = %path_display, capacity = EVENT_QUEUE_CAPACITY, "Registered bounded filesystem watcher");
        let handle = std::thread::spawn(move || {
            while let Ok(first) = rx.recv() {
                queue_len.fetch_sub(1, Ordering::Relaxed);
                let mut raw = vec![first];
                while let Ok(event) = rx.recv_timeout(COALESCE_WINDOW) {
                    queue_len.fetch_sub(1, Ordering::Relaxed);
                    raw.push(event);
                    if raw.len() >= EVENT_QUEUE_CAPACITY {
                        break;
                    }
                }
                let raw_count = raw.len();
                let mut normalized = Vec::new();
                for event in raw {
                    match event {
                        Ok(event) => {
                            normalized.extend(normalize_event(event, &watch_path, &matcher))
                        }
                        Err(error) => {
                            // Backend runtime error is logged (not silent) and a
                            // controlled rescan is scheduled so the tree stays correct.
                            warn!(target: "backend.watcher", path = %path_display, error = %error, "Watcher error requires rescan");
                            normalized.push(FileChangeEvent {
                                path: path_display.clone(),
                                kind: "rescan".into(),
                                timestamp: timestamp(),
                                to_path: None,
                                reason: Some("notify-error".into()),
                            });
                        }
                    }
                }
                if overflowed.swap(false, Ordering::AcqRel) {
                    let recovery_path = recovery_scope
                        .lock()
                        .unwrap()
                        .take()
                        .unwrap_or_else(|| watch_path.clone());
                    normalized.push(FileChangeEvent {
                        path: normalize_path(&recovery_path),
                        kind: "rescan".into(),
                        timestamp: timestamp(),
                        to_path: None,
                        reason: Some("queue-overflow".into()),
                    });
                }
                let batch = coalesce(normalized);
                if !batch.is_empty() {
                    info!(target: "backend.watcher", raw_events = raw_count, emitted_events = batch.len(),
                        queue_len = queue_len.load(Ordering::Relaxed), queue_peak = queue_peak.load(Ordering::Relaxed),
                        overflow_count = overflow_count.load(Ordering::Relaxed), "Emitting coalesced file tree batch");
                    callback(batch);
                }
            }
        });
        Ok(Self {
            _watcher: Some(watcher),
            handle: Some(handle),
        })
    }

    /// Signal the worker thread to stop and join it. Idempotent.
    pub fn stop(&mut self) {
        if let Some(handle) = self.handle.take() {
            // Drop the watcher handle FIRST so its sender (`tx`) is closed;
            // only then does `rx.recv()` return `Err` and the worker exit —
            // otherwise `join()` could block indefinitely on an alive sender.
            // Queued events still drain because `recv()` returns them before
            // the `Err` close signal.
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
    use notify::event::{CreateKind, ModifyKind};

    #[test]
    fn maps_batches_and_ignores_dependency_directories() {
        let root = PathBuf::from("/workspace");
        let event = Event::new(EventKind::Create(CreateKind::File))
            .add_path(root.join("a.md"))
            .add_path(root.join("node_modules/pkg.js"));
        let changes = normalize_event(event, &root, &IgnoreMatcher::defaults());
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].kind, "create");
    }

    #[test]
    fn pairs_rename_both_and_recovers_unpaired_rename() {
        let root = PathBuf::from("/workspace");
        let both = Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::Both)))
            .add_path(root.join("old.md"))
            .add_path(root.join("new.md"));
        let changes = normalize_event(both, &root, &IgnoreMatcher::defaults());
        assert_eq!(changes[0].kind, "rename");
        assert!(changes[0].to_path.as_deref().unwrap().ends_with("new.md"));
        let from = Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::From)))
            .add_path(root.join("src/old.md"));
        let recovery = normalize_event(from, &root, &IgnoreMatcher::defaults());
        assert_eq!(recovery[0].kind, "rescan");
        assert_eq!(PathBuf::from(&recovery[0].path), root.join("src"));
        assert_eq!(
            normalize_event(
                Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::Both)))
                    .add_path(root.join("node_modules/a"))
                    .add_path(root.join("a")),
                &root,
                &IgnoreMatcher::defaults()
            )[0]
            .kind,
            "create"
        );
    }

    #[test]
    fn coalesces_duplicate_modifies_and_delete_supersedes_modify() {
        let base = FileChangeEvent {
            path: "/a.md".into(),
            kind: "modify".into(),
            timestamp: 1,
            to_path: None,
            reason: None,
        };
        let delete = FileChangeEvent {
            kind: "delete".into(),
            timestamp: 2,
            ..base.clone()
        };
        let result = coalesce(vec![base.clone(), base, delete]);
        assert_eq!(
            result,
            vec![FileChangeEvent {
                path: "/a.md".into(),
                kind: "delete".into(),
                timestamp: 2,
                to_path: None,
                reason: None
            }]
        );
    }

    #[test]
    fn bounded_enqueue_reports_overflow_without_growing_queue() {
        let (tx, _rx) = mpsc::sync_channel(1);
        let len = AtomicUsize::new(0);
        let peak = AtomicUsize::new(0);
        let overflows = AtomicUsize::new(0);
        assert!(enqueue_bounded(&tx, 1, &len, &peak, &overflows).is_ok());
        assert_eq!(enqueue_bounded(&tx, 2, &len, &peak, &overflows), Err(2));
        assert_eq!(len.load(Ordering::Relaxed), 1);
        assert_eq!(peak.load(Ordering::Relaxed), 1);
        assert_eq!(overflows.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn overflow_recovery_uses_minimal_common_ancestor() {
        let root = PathBuf::from("/workspace");
        assert_eq!(
            minimal_rescan_path(
                &root,
                &[root.join("src/a.md"), root.join("src/nested/b.md")]
            ),
            root.join("src")
        );
        assert_eq!(
            minimal_rescan_path(&root, &[root.join("src/a.md"), root.join("docs/b.md")]),
            root
        );
    }

    #[test]
    fn sustained_overflow_keeps_constant_size_recovery_scope() {
        let root = PathBuf::from("/workspace");
        let mut scope = None;
        for index in 0..100_000 {
            scope = Some(merge_recovery_scope(
                &root,
                scope,
                &root.join(format!("src/group-{}/file.md", index % 10)),
            ));
        }
        assert_eq!(scope, Some(root.join("src")));
        assert_eq!(
            std::mem::size_of_val(&scope),
            std::mem::size_of::<Option<PathBuf>>()
        );
    }

    #[test]
    fn event_storm_coalesces_and_ignored_storm_is_filtered() {
        let root = PathBuf::from("/workspace");
        let matcher = IgnoreMatcher::defaults();
        let mut changes = Vec::new();
        for _ in 0..1000 {
            changes.extend(normalize_event(
                Event::new(EventKind::Modify(ModifyKind::Data(
                    notify::event::DataChange::Any,
                )))
                .add_path(root.join("src/a.md")),
                &root,
                &matcher,
            ));
            changes.extend(normalize_event(
                Event::new(EventKind::Modify(ModifyKind::Data(
                    notify::event::DataChange::Any,
                )))
                .add_path(root.join("target/a.o")),
                &root,
                &matcher,
            ));
        }
        let merged = coalesce(changes);
        assert_eq!(merged.len(), 1);
        assert!(merged[0].path.ends_with("src/a.md"));
    }

    #[test]
    fn emitting_after_stop_is_safe_no_panic() {
        // stop() must be idempotent and safe to call twice.
        let dir = std::env::temp_dir().join(format!("markflow-watch-test2-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let mut watcher = FileWatcher::new(dir.clone(), IgnoreMatcher::defaults(), |_event| {})
            .unwrap();
        watcher.stop();
        watcher.stop(); // second call must be a no-op
        let _ = std::fs::remove_dir_all(&dir);
    }
}
