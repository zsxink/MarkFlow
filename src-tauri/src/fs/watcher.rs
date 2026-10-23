use crate::error::lock_mutex_infallible;
use crate::fs::ignore::IgnoreMatcher;
use crate::paths::normalize_path;
use notify::event::{ModifyKind, RenameMode};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex, MutexGuard};
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

/// Acquire the shared recovery scope lock without panicking on a poisoned
/// mutex. A poisoned scope is discarded (value cleared, poison flag reset) and
/// `None` is returned so callers fall back to a root-level rescan.
///
/// `lock_mutex_infallible` recovers poisoned state via `into_inner()`, so the
/// acquisition itself cannot fail — the only way to get `None` here is a
/// detected poison.
fn acquire_recovery_scope(
    scope: &Mutex<Option<PathBuf>>,
) -> Option<MutexGuard<'_, Option<PathBuf>>> {
    let mut guard = lock_mutex_infallible(scope);
    // Sample poison state AFTER acquiring the guard: a mutex poisoned before
    // acquisition still reports `is_poisoned()` here (the flag stays set until
    // `clear_poison()`), while a poison after acquisition cannot be observed —
    // nor does it need to be, since this guard was already granted.
    if scope.is_poisoned() {
        warn!(
            target: "backend.lock",
            "Recovery scope lock was poisoned; discarding scope and falling back to root rescan"
        );
        *guard = None;
        scope.clear_poison();
        return None;
    }
    Some(guard)
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
                        if let Some(mut scope) = acquire_recovery_scope(&producer_recovery_scope) {
                            for path in event
                                .paths
                                .into_iter()
                                .filter(|path| !producer_matcher.is_ignored(&producer_root, path))
                            {
                                *scope =
                                    Some(merge_recovery_scope(&producer_root, scope.take(), &path));
                            }
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
                    let recovery_path = acquire_recovery_scope(&recovery_scope)
                        .and_then(|mut scope| scope.take())
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
mod tests;
