use crate::commands::files::FileEntry;
use crate::commands::settings::load_settings_inner;
use crate::fs::ignore::{matcher_snapshot, IgnoreMatcher};
use crate::paths::normalize_path;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri::State;
use tracing::info;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPage {
    pub entries: Vec<FileEntry>,
    pub next_cursor: Option<String>,
    pub generation: String,
    pub truncated: bool,
}

fn directory_generation(dir: &Path) -> Result<String, String> {
    let metadata = fs::metadata(dir).map_err(|e| format!("Failed to inspect directory: {}", e))?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    Ok(format!("{}:{}", modified, metadata.len()))
}

fn entry_sort_key(entry: &FileEntry) -> String {
    format!(
        "{}\0{}\0{}",
        if entry.is_dir { 0 } else { 1 },
        entry.name.to_lowercase(),
        entry.path
    )
}

fn read_dir_page_inner(
    dir: &Path,
    cursor: Option<&str>,
    limit: usize,
    expected_generation: Option<&str>,
    matcher: &IgnoreMatcher,
) -> Result<DirectoryPage, String> {
    let generation = directory_generation(dir)?;
    if expected_generation.is_some_and(|expected| expected != generation) {
        return Err("DIRECTORY_CHANGED".into());
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| format!("Failed to read dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || matcher.is_ignored(dir, &path) {
            continue;
        }
        let metadata =
            fs::symlink_metadata(&path).map_err(|e| format!("Failed to inspect entry: {}", e))?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        entries.push(FileEntry {
            name,
            path: normalize_path(&path),
            is_dir: metadata.is_dir(),
            children: None,
        });
    }
    if directory_generation(dir)? != generation {
        return Err("DIRECTORY_CHANGED".into());
    }
    entries.sort_by_key(entry_sort_key);
    if let Some(cursor) = cursor {
        entries.retain(|entry| entry_sort_key(entry).as_str() > cursor);
    }
    let limit = limit.clamp(1, 5_000);
    let truncated = entries.len() > limit;
    entries.truncate(limit);
    let next_cursor =
        truncated.then(|| entry_sort_key(entries.last().expect("non-empty truncated page")));
    Ok(DirectoryPage {
        entries,
        next_cursor,
        generation,
        truncated,
    })
}

#[tauri::command]
pub fn read_dir(
    path: String,
    cursor: Option<String>,
    limit: Option<usize>,
    generation: Option<String>,
    state: State<AppState>,
) -> Result<DirectoryPage, String> {
    use crate::commands::files::{resolve_path, validate_path_in_workspace};

    let started = Instant::now();
    let dir = resolve_path(&path, &state)?;
    if !dir.is_dir() {
        return Err("Not a directory".into());
    }
    validate_path_in_workspace(&dir, &state)?;
    let settings = load_settings_inner();
    let matcher = matcher_snapshot(&settings.file_tree_ignore_patterns);
    let page = read_dir_page_inner(
        &dir,
        cursor.as_deref(),
        limit.unwrap_or(settings.file_tree_page_size),
        generation.as_deref(),
        &matcher,
    )?;
    info!(target: "backend.file_tree", path = %normalize_path(&dir), elapsed_ms = started.elapsed().as_millis() as u64,
        entries = page.entries.len(), truncated = page.truncated, "Read shallow directory page");
    Ok(page)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir() -> PathBuf {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("markflow_test_{}_{}", std::process::id(), n));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn shallow_pages_are_stable_bounded_and_non_overlapping() {
        let dir = temp_dir();
        for name in ["c.md", "a.md", "b.md"] {
            fs::write(dir.join(name), name).unwrap();
        }
        fs::create_dir(dir.join("folder")).unwrap();
        fs::create_dir(dir.join("node_modules")).unwrap();
        let matcher = IgnoreMatcher::defaults();
        let first = read_dir_page_inner(&dir, None, 2, None, &matcher).unwrap();
        assert_eq!(first.entries.len(), 2);
        assert!(first.truncated);
        assert_eq!(first.entries[0].name, "folder");
        let second = read_dir_page_inner(
            &dir,
            first.next_cursor.as_deref(),
            2,
            Some(&first.generation),
            &matcher,
        )
        .unwrap();
        assert_eq!(second.entries.len(), 2);
        assert!(first
            .entries
            .iter()
            .all(|a| second.entries.iter().all(|b| a.path != b.path)));
        assert!(first
            .entries
            .iter()
            .chain(second.entries.iter())
            .all(|entry| entry.name != "node_modules"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn shallow_page_rejects_stale_generation_and_filters_hidden_entries() {
        let dir = temp_dir();
        fs::write(dir.join("visible.md"), "content").unwrap();
        fs::write(dir.join(".hidden.md"), "content").unwrap();
        let matcher = IgnoreMatcher::defaults();
        let page = read_dir_page_inner(&dir, None, 10, None, &matcher).unwrap();
        assert_eq!(page.entries.len(), 1);
        assert_eq!(page.entries[0].name, "visible.md");
        assert_eq!(
            read_dir_page_inner(&dir, None, 10, Some("stale"), &matcher).unwrap_err(),
            "DIRECTORY_CHANGED"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn shallow_page_clamps_limit_and_sorts_case_insensitively() {
        let dir = temp_dir();
        for name in ["Z.md", "a.md", "B.md"] {
            fs::write(dir.join(name), name).unwrap();
        }
        let page = read_dir_page_inner(&dir, None, 1, None, &IgnoreMatcher::defaults()).unwrap();
        assert_eq!(page.entries.len(), 1);
        assert_eq!(page.entries[0].name, "a.md");
        assert!(page.truncated);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn shallow_page_filters_symlinks_when_platform_allows_creation() {
        let dir = temp_dir();
        let target = dir.join("target.md");
        fs::write(&target, "content").unwrap();
        let link = dir.join("link.md");
        #[cfg(unix)]
        let created = std::os::unix::fs::symlink(&target, &link).is_ok();
        #[cfg(windows)]
        let created = std::os::windows::fs::symlink_file(&target, &link).is_ok();
        if created {
            let page =
                read_dir_page_inner(&dir, None, 10, None, &IgnoreMatcher::defaults()).unwrap();
            assert!(page.entries.iter().all(|entry| entry.name != "link.md"));
        }
        let _ = fs::remove_dir_all(&dir);
    }
}
