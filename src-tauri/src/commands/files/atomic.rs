//! Atomic write with a verified-document guard.
//!
//! A document save must never leave a half-written file, and a verified save
//! must never clobber a target that changed after the frontend captured its
//! disk identity.

use crate::paths::normalize_path;
use std::fs;
use std::path::Path;

/// Stable, content-free error reported when a verified document changed after
/// the frontend captured its disk identity.  Callers must treat this as a
/// conflict, never as a retryable successful save.
pub const FILE_CHANGED_DURING_SAVE: &str = "FILE_CHANGED_DURING_SAVE";

#[derive(Debug, Clone, Copy, serde::Deserialize)]
pub struct ExpectedFileStats {
    pub mtime: u64,
    pub size: u64,
}

pub(crate) fn stats_from_metadata(metadata: &fs::Metadata) -> crate::commands::files::FileStats {
    let mtime = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    crate::commands::files::FileStats {
        mtime,
        size: metadata.len(),
    }
}

/// Write `content` to `path` atomically via temp-file + rename.
///
/// 1. Create a temp file in the same directory (`{name}.{pid}.tmp`)
/// 2. Write + `sync_all()` the temp file
/// 3. `fs::rename()` to the target (POSIX-atomic)
/// 4. On any failure the temp file is cleaned up and the original remains intact.
pub fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    atomic_write_checked(path, content, None)
}

/// Write through a same-directory temp file and, for a verified existing
/// document, compare its source identity immediately before the final rename.
///
/// The comparison deliberately lives in the backend command rather than in a
/// separate frontend stat call: image staging can take time, and a second
/// process may modify the target during that interval.  A mismatch removes the
/// temporary file and leaves the original target untouched.
pub(crate) fn atomic_write_checked(
    path: &Path,
    content: &str,
    expected: Option<ExpectedFileStats>,
) -> Result<(), String> {
    let parent = path.parent().ok_or("Cannot determine parent directory")?;
    fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;

    let file_name = path
        .file_name()
        .ok_or("Cannot determine file name")?
        .to_string_lossy();
    let pid = std::process::id();
    let tmp_name = format!("{}.{}.tmp", file_name, pid);
    let tmp_path = parent.join(&tmp_name);

    // Write to temp file
    let result = (|| -> Result<(), String> {
        {
            let mut file = fs::File::create(&tmp_path)
                .map_err(|e| format!("Failed to create temp file: {}", e))?;
            use std::io::Write;
            file.write_all(content.as_bytes())
                .map_err(|e| format!("Failed to write temp file: {}", e))?;
            file.sync_all()
                .map_err(|e| format!("Failed to sync temp file: {}", e))?;
        }
        if let Some(expected) = expected {
            let actual = fs::metadata(path)
                .map(|metadata| stats_from_metadata(&metadata))
                .map_err(|_| FILE_CHANGED_DURING_SAVE.to_string())?;
            if actual.mtime != expected.mtime || actual.size != expected.size {
                return Err(FILE_CHANGED_DURING_SAVE.to_string());
            }
        }
        // Atomic rename — on POSIX this is always atomic; on Windows uses
        // MOVEFILE_REPLACE_EXISTING via the `winapi` crate internally.
        fs::rename(&tmp_path, path).map_err(|e| format!("Failed to rename temp file: {}", e))?;
        Ok(())
    })();

    if result.is_err() {
        // Best-effort cleanup of temp file
        let _ = fs::remove_file(&tmp_path);
    }
    result
}

/// Remove stale `.tmp` files left by a previous crash.
///
/// A temp file is considered stale if:
/// - Its name matches `{anything}.{pid}.tmp` and `pid` is not a running process, OR
/// - It does not match the `{anything}.{pid}.tmp` pattern and is older than `STALE_THRESHOLD`.
pub fn cleanup_stale_temp_files(dir: &Path) {
    use std::time::Duration;

    const STALE_THRESHOLD: Duration = Duration::from_secs(60); // 1 minute

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if !name_str.ends_with(".tmp") {
            continue;
        }

        #[cfg(unix)]
        let stale = if let Some(pid) = extract_pid_from_tmp(&name_str) {
            !is_pid_alive(pid)
        } else {
            is_file_older_than(&entry, STALE_THRESHOLD)
        };
        // On non-Unix we can't reliably check process liveness, so every
        // .tmp file is cleaned based on age alone — including PID-pattern
        // files from the current process, which we must guard against.
        #[cfg(not(unix))]
        let stale = {
            let is_own_pid = extract_pid_from_tmp(&name_str)
                .map(|pid| pid == std::process::id())
                .unwrap_or(false);
            !is_own_pid && is_file_older_than(&entry, STALE_THRESHOLD)
        };

        if stale {
            let _ = fs::remove_file(entry.path());
            tracing::info!(
                target: "backend.files",
                path = %normalize_path(&entry.path()),
                "Cleaned up stale temp file"
            );
        }
    }
}

/// Extract PID from temp file name pattern `{name}.{pid}.tmp`.
/// Returns `None` if the name doesn't match the `{something}.{pid}.tmp` format
/// (e.g. bare `12345.tmp` without a name prefix).
pub(crate) fn extract_pid_from_tmp(name: &str) -> Option<u32> {
    let stem = name.strip_suffix(".tmp")?;
    let pid_str = stem.rsplit('.').next()?;
    // Guard: if there's no dot in the stem, `rsplit` returns the whole stem,
    // meaning the name is just `{number}.tmp` — not our `{name}.{pid}.tmp` format.
    if pid_str == stem {
        return None;
    }
    pid_str.parse::<u32>().ok()
}

/// Check if a Unix process is still alive (signal 0).
#[cfg(unix)]
fn is_pid_alive(pid: u32) -> bool {
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

/// Check whether a filesystem entry was last modified more than `threshold` ago.
fn is_file_older_than(entry: &fs::DirEntry, threshold: std::time::Duration) -> bool {
    entry
        .metadata()
        .and_then(|m| m.modified())
        .map(|t| t.elapsed().unwrap_or_default() > threshold)
        .unwrap_or(false)
}
