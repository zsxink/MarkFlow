use super::*;
use std::fs;
use std::path::PathBuf;

fn temp_dir() -> PathBuf {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static COUNTER: AtomicUsize = AtomicUsize::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!(
        "markflow_pagination_test_{}_{}",
        std::process::id(),
        n
    ));
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
        let page = read_dir_page_inner(&dir, None, 10, None, &IgnoreMatcher::defaults()).unwrap();
        assert!(page.entries.iter().all(|entry| entry.name != "link.md"));
    }
    let _ = fs::remove_dir_all(&dir);
}
