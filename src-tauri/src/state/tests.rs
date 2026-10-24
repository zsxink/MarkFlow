use super::*;

#[test]
fn set_workspace_switches_without_leaking_watcher_thread() {
    let state = AppState::new().unwrap();
    let dir_a = std::env::temp_dir().join(format!("markflow-ws-a-{}", std::process::id()));
    let dir_b = std::env::temp_dir().join(format!("markflow-ws-b-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&dir_a);
    let _ = std::fs::create_dir_all(&dir_b);

    state.set_workspace(dir_a.clone(), |_event| {});
    state.set_workspace(dir_b.clone(), |_event| {});
    // Switching again must not panic and must leave exactly one active watcher.
    state.set_workspace(dir_a.clone(), |_event| {});

    assert_eq!(state.get_workspace(), Some(dir_a.clone()));

    state.stop_all();
    let _ = std::fs::remove_dir_all(&dir_a);
    let _ = std::fs::remove_dir_all(&dir_b);
}

#[test]
fn stop_all_is_safe_to_call_repeatedly() {
    let state = AppState::new().unwrap();
    state.stop_all();
    state.stop_all();
}

#[test]
fn clear_workspace_drops_the_session_root_and_is_safe_to_repeat() {
    let state = AppState::new().unwrap();
    let dir = std::env::temp_dir().join(format!("markflow-ws-clear-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&dir);

    state.set_workspace(dir.clone(), |_event| {});
    assert!(state.get_workspace().is_some());

    state.clear_workspace();
    // Closing again without a workspace must be a no-op, not a panic.
    state.clear_workspace();

    assert_eq!(state.get_workspace(), None);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn closed_workspace_settings_no_longer_restore_a_last_workspace() {
    let current = crate::config::settings::Settings {
        last_workspace: Some("/tmp/markflow-ws".into()),
        ..crate::config::settings::Settings::default()
    };
    let persisted = settings_without_last_workspace(&current);
    assert_eq!(persisted.last_workspace, None);
}

#[test]
fn opened_paths_wait_for_a_live_ready_frontend_and_drain_in_order() {
    let state = AppState::new().unwrap();
    state
        .dispatch_open_paths(
            ["a.md".to_string(), "b.md".to_string()],
            ["main".to_string()],
            |_, _| panic!("frontend is not ready"),
        )
        .unwrap();
    state.mark_window_ready("main").unwrap();
    let mut delivered = Vec::new();
    state
        .dispatch_open_paths([], ["main".to_string()], |label, path| {
            delivered.push((label.to_string(), path.to_string()));
            Ok(())
        })
        .unwrap();
    assert_eq!(
        delivered,
        [
            ("main".into(), "a.md".into()),
            ("main".into(), "b.md".into())
        ]
    );
    assert!(state.cli_files.lock().unwrap().is_empty());
}

#[test]
fn opened_paths_prefer_main_but_route_to_another_ready_window_when_main_is_gone() {
    let state = AppState::new().unwrap();
    state.mark_window_ready("main").unwrap();
    state.mark_window_ready("window-a").unwrap();
    let mut delivered = Vec::new();
    state
        .dispatch_open_paths(
            ["a.md".to_string()],
            ["main".to_string(), "window-a".to_string()],
            |label, _| {
                delivered.push(label.to_string());
                Ok(())
            },
        )
        .unwrap();
    // Even a stale ready entry must not cause delivery to an absent main.
    state
        .dispatch_open_paths(
            ["b.md".to_string()],
            ["window-a".to_string()],
            |label, _| {
                delivered.push(label.to_string());
                Ok(())
            },
        )
        .unwrap();
    assert_eq!(delivered, ["main", "window-a"]);
}

#[test]
fn stale_live_snapshot_does_not_unregister_a_newly_ready_window() {
    let state = AppState::new().unwrap();
    state.mark_window_ready("window-a").unwrap();
    state
        .dispatch_open_paths(["a.md".to_string()], [], |_, _| {
            panic!("snapshot does not include window yet")
        })
        .unwrap();
    let mut delivered = Vec::new();
    state
        .dispatch_open_paths([], ["window-a".to_string()], |_, path| {
            delivered.push(path.to_string());
            Ok(())
        })
        .unwrap();
    assert_eq!(delivered, ["a.md"]);
}

#[test]
fn destroyed_window_readiness_is_removed_and_new_window_must_be_ready() {
    let state = AppState::new().unwrap();
    state.mark_window_ready("main").unwrap();
    state.remove_window("main");
    state
        .dispatch_open_paths(["a.md".to_string()], ["window-a".to_string()], |_, _| {
            panic!("new window is not ready")
        })
        .unwrap();
    state.mark_window_ready("window-a").unwrap();
    let mut delivered = Vec::new();
    state
        .dispatch_open_paths([], ["window-a".to_string()], |label, path| {
            delivered.push((label.to_string(), path.to_string()));
            Ok(())
        })
        .unwrap();
    assert_eq!(delivered, [("window-a".into(), "a.md".into())]);
}

#[test]
fn failed_delivery_falls_back_without_losing_or_reordering_paths() {
    let state = AppState::new().unwrap();
    state.mark_window_ready("main").unwrap();
    state.mark_window_ready("window-a").unwrap();
    let mut delivered = Vec::new();
    state
        .dispatch_open_paths(
            ["a.md".to_string(), "b.md".to_string()],
            ["main".to_string(), "window-a".to_string()],
            |label, path| {
                if label == "main" {
                    return Err("window disappeared".into());
                }
                delivered.push(path.to_string());
                Ok(())
            },
        )
        .unwrap();
    assert_eq!(delivered, ["a.md", "b.md"]);
    assert!(state.cli_files.lock().unwrap().is_empty());
}

#[test]
fn failed_delivery_stays_queued_until_a_frontend_becomes_ready_again() {
    let state = AppState::new().unwrap();
    state.mark_window_ready("main").unwrap();
    state
        .dispatch_open_paths(["a.md".to_string()], ["main".to_string()], |_, _| {
            Err("window disappeared".into())
        })
        .unwrap();
    assert_eq!(*state.cli_files.lock().unwrap(), ["a.md"]);
    state.mark_window_ready("window-a").unwrap();
    let mut delivered = Vec::new();
    state
        .dispatch_open_paths([], ["window-a".to_string()], |_, path| {
            delivered.push(path.to_string());
            Ok(())
        })
        .unwrap();
    assert_eq!(delivered, ["a.md"]);
}

// --- Per-window close permission tests ---

#[test]
fn grant_for_window_a_does_not_grant_for_window_b() {
    let state = AppState::new().unwrap();
    state.grant_close_permission("window-a");
    // window-a has permission
    assert!(state.consume_close_permission("window-a"));
    // window-b must NOT have permission
    assert!(!state.consume_close_permission("window-b"));
}

#[test]
fn consumed_permission_is_removed_and_cannot_be_consumed_again() {
    let state = AppState::new().unwrap();
    state.grant_close_permission("main-1");
    assert!(state.consume_close_permission("main-1"));
    // Second consume must return false (already consumed)
    assert!(!state.consume_close_permission("main-1"));
}

#[test]
fn cleanup_removes_correct_label_without_affecting_others() {
    let state = AppState::new().unwrap();
    state.grant_close_permission("window-a");
    state.grant_close_permission("window-b");

    state.cleanup_close_permission("window-a");

    // window-a cleaned up
    assert!(!state.consume_close_permission("window-a"));
    // window-b still present
    assert!(state.consume_close_permission("window-b"));
}
