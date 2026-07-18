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

/// Install a panic hook that records the panic location and message with
/// structured context before deferring to the default hook. Registered once.
pub fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<unknown>".into());
        let message = match info.payload().downcast_ref::<&str>() {
            Some(s) => redact_message(s),
            None => match info.payload().downcast_ref::<String>() {
                Some(s) => redact_message(s),
                None => "<non-string panic payload>".into(),
            },
        };
        tracing::error!(
            target: "backend.panic",
            location = %location,
            message = %message,
            "Thread panicked"
        );
        default_hook(info);
    }));
}

/// Redact sensitive content from a log message string:
/// - Mask URL query strings / secrets (`?...` and `@user:pass@`).
/// - Mask the filename of private absolute file paths (keep one parent dir
///   for diagnosis, drop the rest of the home/dir prefix).
/// - Truncate long document-like bodies.
///
/// We operate on the whole message conservatively to avoid leaking private path
/// contents or embedded secrets.
fn redact_message(message: &str) -> String {
    let truncated = if message.len() > 500 {
        format!(
            "{}…[truncated {} chars]",
            &message[..500],
            message.len() - 500
        )
    } else {
        message.to_string()
    };
    let url_redacted = redact_url_secrets(&truncated);
    redact_private_paths(&url_redacted)
}

/// Mask the filename of a private absolute path, keeping only the immediate
/// parent directory for diagnostic context. e.g.
/// `/Users/alice/docs/note.md` -> `.../docs/<redacted-file>`. Short absolute
/// paths (`/tmp/note.md`, 2 components) and relative paths carry no private
/// home/prefix worth hiding, so they are left untouched.
fn redact_private_paths(input: &str) -> String {
    // URLs are handled separately; skip to avoid masking inside `https://…`.
    if input.contains("://") {
        return input.to_string();
    }
    let mut out = String::with_capacity(input.len());
    for segment in input.split_whitespace() {
        if let Some(masked) = mask_path_if_private(segment) {
            out.push_str(&masked);
        } else {
            out.push_str(segment);
        }
        out.push(' ');
    }
    out.trim_end().to_string()
}

fn mask_path_if_private(path: &str) -> Option<String> {
    if !path.starts_with('/') {
        return None;
    }
    let p = Path::new(path);
    let parent = p.parent()?;
    let file_name = p.file_name()?;
    // Require at least 3 components (e.g. /a/b/file) so short generic paths
    // like /tmp/note.md stay intact — only deeper paths reveal a private prefix.
    let components: Vec<_> = p.components().collect();
    if components.len() < 4 {
        return None;
    }
    let last_dir = parent.file_name()?.to_string_lossy().into_owned();
    let _ = file_name;
    Some(format!(".../{}/<redacted-file>", last_dir))
}

/// Mask URL query strings (`?...`) and embedded credentials (`user:pass@`
/// or a bare token `token@host`).
fn redact_url_secrets(input: &str) -> String {
    // Mask credential segment: scheme://user:pass@host -> scheme://***@host
    let cred_replaced = if let Some(idx) = input.find("://") {
        let rest = &input[idx + 3..];
        if let Some(at) = rest.find('@') {
            if at > 0 {
                // Any non-empty segment before '@' is a credential/token to mask.
                let pre = &input[..idx + 3];
                let post = &rest[at..];
                format!("{pre}***{post}")
            } else {
                input.to_string()
            }
        } else {
            input.to_string()
        }
    } else {
        input.to_string()
    };
    // Mask query strings: url?secret=... -> url?<redacted>
    match cred_replaced.find('?') {
        Some(q) => format!("{}?<redacted>", &cred_replaced[..q]),
        None => cred_replaced,
    }
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
    install_panic_hook();

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_url_credentials() {
        assert_eq!(
            redact_url_secrets("https://user:secret@example.com/path"),
            "https://***@example.com/path"
        );
    }

    #[test]
    fn masks_bare_token_without_colon() {
        // A token with no ':' before '@' is still a credential and must be masked.
        assert_eq!(
            redact_url_secrets("https://token@example.com/path"),
            "https://***@example.com/path"
        );
    }

    #[test]
    fn masks_query_strings() {
        assert_eq!(
            redact_url_secrets("https://example.com/api?token=abc123&x=1"),
            "https://example.com/api?<redacted>"
        );
    }

    #[test]
    fn masks_credentials_and_query() {
        assert_eq!(
            redact_url_secrets("https://user:pass@host/api?key=zzz"),
            "https://***@host/api?<redacted>"
        );
    }

    #[test]
    fn masks_private_path_filename() {
        // Private absolute path: filename masked, one parent dir kept for context,
        // user home prefix collapsed to '...'.
        let out = redact_message("/Users/alice/docs/note.md");
        assert_eq!(out, ".../docs/<redacted-file>");
    }

    #[test]
    fn leaves_short_paths_untouched() {
        // Too few components to reveal private home/prefix — left as-is.
        assert_eq!(redact_message("/tmp/note.md"), "/tmp/note.md");
        assert_eq!(redact_message("note.md"), "note.md");
        assert_eq!(
            redact_message("relative/path/note.md"),
            "relative/path/note.md"
        );
    }

    #[test]
    fn masks_path_inside_redacted_url_message() {
        // A path embedded in a free-text message (with trailing punctuation) is
        // still masked as a whole token.
        let out = redact_message("Failed to open /Users/alice/docs/note.md: permission denied");
        assert!(out.contains(".../docs/<redacted-file>"));
        assert!(!out.contains("note.md"));
    }

    #[test]
    fn truncates_long_message() {
        let long = "x".repeat(600);
        let out = redact_message(&long);
        assert!(out.contains("truncated"));
        assert!(out.len() < long.len());
    }
}
