use super::*;
use std::path::PathBuf;

#[test]
fn defaults_ignore_dependency_and_generated_directories() {
    let root = PathBuf::from("/workspace");
    let matcher = IgnoreMatcher::defaults();
    assert!(matcher.is_ignored(&root, &root.join("node_modules/pkg/index.js")));
    assert!(matcher.is_ignored(&root, &root.join("src/target/output")));
    assert!(!matcher.is_ignored(&root, &root.join("src/index.ts")));
}

#[test]
fn custom_wildcards_match_components_and_paths() {
    let root = PathBuf::from("/workspace");
    let matcher = IgnoreMatcher::new(&["*.cache".into(), "generated/*".into()]).unwrap();
    assert!(matcher.is_ignored(&root, &root.join("tmp.cache/a")));
    assert!(matcher.is_ignored(&root, &root.join("generated/api.ts")));
}

#[test]
fn invalid_patterns_are_rejected() {
    assert!(IgnoreMatcher::new(&["".into()]).is_err());
}

#[test]
fn invalid_update_keeps_last_valid_snapshot() {
    let root = PathBuf::from("/workspace");
    let valid = matcher_snapshot(&["cache".into()]);
    assert!(valid.is_ignored(&root, &root.join("cache/a")));
    let retained = matcher_snapshot(&["".into()]);
    assert!(retained.is_ignored(&root, &root.join("cache/a")));
}

fn poison_snapshot(snapshot: &Mutex<IgnoreMatcher>) {
    let poisoned = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _guard = snapshot.lock().unwrap();
        panic!("simulated panic while holding ignore snapshot lock");
    }));
    assert!(poisoned.is_err(), "expected simulated panic");
    assert!(snapshot.is_poisoned(), "expected poisoned snapshot lock");
}

#[test]
fn poisoned_snapshot_keeps_last_valid_matcher_without_panicking() {
    let root = PathBuf::from("/workspace");
    let snapshot = Mutex::new(IgnoreMatcher::new(&["cache".into()]).unwrap());
    poison_snapshot(&snapshot);

    let retained = update_snapshot(&snapshot, &["".into()]);
    assert!(retained.is_ignored(&root, &root.join("cache/a")));
    assert!(!snapshot.is_poisoned(), "poison mark should be cleared");
}

#[test]
fn poisoned_snapshot_accepts_valid_update_after_recovery() {
    let root = PathBuf::from("/workspace");
    let snapshot = Mutex::new(IgnoreMatcher::new(&["cache".into()]).unwrap());
    poison_snapshot(&snapshot);

    let updated = update_snapshot(&snapshot, &["build".into()]);
    assert!(updated.is_ignored(&root, &root.join("build/a")));
    assert!(!updated.is_ignored(&root, &root.join("cache/a")));
    assert!(!snapshot.is_poisoned(), "poison mark should be cleared");
}
