use super::*;
use crate::commands::files::entry::is_supported_browser_entry;
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
    let first = read_dir_page_inner(&dir, None, 2, None, &matcher, true).unwrap();
    assert_eq!(first.entries.len(), 2);
    assert!(first.truncated);
    assert_eq!(first.entries[0].name, "folder");
    let second = read_dir_page_inner(
        &dir,
        first.next_cursor.as_deref(),
        2,
        Some(&first.generation),
        &matcher,
        true,
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
    let page = read_dir_page_inner(&dir, None, 10, None, &matcher, true).unwrap();
    assert_eq!(page.entries.len(), 1);
    assert_eq!(page.entries[0].name, "visible.md");
    assert_eq!(
        read_dir_page_inner(&dir, None, 10, Some("stale"), &matcher, true).unwrap_err(),
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
    let page = read_dir_page_inner(&dir, None, 1, None, &IgnoreMatcher::defaults(), true).unwrap();
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
            read_dir_page_inner(&dir, None, 10, None, &IgnoreMatcher::defaults(), true).unwrap();
        assert!(page.entries.iter().all(|entry| entry.name != "link.md"));
    }
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn hidden_files_setting_filters_unsupported_formats_and_keeps_directories() {
    let dir = temp_dir();
    for name in [
        "note.md",
        "photo.PNG",
        "pic.webp",
        "icon.svg",
        "data.txt",
        "table.CSV",
        "noextension",
        "archive.tar.gz",
    ] {
        fs::write(dir.join(name), "content").unwrap();
    }
    fs::create_dir(dir.join("folder")).unwrap();
    let page =
        read_dir_page_inner(&dir, None, 50, None, &IgnoreMatcher::defaults(), false).unwrap();
    let mut names: Vec<&str> = page
        .entries
        .iter()
        .map(|entry| entry.name.as_str())
        .collect();
    names.sort_unstable();
    assert_eq!(
        names,
        vec!["folder", "icon.svg", "note.md", "photo.PNG", "pic.webp"]
    );
    assert!(
        page.entries
            .iter()
            .find(|e| e.name == "folder")
            .unwrap()
            .is_dir
    );
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn shown_unsupported_files_setting_returns_every_entry() {
    let dir = temp_dir();
    for name in ["note.md", "photo.PNG", "data.txt", "noextension"] {
        fs::write(dir.join(name), "content").unwrap();
    }
    let page = read_dir_page_inner(&dir, None, 50, None, &IgnoreMatcher::defaults(), true).unwrap();
    assert_eq!(page.entries.len(), 4);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn browser_support_predicate_matches_the_frontend_contract() {
    // Mirrors `IMAGE_EXTENSIONS` in src/utils/openable-files.ts — the TS and
    // Rust lists must stay in sync, so both sides assert the same entries.
    for name in [
        "a.md", "a.MD", "a.svg", "a.JPG", "a.jpeg", "a.PNG", "a.gif", "a.WebP", "a.bmp", "a.b.png",
    ] {
        assert!(
            is_supported_browser_entry(name),
            "{name} should be supported"
        );
    }
    for name in [
        "a.txt",
        "a.csv",
        "noextension",
        "trailing.",
        "archive.tar.gz",
    ] {
        assert!(!is_supported_browser_entry(name), "{name} should be hidden");
    }
}
