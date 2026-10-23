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

    pub fn io(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Io, message)
    }

    pub fn serialization(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Serialization, message)
    }

    pub fn workspace_invalid(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::WorkspaceInvalid, message)
    }

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
///
/// The acquisition is infallible in practice: a poisoned lock is recovered via
/// [`lock_mutex_infallible`], so this never returns `Err`.
pub fn lock_mutex<T>(
    mutex: &std::sync::Mutex<T>,
) -> Result<std::sync::MutexGuard<'_, T>, AppError> {
    Ok(lock_mutex_infallible(mutex))
}

/// Infallible variant of [`lock_mutex`]: a poisoned lock is recovered via
/// `into_inner()` and logged, so acquisition never fails.
pub fn lock_mutex_infallible<T>(mutex: &std::sync::Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            tracing::warn!(
                target: "backend.lock",
                "Recovering from poisoned mutex by taking inner value"
            );
            poisoned.into_inner()
        }
    }
}

#[cfg(test)]
mod tests;
