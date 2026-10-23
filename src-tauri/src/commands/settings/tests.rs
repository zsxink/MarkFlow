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
