use super::*;

#[test]
fn parses_valid_settings_without_dropping_values() {
    let settings = Settings {
        theme: "dark".into(),
        ..Settings::default()
    };
    let json = serde_json::to_string(&settings).unwrap();
    assert_eq!(parse_settings(&json).unwrap().theme, "dark");
}

#[test]
fn version_three_image_defaults_match_the_persisted_contract() {
    let settings = Settings::default();
    assert_eq!(settings.version, 3);
    assert_eq!(settings.image_storage_mode, "custom");
    assert_eq!(settings.image_custom_path.as_deref(), Some("./images"));
    assert!(settings.image_apply_to_local);
    assert!(settings.image_apply_to_network);
    assert_eq!(
        settings.image_clipboard_name_template,
        "img-${date:yyyyMMdd}${time:HHmmss}"
    );
}

#[test]
fn invalid_settings_fall_back_to_defaults() {
    assert!(parse_settings("{not-json").is_err());
}

#[test]
fn document_limit_defaults_match_the_frontend_contract() {
    let settings = Settings::default();
    assert_eq!(settings.wysiwyg_max_bytes, 1048576);
    assert_eq!(settings.source_max_bytes, 10485760);
    assert_eq!(settings.max_lines, 1000000);
}

#[test]
fn legacy_settings_receive_document_limit_defaults() {
    let mut value = serde_json::to_value(Settings::default()).unwrap();
    let object = value.as_object_mut().unwrap();
    object.remove("wysiwygMaxBytes");
    object.remove("sourceMaxBytes");
    object.remove("maxLines");
    let parsed = parse_settings(&serde_json::to_string(&value).unwrap()).unwrap();
    assert_eq!(parsed.wysiwyg_max_bytes, 1048576);
    assert_eq!(parsed.source_max_bytes, 10485760);
    assert_eq!(parsed.max_lines, 1000000);
}

#[test]
fn document_limits_survive_a_load_mutate_save_round_trip() {
    // Rust-side load→mutate→save (e.g. add_recent_file) drops any field missing
    // from the struct, so every persisted settings field must round-trip.
    let mut value = serde_json::to_value(Settings::default()).unwrap();
    let object = value.as_object_mut().unwrap();
    object.insert("wysiwygMaxBytes".into(), 2097152u64.into());
    object.insert("sourceMaxBytes".into(), 52428800u64.into());
    object.insert("maxLines".into(), 500000u64.into());

    let mut parsed = parse_settings(&serde_json::to_string(&value).unwrap()).unwrap();
    parsed.recent_files = vec!["/tmp/a.md".into()];

    let saved = serde_json::to_string_pretty(&parsed).unwrap();
    let reloaded = parse_settings(&saved).unwrap();
    assert_eq!(reloaded.wysiwyg_max_bytes, 2097152);
    assert_eq!(reloaded.source_max_bytes, 52428800);
    assert_eq!(reloaded.max_lines, 500000);
    assert_eq!(reloaded.recent_files, vec!["/tmp/a.md".to_string()]);
}

#[test]
fn legacy_settings_receive_file_tree_defaults() {
    let mut value = serde_json::to_value(Settings::default()).unwrap();
    let object = value.as_object_mut().unwrap();
    object.remove("fileTreeIgnorePatterns");
    object.remove("fileTreePageSize");
    object.remove("fileTreeAutoLoadDepth");
    let parsed = parse_settings(&serde_json::to_string(&value).unwrap()).unwrap();
    assert_eq!(
        parsed.file_tree_ignore_patterns,
        vec![".git", "node_modules", "target", "dist"]
    );
    assert_eq!(parsed.file_tree_page_size, 500);
    assert_eq!(parsed.file_tree_auto_load_depth, 8);
}

#[test]
fn file_browser_show_unsupported_files_defaults_to_hidden() {
    assert!(!Settings::default().file_browser_show_unsupported_files);
}

#[test]
fn legacy_settings_receive_hidden_unsupported_files_default() {
    let mut value = serde_json::to_value(Settings::default()).unwrap();
    value
        .as_object_mut()
        .unwrap()
        .remove("fileBrowserShowUnsupportedFiles");
    let parsed = parse_settings(&serde_json::to_string(&value).unwrap()).unwrap();
    assert!(!parsed.file_browser_show_unsupported_files);
}

#[test]
fn file_browser_show_unsupported_files_survives_a_round_trip() {
    let shown = Settings {
        file_browser_show_unsupported_files: true,
        ..Settings::default()
    };
    let saved = serde_json::to_string_pretty(&shown).unwrap();
    let reloaded = parse_settings(&saved).unwrap();
    assert!(reloaded.file_browser_show_unsupported_files);
    let hidden = serde_json::to_string(&Settings::default()).unwrap();
    assert!(
        !parse_settings(&hidden)
            .unwrap()
            .file_browser_show_unsupported_files
    );
}

#[test]
fn legacy_settings_receive_empty_plantuml_server_url() {
    let mut value = serde_json::to_value(Settings::default()).unwrap();
    value.as_object_mut().unwrap().remove("plantumlServerUrl");
    let parsed = parse_settings(&serde_json::to_string(&value).unwrap()).unwrap();
    assert_eq!(parsed.plantuml_server_url, "");
}

#[test]
fn version_one_image_settings_are_migrated_to_explicit_behaviors() {
    let mut value = serde_json::to_value(Settings::default()).unwrap();
    let object = value.as_object_mut().unwrap();
    object.insert("version".into(), 1.into());
    object.insert("imageStorageMode".into(), "none".into());
    object.insert("imageAutoCopyLocal".into(), false.into());
    object.insert("imageDownloadNetwork".into(), true.into());
    object.insert("imagePreferRelative".into(), false.into());
    object.remove("imageLocalFileBehavior");
    object.remove("imageNetworkBehavior");
    object.remove("imageReferenceStyle");
    object.remove("imageApplyToLocal");
    object.remove("imageApplyToNetwork");
    object.remove("imageClipboardNameTemplate");

    let parsed = parse_settings(&serde_json::to_string(&value).unwrap()).unwrap();
    assert_eq!(parsed.version, 3);
    assert_eq!(parsed.image_storage_mode, "custom");
    assert_eq!(parsed.image_custom_path.as_deref(), Some("./images"));
    assert_eq!(parsed.image_local_file_behavior, "reference");
    assert_eq!(parsed.image_network_behavior, "download");
    assert_eq!(parsed.image_reference_style, "absolute");
    assert!(!parsed.image_apply_to_local);
    assert!(parsed.image_apply_to_network);
    assert_eq!(
        parsed.image_clipboard_name_template,
        "img-${date:yyyyMMdd}${time:HHmmss}"
    );
}

#[test]
fn version_two_document_assets_preserves_the_closest_directory_rule() {
    let mut value = serde_json::to_value(Settings::default()).unwrap();
    let object = value.as_object_mut().unwrap();
    object.insert("version".into(), 2.into());
    object.insert("imageStorageMode".into(), "doc-assets".into());
    object.insert("imageLocalFileBehavior".into(), "copy".into());
    object.insert("imageNetworkBehavior".into(), "keep-url".into());
    object.remove("imageApplyToLocal");
    object.remove("imageApplyToNetwork");
    object.remove("imageClipboardNameTemplate");

    let parsed = parse_settings(&serde_json::to_string(&value).unwrap()).unwrap();
    assert_eq!(parsed.version, 3);
    assert_eq!(parsed.image_storage_mode, "custom");
    assert_eq!(parsed.image_custom_path.as_deref(), Some("./assets"));
    assert!(parsed.image_apply_to_local);
    assert!(!parsed.image_apply_to_network);
}

#[test]
fn version_two_custom_path_is_preserved() {
    let mut value = serde_json::to_value(Settings::default()).unwrap();
    let object = value.as_object_mut().unwrap();
    object.insert("version".into(), 2.into());
    object.insert("imageStorageMode".into(), "custom".into());
    object.insert("imageCustomPath".into(), "../pictures".into());

    let parsed = parse_settings(&serde_json::to_string(&value).unwrap()).unwrap();
    assert_eq!(parsed.image_storage_mode, "custom");
    assert_eq!(parsed.image_custom_path.as_deref(), Some("../pictures"));
}
