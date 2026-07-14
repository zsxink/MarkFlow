use crate::paths::{app_config_dir, normalize_path};
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};
use tracing::Level;
use tracing_appender::non_blocking::WorkerGuard;

const LOG_RETENTION_DAYS: u64 = 7;
static LOGGER_GUARD: OnceLock<WorkerGuard> = OnceLock::new();

fn log_dir() -> PathBuf {
    app_config_dir().join("logs")
}

fn cleanup_old_logs(dir: &Path) -> Result<usize, String> {
    let cutoff = SystemTime::now()
        .checked_sub(Duration::from_secs(LOG_RETENTION_DAYS * 24 * 60 * 60))
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let mut removed = 0;

    for entry in fs::read_dir(dir).map_err(|e| format!("Failed to read log dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read log entry: {}", e))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .map_err(|e| format!("Failed to inspect log file: {}", e))?;
        if modified < cutoff {
            fs::remove_file(&path).map_err(|e| format!("Failed to remove old log file: {}", e))?;
            removed += 1;
        }
    }

    Ok(removed)
}

pub fn init_logging() -> Result<PathBuf, String> {
    let dir = log_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create log dir: {}", e))?;
    let removed = cleanup_old_logs(&dir)?;

    let file_appender = tracing_appender::rolling::daily(&dir, "markflow.log");
    let (writer, guard) = tracing_appender::non_blocking(file_appender);
    let max_level = if cfg!(debug_assertions) {
        Level::DEBUG
    } else {
        Level::INFO
    };

    let subscriber = tracing_subscriber::fmt()
        .with_writer(writer)
        .with_target(true)
        .with_ansi(false)
        .with_max_level(max_level)
        .finish();

    tracing::subscriber::set_global_default(subscriber)
        .map_err(|e| format!("Failed to initialize logger: {}", e))?;
    let _ = LOGGER_GUARD.set(guard);

    tracing::info!(
        target: "backend.logger",
        log_dir = %normalize_path(&dir),
        removed_files = removed,
        level = %max_level.as_str(),
        "Logger initialized"
    );

    Ok(dir)
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FrontendLogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

#[tauri::command]
pub fn log_frontend_event(
    level: FrontendLogLevel,
    scope: String,
    message: String,
    context: Option<Value>,
) -> Result<(), String> {
    let context_json = context.map(|value| value.to_string());

    if let Some(context) = context_json.as_deref() {
        match level {
            FrontendLogLevel::Debug => {
                tracing::debug!(target: "frontend.event", scope = %scope, context = %context, "{}", message)
            }
            FrontendLogLevel::Info => {
                tracing::info!(target: "frontend.event", scope = %scope, context = %context, "{}", message)
            }
            FrontendLogLevel::Warn => {
                tracing::warn!(target: "frontend.event", scope = %scope, context = %context, "{}", message)
            }
            FrontendLogLevel::Error => {
                tracing::error!(target: "frontend.event", scope = %scope, context = %context, "{}", message)
            }
        }
    } else {
        match level {
            FrontendLogLevel::Debug => {
                tracing::debug!(target: "frontend.event", scope = %scope, "{}", message)
            }
            FrontendLogLevel::Info => {
                tracing::info!(target: "frontend.event", scope = %scope, "{}", message)
            }
            FrontendLogLevel::Warn => {
                tracing::warn!(target: "frontend.event", scope = %scope, "{}", message)
            }
            FrontendLogLevel::Error => {
                tracing::error!(target: "frontend.event", scope = %scope, "{}", message)
            }
        }
    }

    Ok(())
}
