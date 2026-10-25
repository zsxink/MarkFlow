use super::workspace_to_restore;
use crate::config::settings::Settings;

#[test]
fn disabled_workspace_restoration_skips_last_workspace() {
    let settings = Settings {
        restore_workspace: false,
        last_workspace: Some("/tmp/workspace".into()),
        ..Settings::default()
    };

    assert_eq!(workspace_to_restore(&settings), None);
}

#[test]
fn enabled_workspace_restoration_uses_last_workspace() {
    let settings = Settings {
        restore_workspace: true,
        last_workspace: Some("/tmp/workspace".into()),
        ..Settings::default()
    };

    assert_eq!(workspace_to_restore(&settings), Some("/tmp/workspace"));
}
