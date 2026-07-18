//! Unified backend error type with stable machine-readable codes.
//!
//! Commands return `Result<T, AppError>` so the frontend can classify failures
//! (retry / conflict / degrade / fatal) instead of guessing from a raw string.
//! `AppError` serializes to `{ code, message }` and always carries a human
//! `message` so un-migrated frontend sites still degrade gracefully.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Stable error categories understood by the frontend (`classifyError`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AppErrorCode {
    /// A `Mutex` was poisoned by a previous panic; the operation cannot acquire the lock.
    LockPoisoned,
    /// The filesystem watcher failed to start for the given path.
    WatcherStartFailed,
    /// A filesystem read/write/metadata operation failed.
    Io,
    /// Serialization or deserialization of settings/content failed.
    Serialization,
    /// The requested workspace path is not a directory (or went away).
    WorkspaceInvalid,
    /// Any other unexpected backend failure.
    Internal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppError {
    pub code: AppErrorCode,
    pub message: String,
}

impl AppError {
    pub fn new(code: AppErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    #[allow(dead_code)]
    pub fn lock_poisoned(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::LockPoisoned, message)
    }

    #[allow(dead_code)]
    pub fn watcher_start_failed(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::WatcherStartFailed, message)
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Io, message)
    }

    pub fn serialization(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Serialization, message)
    }

    pub fn workspace_invalid(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::WorkspaceInvalid, message)
    }

    #[allow(dead_code)]
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Internal, message)
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

/// Acquire a `Mutex` lock, converting a poisoned lock into a structured error
/// rather than panicking. Callers can decide whether the state is recoverable.
pub fn lock_mutex<T>(mutex: &std::sync::Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>, AppError> {
    match mutex.lock() {
        Ok(guard) => Ok(guard),
        Err(poisoned) => {
            tracing::warn!(
                target: "backend.lock",
                "Recovering from poisoned mutex by taking inner value"
            );
            Ok(poisoned.into_inner())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn lock_mutex_recovers_poisoned_state() {
        let m: Mutex<u32> = Mutex::new(7);
        // Poison the mutex by panicking while holding the guard.
        let poison_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _g = m.lock().unwrap();
            panic!("simulated panic while holding lock");
        }));
        assert!(poison_result.is_err(), "expected simulated panic");

        // lock_mutex must recover the inner value instead of panicking.
        let guard = lock_mutex(&m).expect("poisoned lock should be recoverable");
        assert_eq!(*guard, 7);
    }

    #[test]
    fn error_code_serializes_with_message() {
        let e = AppError::watcher_start_failed("boom");
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains("watcher-start-failed"));
        assert!(json.contains("boom"));
        // Frontend still gets a readable message.
        assert_eq!(e.to_string(), "boom");
    }
}
