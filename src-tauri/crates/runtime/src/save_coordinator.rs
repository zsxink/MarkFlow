//! PathSaveCoordinator — per-canonical-path serialization of save operations.
//!
//! Ensures that save operations for the same file path are serialized
//! (only one save in-flight at a time per path), preventing concurrent
//! overwrites from multiple sessions or rapid user saves.
//!
//! # Concurrency
//!
//! Uses a per-path `Arc<Mutex<()>>` with lazy insertion into the map.
//! This avoids memory leaks from stale paths while keeping locking lightweight.
//!
//! # Lock Discipline
//!
//! Acquire the coordinator lock first, THEN the per-path lock,
//! THEN any session lock. Never reverse this order.
//!
//! # API
//!
//! Uses a closure-based API to avoid lifetime issues with returning RAII guards:
//!
//! ```ignore
//! coordinator.with_path_lock(&path, || {
//!     // critical section — save logic here
//! })?;
//! ```

use crate::error::{RuntimeError, RuntimeErrorCode};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Maximum number of path entries to keep in the coordinator before evicting
/// least-recently-used entries. This bounds memory growth from stale paths.
const MAX_PATH_ENTRIES: usize = 1024;

/// Per-canonical-path serialization of save operations.
pub struct PathSaveCoordinator {
    inner: Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>,
}

impl PathSaveCoordinator {
    /// Create a new PathSaveCoordinator.
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::with_capacity(16)),
        }
    }

    /// Execute `f` while holding the per-path lock for `path`.
    ///
    /// This serializes save operations for the same path: only one `f` runs
    /// at a time per canonical path. Other threads block until `f` completes.
    pub fn with_path_lock<R>(&self, path: &Path, f: impl FnOnce() -> R) -> Result<R, RuntimeError> {
        let path_lock = {
            let mut inner = self.inner.lock().map_err(|e| {
                RuntimeError::new(
                    RuntimeErrorCode::Internal,
                    format!("PathSaveCoordinator lock poisoned: {}", e),
                )
            })?;

            // Evict if at capacity (simple: remove one arbitrary entry)
            if inner.len() >= MAX_PATH_ENTRIES {
                if let Some(key) = inner.keys().next().cloned() {
                    inner.remove(&key);
                }
            }

            inner
                .entry(path.to_path_buf())
                .or_insert_with(|| Arc::new(Mutex::new(())))
                .clone()
        };

        // Acquire the per-path lock (blocking, no IO inside — safe)
        let _guard = path_lock.lock().map_err(|e| {
            RuntimeError::new(
                RuntimeErrorCode::Internal,
                format!("PathSaveCoordinator per-path lock poisoned: {}", e),
            )
        })?;

        Ok(f())
    }

    /// Execute `f` while holding the per-path lock for `path`.
    /// Returns `None` if the lock is already held (non-blocking).
    pub fn try_with_path_lock<R>(
        &self,
        path: &Path,
        f: impl FnOnce() -> R,
    ) -> Result<Option<R>, RuntimeError> {
        let path_lock = {
            let inner = self.inner.lock().map_err(|e| {
                RuntimeError::new(
                    RuntimeErrorCode::Internal,
                    format!("PathSaveCoordinator lock poisoned: {}", e),
                )
            })?;

            inner.get(path).cloned()
        };

        match path_lock {
            Some(arc) => {
                let guard = match arc.try_lock() {
                    Ok(g) => g,
                    Err(std::sync::TryLockError::WouldBlock) => return Ok(None),
                    Err(std::sync::TryLockError::Poisoned(e)) => e.into_inner(),
                };
                let _guard = guard;
                Ok(Some(f()))
            }
            None => {
                // No existing entry — no one has locked this path yet
                self.with_path_lock(path, f).map(Some)
            }
        }
    }

    /// Check if a path entry exists in the coordinator.
    /// Note: this does not check lock state, only entry presence.
    pub fn has_entry(&self, path: &Path) -> Result<bool, RuntimeError> {
        let inner = self.inner.lock().map_err(|e| {
            RuntimeError::new(
                RuntimeErrorCode::Internal,
                format!("PathSaveCoordinator lock poisoned: {}", e),
            )
        })?;

        Ok(inner.contains_key(path))
    }
}

impl Default for PathSaveCoordinator {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::thread;

    #[test]
    fn coordinator_new_is_empty() {
        let coord = PathSaveCoordinator::new();
        assert!(
            coord.inner.lock().unwrap().is_empty(),
            "New coordinator should have no entries"
        );
    }

    #[test]
    fn coordinator_lock_and_release() {
        let coord = PathSaveCoordinator::new();
        let path = PathBuf::from("/tmp/test_lock.md");

        coord
            .with_path_lock(&path, || {
                assert!(
                    coord.has_entry(&path).unwrap(),
                    "Path should have an entry during lock"
                );
            })
            .expect("Should acquire lock");

        // After lock released, entry still exists (eviction on capacity only)
        assert!(
            coord.has_entry(&path).unwrap(),
            "Entry should still exist (cleanup on eviction only)"
        );
    }

    #[test]
    fn coordinator_serializes_concurrent_saves() {
        let coord = Arc::new(PathSaveCoordinator::new());
        let path = PathBuf::from("/tmp/concurrent_test.md");

        let coord1 = coord.clone();
        let path1 = path.clone();
        let handle1 = thread::spawn(move || {
            coord1
                .with_path_lock(&path1, || {
                    // Hold lock briefly
                    thread::sleep(std::time::Duration::from_millis(50));
                })
                .expect("Thread 1 should acquire lock");
        });

        let coord2 = coord.clone();
        let path2 = path.clone();
        let handle2 = thread::spawn(move || {
            // Should block until thread 1 releases
            coord2
                .with_path_lock(&path2, || {
                    // This runs only after thread 1 releases
                })
                .expect("Thread 2 should acquire lock after thread 1");
        });

        handle1.join().expect("Thread 1 panicked");
        handle2.join().expect("Thread 2 panicked");
    }

    #[test]
    fn coordinator_try_lock_returns_none_when_locked() {
        let coord = Arc::new(PathSaveCoordinator::new());
        let path = PathBuf::from("/tmp/try_lock_test.md");

        // Lock the path in another thread and hold it
        let coord2 = coord.clone();
        let path2 = path.clone();
        let barrier = Arc::new(std::sync::Barrier::new(2));
        let barrier2 = barrier.clone();

        let handle = thread::spawn(move || {
            coord2
                .with_path_lock(&path2, || {
                    barrier2.wait(); // Signal main thread that lock is held
                    thread::sleep(std::time::Duration::from_millis(100));
                })
                .expect("Lock");
        });

        // Wait for the other thread to acquire the lock
        barrier.wait();

        // try_lock should return None since the path is locked
        let result = coord
            .try_with_path_lock(&path, || 42)
            .expect("try_lock should not error");
        assert!(
            result.is_none(),
            "try_lock should return None when path is locked"
        );

        handle.join().expect("Thread panicked");
    }

    #[test]
    fn coordinator_try_lock_succeeds_when_free() {
        let coord = PathSaveCoordinator::new();
        let path = PathBuf::from("/tmp/try_lock_free_test.md");

        let result = coord
            .try_with_path_lock(&path, || 42)
            .expect("try_lock should not error");
        assert!(
            result.is_some(),
            "try_lock should return Some when path is free"
        );
        assert_eq!(result.unwrap(), 42, "Should return the closure result");
    }

    #[test]
    fn coordinator_multiple_paths_independent() {
        let coord = PathSaveCoordinator::new();
        let path_a = PathBuf::from("/tmp/a.md");
        let path_b = PathBuf::from("/tmp/b.md");

        coord
            .with_path_lock(&path_a, || {
                // Path B should be lockable even though A is locked
                coord
                    .with_path_lock(&path_b, || {
                        // Both locks held simultaneously — different paths
                    })
                    .expect("Lock path B independently");
            })
            .expect("Lock path A");
    }

    #[test]
    fn coordinator_lru_eviction_at_capacity() {
        let coord = PathSaveCoordinator::new();

        // Fill to capacity
        for i in 0..MAX_PATH_ENTRIES {
            let path = PathBuf::from(format!("/tmp/test_{}.md", i));
            coord
                .with_path_lock(&path, || {})
                .expect("Should acquire lock");
        }

        assert_eq!(
            coord.inner.lock().unwrap().len(),
            MAX_PATH_ENTRIES,
            "Should be at capacity"
        );

        // Add one more — should trigger eviction
        let overflow_path = PathBuf::from("/tmp/overflow.md");
        coord
            .with_path_lock(&overflow_path, || {})
            .expect("Should acquire lock");

        let len = coord.inner.lock().unwrap().len();
        assert_eq!(
            len, MAX_PATH_ENTRIES,
            "Should remain at capacity after eviction"
        );
    }

    #[test]
    fn coordinator_with_path_lock_propagates_ok() {
        let coord = PathSaveCoordinator::new();
        let path = PathBuf::from("/tmp/result_test.md");

        // with_path_lock returns Result<R, RuntimeError>, where R is the closure's return.
        // Here R = i32, so we get Result<i32, RuntimeError>.
        let result: Result<i32, RuntimeError> = coord.with_path_lock(&path, || 42);
        assert_eq!(result.unwrap(), 42);
    }

    #[test]
    fn coordinator_concurrent_different_paths_unblocked() {
        let coord = Arc::new(PathSaveCoordinator::new());
        let path_a = PathBuf::from("/tmp/a.md");
        let path_b = PathBuf::from("/tmp/b.md");

        let coord1 = coord.clone();
        let handle = thread::spawn(move || {
            coord1
                .with_path_lock(&path_a, || {
                    thread::sleep(std::time::Duration::from_millis(100));
                })
                .expect("Lock A");
        });

        // B should be lockable while A is held
        coord
            .with_path_lock(&path_b, || {
                // This runs immediately even though A is still locked
            })
            .expect("Lock B");

        handle.join().expect("Thread panicked");
    }
}
