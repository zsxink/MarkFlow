use super::*;
use notify::event::{CreateKind, ModifyKind};

#[test]
fn maps_batches_and_ignores_dependency_directories() {
    let root = PathBuf::from("/workspace");
    let event = Event::new(EventKind::Create(CreateKind::File))
        .add_path(root.join("a.md"))
        .add_path(root.join("node_modules/pkg.js"));
    let changes = normalize_event(event, &root, &IgnoreMatcher::defaults());
    assert_eq!(changes.len(), 1);
    assert_eq!(changes[0].kind, "create");
}

#[test]
fn pairs_rename_both_and_recovers_unpaired_rename() {
    let root = PathBuf::from("/workspace");
    let both = Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::Both)))
        .add_path(root.join("old.md"))
        .add_path(root.join("new.md"));
    let changes = normalize_event(both, &root, &IgnoreMatcher::defaults());
    assert_eq!(changes[0].kind, "rename");
    assert!(changes[0].to_path.as_deref().unwrap().ends_with("new.md"));
    let from = Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::From)))
        .add_path(root.join("src/old.md"));
    let recovery = normalize_event(from, &root, &IgnoreMatcher::defaults());
    assert_eq!(recovery[0].kind, "rescan");
    assert_eq!(PathBuf::from(&recovery[0].path), root.join("src"));
    assert_eq!(
        normalize_event(
            Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::Both)))
                .add_path(root.join("node_modules/a"))
                .add_path(root.join("a")),
            &root,
            &IgnoreMatcher::defaults()
        )[0]
        .kind,
        "create"
    );
}

#[test]
fn coalesces_duplicate_modifies_and_delete_supersedes_modify() {
    let base = FileChangeEvent {
        path: "/a.md".into(),
        kind: "modify".into(),
        timestamp: 1,
        to_path: None,
        reason: None,
    };
    let delete = FileChangeEvent {
        kind: "delete".into(),
        timestamp: 2,
        ..base.clone()
    };
    let result = coalesce(vec![base.clone(), base, delete]);
    assert_eq!(
        result,
        vec![FileChangeEvent {
            path: "/a.md".into(),
            kind: "delete".into(),
            timestamp: 2,
            to_path: None,
            reason: None
        }]
    );
}

#[test]
fn bounded_enqueue_reports_overflow_without_growing_queue() {
    let (tx, _rx) = mpsc::sync_channel(1);
    let len = AtomicUsize::new(0);
    let peak = AtomicUsize::new(0);
    let overflows = AtomicUsize::new(0);
    assert!(enqueue_bounded(&tx, 1, &len, &peak, &overflows).is_ok());
    assert_eq!(enqueue_bounded(&tx, 2, &len, &peak, &overflows), Err(2));
    assert_eq!(len.load(Ordering::Relaxed), 1);
    assert_eq!(peak.load(Ordering::Relaxed), 1);
    assert_eq!(overflows.load(Ordering::Relaxed), 1);
}

#[test]
fn overflow_recovery_uses_minimal_common_ancestor() {
    let root = PathBuf::from("/workspace");
    assert_eq!(
        minimal_rescan_path(
            &root,
            &[root.join("src/a.md"), root.join("src/nested/b.md")]
        ),
        root.join("src")
    );
    assert_eq!(
        minimal_rescan_path(&root, &[root.join("src/a.md"), root.join("docs/b.md")]),
        root
    );
}

#[test]
fn sustained_overflow_keeps_constant_size_recovery_scope() {
    let root = PathBuf::from("/workspace");
    let mut scope = None;
    for index in 0..100_000 {
        scope = Some(merge_recovery_scope(
            &root,
            scope,
            &root.join(format!("src/group-{}/file.md", index % 10)),
        ));
    }
    assert_eq!(scope, Some(root.join("src")));
    assert_eq!(
        std::mem::size_of_val(&scope),
        std::mem::size_of::<Option<PathBuf>>()
    );
}

#[test]
fn event_storm_coalesces_and_ignored_storm_is_filtered() {
    let root = PathBuf::from("/workspace");
    let matcher = IgnoreMatcher::defaults();
    let mut changes = Vec::new();
    for _ in 0..1000 {
        changes.extend(normalize_event(
            Event::new(EventKind::Modify(ModifyKind::Data(
                notify::event::DataChange::Any,
            )))
            .add_path(root.join("src/a.md")),
            &root,
            &matcher,
        ));
        changes.extend(normalize_event(
            Event::new(EventKind::Modify(ModifyKind::Data(
                notify::event::DataChange::Any,
            )))
            .add_path(root.join("target/a.o")),
            &root,
            &matcher,
        ));
    }
    let merged = coalesce(changes);
    assert_eq!(merged.len(), 1);
    assert!(merged[0].path.ends_with("src/a.md"));
}

#[test]
fn acquire_recovery_scope_returns_takeable_guard_when_healthy() {
    let scope = Mutex::new(Some(PathBuf::from("/workspace/src")));
    let mut guard = acquire_recovery_scope(&scope).expect("healthy lock should yield a guard");
    assert_eq!(guard.take(), Some(PathBuf::from("/workspace/src")));
    drop(guard);
    assert_eq!(*scope.lock().unwrap(), None);
}

#[test]
fn poisoned_recovery_scope_is_discarded_and_poison_cleared() {
    let scope = Mutex::new(Some(PathBuf::from("/workspace/src")));
    let poisoned = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _guard = scope.lock().unwrap();
        panic!("simulated panic while holding recovery scope lock");
    }));
    assert!(poisoned.is_err(), "expected simulated panic");
    assert!(scope.is_poisoned(), "expected poisoned recovery scope lock");

    assert!(acquire_recovery_scope(&scope).is_none());
    assert!(!scope.is_poisoned(), "poison mark should be cleared");
    assert_eq!(
        *scope.lock().unwrap(),
        None,
        "scope value should be cleared"
    );

    // A later overflow can accumulate a fresh scope from a clean state.
    let mut guard = acquire_recovery_scope(&scope).expect("recovered lock should yield a guard");
    *guard = Some(PathBuf::from("/workspace/docs"));
    drop(guard);
    assert_eq!(
        *scope.lock().unwrap(),
        Some(PathBuf::from("/workspace/docs"))
    );
}

#[test]
fn emitting_after_stop_is_safe_no_panic() {
    // stop() must be idempotent and safe to call twice.
    let dir = std::env::temp_dir().join(format!("markflow-watch-test2-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&dir);
    let mut watcher =
        FileWatcher::new(dir.clone(), IgnoreMatcher::defaults(), |_event| {}).unwrap();
    watcher.stop();
    watcher.stop(); // second call must be a no-op
    let _ = std::fs::remove_dir_all(&dir);
}
