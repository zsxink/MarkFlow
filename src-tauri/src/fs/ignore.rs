use std::path::Path;
use std::sync::{Mutex, OnceLock};

use tracing::warn;

use crate::config::settings::default_file_tree_ignore_patterns;
use crate::error::lock_mutex_infallible;

#[derive(Clone, Debug)]
pub struct IgnoreMatcher {
    patterns: Vec<String>,
}

impl IgnoreMatcher {
    pub fn new(patterns: &[String]) -> Result<Self, String> {
        if patterns
            .iter()
            .any(|pattern| pattern.trim().is_empty() || pattern.contains('\0'))
        {
            return Err("Ignore patterns must be non-empty and contain no NUL bytes".into());
        }
        Ok(Self {
            patterns: patterns.iter().map(|p| p.replace('\\', "/")).collect(),
        })
    }

    pub fn defaults() -> Self {
        Self::new(&default_file_tree_ignore_patterns()).expect("default ignore patterns are valid")
    }

    pub fn is_ignored(&self, root: &Path, path: &Path) -> bool {
        let relative = path.strip_prefix(root).unwrap_or(path);
        let normalized = relative.to_string_lossy().replace('\\', "/");
        normalized.split('/').any(|component| {
            self.patterns
                .iter()
                .any(|pattern| matches_component(pattern, component, &normalized))
        })
    }
}

pub fn matcher_snapshot(patterns: &[String]) -> IgnoreMatcher {
    static SNAPSHOT: OnceLock<Mutex<IgnoreMatcher>> = OnceLock::new();
    let snapshot = SNAPSHOT.get_or_init(|| Mutex::new(IgnoreMatcher::defaults()));
    update_snapshot(snapshot, patterns)
}

/// Update the shared ignore matcher snapshot, recovering from a poisoned lock
/// instead of panicking. `lock_mutex_infallible` recovers poisoned state via
/// `into_inner()`, so acquisition cannot fail: poisoning only adds a recovery
/// log, and the update then follows the normal pattern rules — a valid pattern
/// set replaces the snapshot, an invalid one keeps the previous matcher.
fn update_snapshot(snapshot: &Mutex<IgnoreMatcher>, patterns: &[String]) -> IgnoreMatcher {
    let mut current = lock_mutex_infallible(snapshot);
    // Sample poison state AFTER acquiring the guard: a mutex poisoned before
    // acquisition still reports `is_poisoned()` here (the flag stays set until
    // `clear_poison()`), while a poison after acquisition cannot be observed —
    // nor does it need to be, since this guard was already granted.
    if snapshot.is_poisoned() {
        warn!(
            target: "backend.lock",
            "Ignore matcher snapshot lock was poisoned; recovering snapshot and resuming update"
        );
        snapshot.clear_poison();
    }
    match IgnoreMatcher::new(patterns) {
        Ok(next) => {
            *current = next.clone();
            next
        }
        Err(_) => current.clone(),
    }
}

fn matches_component(pattern: &str, component: &str, relative: &str) -> bool {
    if pattern.contains('/') {
        wildcard_match(pattern, relative)
    } else {
        wildcard_match(pattern, component)
    }
}

fn wildcard_match(pattern: &str, value: &str) -> bool {
    let (mut p, mut v, mut star, mut matched) = (0, 0, None, 0);
    let pattern = pattern.as_bytes();
    let value = value.as_bytes();
    while v < value.len() {
        if p < pattern.len() && (pattern[p] == b'?' || pattern[p] == value[v]) {
            p += 1;
            v += 1;
        } else if p < pattern.len() && pattern[p] == b'*' {
            star = Some(p);
            p += 1;
            matched = v;
        } else if let Some(s) = star {
            p = s + 1;
            matched += 1;
            v = matched;
        } else {
            return false;
        }
    }
    while p < pattern.len() && pattern[p] == b'*' {
        p += 1;
    }
    p == pattern.len()
}

#[cfg(test)]
mod tests {
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
}
