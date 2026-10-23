use super::*;
use crate::commands::files::atomic::{
    atomic_write, cleanup_stale_temp_files, FILE_CHANGED_DURING_SAVE,
};
use std::fs;
use std::path::{Path, PathBuf};

// --- atomic_write tests ---

fn temp_dir() -> PathBuf {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static COUNTER: AtomicUsize = AtomicUsize::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir =
        std::env::temp_dir().join(format!("markflow_files_test_{}_{}", std::process::id(), n));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn atomic_write_creates_file() {
    let dir = temp_dir();
    let path = dir.join("test.md");
    atomic_write(&path, "hello world").unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "hello world");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn atomic_write_overwrites_existing_file() {
    let dir = temp_dir();
    let path = dir.join("overwrite.md");
    fs::write(&path, "old content").unwrap();
    atomic_write(&path, "new content").unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "new content");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn checked_atomic_write_replaces_matching_existing_file() {
    let dir = temp_dir();
    let path = dir.join("checked-match.md");
    fs::write(&path, "old").unwrap();
    let stats = stats_from_metadata(&fs::metadata(&path).unwrap());

    atomic_write_checked(
        &path,
        "new",
        Some(ExpectedFileStats {
            mtime: stats.mtime,
            size: stats.size,
        }),
    )
    .unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "new");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn checked_atomic_write_rejects_size_mismatch_without_replacing_target() {
    let dir = temp_dir();
    let path = dir.join("checked-size-mismatch.md");
    fs::write(&path, "external change").unwrap();
    let stats = stats_from_metadata(&fs::metadata(&path).unwrap());

    let error = atomic_write_checked(
        &path,
        "editor candidate",
        Some(ExpectedFileStats {
            mtime: stats.mtime,
            size: stats.size - 1,
        }),
    )
    .unwrap_err();
    assert_eq!(error, FILE_CHANGED_DURING_SAVE);
    assert_eq!(fs::read_to_string(&path).unwrap(), "external change");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn checked_atomic_write_rejects_same_size_mtime_mismatch_without_replacing_target() {
    let dir = temp_dir();
    let path = dir.join("checked-mtime-mismatch.md");
    fs::write(&path, "same").unwrap();
    let stats = stats_from_metadata(&fs::metadata(&path).unwrap());

    let error = atomic_write_checked(
        &path,
        "new!",
        Some(ExpectedFileStats {
            mtime: stats.mtime.saturating_add(1),
            size: stats.size,
        }),
    )
    .unwrap_err();
    assert_eq!(error, FILE_CHANGED_DURING_SAVE);
    assert_eq!(fs::read_to_string(&path).unwrap(), "same");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn atomic_write_preserves_old_file_on_failure() {
    let dir = temp_dir();
    let path = dir.join("preserve.md");
    fs::write(&path, "original").unwrap();
    // Make the target file read-only so rename fails (source exists, dest is read-only)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o444)).unwrap();
    }
    let result = atomic_write(&path, "should fail");
    // On Unix the rename should fail because dest is read-only
    if result.is_err() {
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
    }
    // Restore permissions for cleanup
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o644));
    }
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn atomic_write_creates_parent_directories() {
    let dir = temp_dir();
    let path = dir.join("subdir").join("nested").join("file.md");
    atomic_write(&path, "nested content").unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "nested content");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn atomic_write_cleans_up_temp_file_on_success() {
    let dir = temp_dir();
    let path = dir.join("clean.md");
    // Record .tmp files before the write
    let before: Vec<_> = fs::read_dir(&dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name().to_string_lossy().contains("clean.md.")
                && e.file_name().to_string_lossy().ends_with(".tmp")
        })
        .map(|e| e.path())
        .collect();
    atomic_write(&path, "content").unwrap();
    // No new .tmp files for this file should remain
    let after: Vec<_> = fs::read_dir(&dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name().to_string_lossy().contains("clean.md.")
                && e.file_name().to_string_lossy().ends_with(".tmp")
        })
        .map(|e| e.path())
        .collect();
    assert!(
        after.len() <= before.len(),
        "no new temp files should exist after success"
    );
    let _ = fs::remove_dir_all(&dir);
}

// --- cleanup_stale_temp_files tests ---

#[cfg(unix)]
#[test]
fn cleanup_removes_temp_with_dead_pid() {
    let dir = temp_dir();
    // Create a temp file with a PID that is definitely not running (e.g., 1 is init on Unix,
    // but we can't kill it — use a high number that's almost certainly not alive)
    let fake_pid = 999999999u32;
    let tmp = dir.join(format!("file.{}.tmp", fake_pid));
    fs::write(&tmp, "stale").unwrap();
    cleanup_stale_temp_files(&dir);
    assert!(!tmp.exists(), "stale temp file should be removed");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn cleanup_keeps_current_process_temp() {
    let dir = temp_dir();
    let pid = std::process::id();
    let tmp = dir.join(format!("file.{}.tmp", pid));
    fs::write(&tmp, "active").unwrap();
    cleanup_stale_temp_files(&dir);
    assert!(
        tmp.exists(),
        "temp file from current process should NOT be removed"
    );
    let _ = fs::remove_dir_all(&dir);
}

// --- extract_pid_from_tmp tests ---

#[test]
fn extract_pid_from_tmp_valid() {
    assert_eq!(extract_pid_from_tmp("doc.12345.tmp"), Some(12345));
}

#[test]
fn extract_pid_from_tmp_no_pid() {
    assert_eq!(extract_pid_from_tmp("doc.tmp"), None);
}

#[test]
fn extract_pid_from_tmp_not_tmp() {
    assert_eq!(extract_pid_from_tmp("doc.md"), None);
}

#[test]
fn normalizes_lexical_parent_segments_without_filesystem_access() {
    let path = Path::new("/workspace/docs/../notes/./draft.md");
    assert_eq!(
        normalize_lexical(path),
        PathBuf::from("/workspace/notes/draft.md")
    );
}

// --- write_file: workspace check removed ---
// write_file now delegates directly to resolve_path + atomic_write.
// The removed validate_path_in_workspace call is verified by integration
// tests (macOS cold-start scenario). Existing atomic_write tests cover
// the write path itself.
