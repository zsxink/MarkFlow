use crate::commands::images::io::read_local_image_source;
use crate::commands::images::pending::{
    cleanup_expired_pending_images_at, load_manifest, migrate_pending_images_to_root,
    pending_draft_dir, write_manifest, write_pending_image_at, PENDING_RETENTION,
};
use crate::commands::images::storage::{
    authorize_image_storage_with_settings, extension_for_mime, reject_unsafe_existing_dir,
    storage_root_for_settings, validate_image_destination,
};
use crate::config::settings::Settings;
use crate::paths::normalize_path;
use base64::Engine;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

const PNG_BYTES: &[u8] = b"\x89PNG\r\n\x1a\nmock";
const JPEG_BYTES: &[u8] = b"\xff\xd8\xff\xe0mock";

fn temp_dir() -> PathBuf {
    static COUNTER: AtomicUsize = AtomicUsize::new(0);
    let index = COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!(
        "markflow_image_storage_{}_{}",
        std::process::id(),
        index
    ));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn destination_must_stay_inside_storage_root() {
    let root = temp_dir();
    let outside = root.parent().unwrap().join("escape.png");
    let error = validate_image_destination(&outside, &root).unwrap_err();
    assert!(error.contains("路径超出允许范围"));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn destination_accepts_nonexistent_nested_directory() {
    let root = temp_dir();
    let destination = root.join("nested").join("image.png");
    assert_eq!(
        validate_image_destination(&destination, &root).unwrap(),
        destination
    );
    let _ = fs::remove_dir_all(root);
}

#[cfg(unix)]
#[test]
fn destination_rejects_symlink_hop() {
    use std::os::unix::fs::symlink;
    let root = temp_dir();
    let outside = temp_dir();
    symlink(&outside, root.join("linked")).unwrap();
    let destination = root.join("linked").join("image.png");
    let error = validate_image_destination(&destination, &root).unwrap_err();
    assert!(error.contains("符号链接"));
    let _ = fs::remove_dir_all(root);
    let _ = fs::remove_dir_all(outside);
}

#[test]
fn mime_extension_uses_canonical_jpeg_suffix() {
    assert_eq!(extension_for_mime("image/jpeg"), Some("jpg"));
    assert_eq!(extension_for_mime("text/html"), None);
}

#[test]
fn storage_modes_resolve_from_the_document_without_a_second_level_directory() {
    let root = temp_dir();
    let document = root.join("README.zh-CN.md");
    let document_string = document.to_string_lossy();
    let mut settings = Settings {
        image_storage_mode: "document-dir".into(),
        ..Settings::default()
    };
    assert_eq!(
        storage_root_for_settings(&settings, Some(&document_string)).unwrap(),
        root
    );

    settings.image_storage_mode = "document-named-dir".into();
    assert_eq!(
        storage_root_for_settings(&settings, Some(&document_string)).unwrap(),
        root.join("README.zh-CN-images")
    );

    settings.image_storage_mode = "custom".into();
    settings.image_custom_path = Some("./images".into());
    assert_eq!(
        storage_root_for_settings(&settings, Some(&document_string)).unwrap(),
        root.join("images")
    );
    let _ = fs::remove_dir_all(root);
}

#[test]
fn reject_unsafe_existing_dir_succeeds_when_path_is_absent() {
    let root = temp_dir();
    let missing = root.join("will-not-exist");
    reject_unsafe_existing_dir(&missing).unwrap();
    assert!(!missing.exists());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn authorize_image_storage_does_not_create_nonexistent_root() {
    let root = temp_dir();
    let document = root.join("untitled.md");
    let document_string = document.to_string_lossy();
    let settings = Settings {
        image_storage_mode: "document-named-dir".into(),
        ..Settings::default()
    };
    let expected_root = root.join("untitled-images");
    assert!(!expected_root.exists());
    let result = authorize_image_storage_with_settings(&document_string, &settings, |_| Ok(()));
    assert_eq!(result.unwrap(), normalize_path(&expected_root));
    assert!(!expected_root.exists(), "打开文档不应创建图片存储目录");
    let _ = fs::remove_dir_all(root);
}

#[test]
fn authorize_image_storage_accepts_existing_safe_directory() {
    let root = temp_dir();
    let document = root.join("note.md");
    let storage = root.join("images");
    fs::create_dir_all(&storage).unwrap();
    let document_string = document.to_string_lossy();
    let settings = Settings {
        image_storage_mode: "custom".into(),
        image_custom_path: Some("./images".into()),
        ..Settings::default()
    };
    let result = authorize_image_storage_with_settings(&document_string, &settings, |_| Ok(()));
    assert_eq!(result.unwrap(), normalize_path(&storage));
    assert!(storage.is_dir());
    let _ = fs::remove_dir_all(root);
}

#[cfg(unix)]
#[test]
fn authorize_image_storage_rejects_existing_symlink_root() {
    use std::os::unix::fs::symlink;
    let root = temp_dir();
    let outside = temp_dir();
    let document = root.join("note.md");
    let storage = root.join("images");
    symlink(&outside, &storage).unwrap();
    let document_string = document.to_string_lossy();
    let settings = Settings {
        image_storage_mode: "custom".into(),
        image_custom_path: Some("./images".into()),
        ..Settings::default()
    };
    let error =
        authorize_image_storage_with_settings(&document_string, &settings, |_| Ok(())).unwrap_err();
    assert!(error.contains("符号链接"));
    let _ = fs::remove_dir_all(root);
    let _ = fs::remove_dir_all(outside);
}

#[test]
fn authorize_image_storage_rejects_existing_plain_file_root() {
    let root = temp_dir();
    let document = root.join("note.md");
    let storage = root.join("images");
    fs::write(&storage, b"not a directory").unwrap();
    let document_string = document.to_string_lossy();
    let settings = Settings {
        image_storage_mode: "custom".into(),
        image_custom_path: Some("./images".into()),
        ..Settings::default()
    };
    let error =
        authorize_image_storage_with_settings(&document_string, &settings, |_| Ok(())).unwrap_err();
    assert!(error.contains("普通目录"));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn pending_write_generates_draft_and_never_overwrites_same_name() {
    let pending_root = temp_dir();
    let data = base64::engine::general_purpose::STANDARD.encode(PNG_BYTES);
    let first = write_pending_image_at(&pending_root, None, "image.png", &data).unwrap();
    let second =
        write_pending_image_at(&pending_root, Some(&first.draft_id), "image.png", &data).unwrap();

    assert!(first.path.ends_with("/image.png"));
    assert!(second.path.ends_with("/image-1.png"));
    let (_, manifest) = load_manifest(&pending_root, &first.draft_id).unwrap();
    assert_eq!(manifest.entries.len(), 2);
    let _ = fs::remove_dir_all(pending_root);
}

#[test]
fn pending_migration_is_idempotent_and_reuses_its_manifest_mapping() {
    let pending_root = temp_dir();
    let storage_root = temp_dir();
    let data = base64::engine::general_purpose::STANDARD.encode(PNG_BYTES);
    let staged = write_pending_image_at(&pending_root, None, "image.png", &data).unwrap();
    fs::write(storage_root.join("image.png"), JPEG_BYTES).unwrap();

    let first =
        migrate_pending_images_to_root(&pending_root, &staged.draft_id, &storage_root).unwrap();
    let second =
        migrate_pending_images_to_root(&pending_root, &staged.draft_id, &storage_root).unwrap();

    assert_eq!(first.mappings, second.mappings);
    assert!(first.mappings[0].to.ends_with("/image-1.png"));
    assert_eq!(
        fs::read(storage_root.join("image-1.png")).unwrap(),
        PNG_BYTES
    );
    assert!(!storage_root.join("image-2.png").exists());
    let _ = fs::remove_dir_all(pending_root);
    let _ = fs::remove_dir_all(storage_root);
}

#[test]
fn pending_manifest_cannot_redirect_migration_outside_the_draft() {
    let pending_root = temp_dir();
    let storage_root = temp_dir();
    let data = base64::engine::general_purpose::STANDARD.encode(PNG_BYTES);
    let staged = write_pending_image_at(&pending_root, None, "image.png", &data).unwrap();
    let (draft_dir, mut manifest) = load_manifest(&pending_root, &staged.draft_id).unwrap();
    manifest.entries[0].staged_path = storage_root.join("outside.png").to_string_lossy().into();
    write_manifest(&draft_dir, &manifest).unwrap();

    let error =
        migrate_pending_images_to_root(&pending_root, &staged.draft_id, &storage_root).unwrap_err();
    assert!(error.contains("路径超出允许范围"));
    let _ = fs::remove_dir_all(pending_root);
    let _ = fs::remove_dir_all(storage_root);
}

#[test]
fn expired_cleanup_preserves_recoverable_drafts_then_removes_them() {
    let pending_root = temp_dir();
    let data = base64::engine::general_purpose::STANDARD.encode(PNG_BYTES);
    let staged = write_pending_image_at(&pending_root, None, "image.png", &data).unwrap();
    let (draft_dir, mut manifest) = load_manifest(&pending_root, &staged.draft_id).unwrap();
    manifest.updated_at_ms = 0;
    write_manifest(&draft_dir, &manifest).unwrap();
    let after_retention = PENDING_RETENTION.as_millis() as u64 + 1;

    assert_eq!(
        cleanup_expired_pending_images_at(
            &pending_root,
            std::slice::from_ref(&staged.draft_id),
            after_retention,
        )
        .unwrap(),
        0
    );
    assert!(draft_dir.exists());
    assert_eq!(
        cleanup_expired_pending_images_at(&pending_root, &[], after_retention).unwrap(),
        1
    );
    assert!(!draft_dir.exists());
    let _ = fs::remove_dir_all(pending_root);
}

#[test]
fn pending_draft_id_rejects_path_components() {
    let pending_root = temp_dir();
    let error = pending_draft_dir(&pending_root, "../outside").unwrap_err();
    assert!(error.contains("草稿标识"));
    let _ = fs::remove_dir_all(pending_root);
}

#[test]
fn local_image_source_requires_valid_image_content() {
    let root = temp_dir();
    let source = root.join("image.png");
    fs::write(&source, PNG_BYTES).unwrap();
    assert_eq!(read_local_image_source(&source).unwrap(), PNG_BYTES);

    fs::write(&source, b"not an image").unwrap();
    assert!(read_local_image_source(&source).is_err());
    let _ = fs::remove_dir_all(root);
}

#[cfg(unix)]
#[test]
fn local_image_source_rejects_symlinks() {
    use std::os::unix::fs::symlink;
    let root = temp_dir();
    let source = root.join("source.png");
    let linked = root.join("linked.png");
    fs::write(&source, PNG_BYTES).unwrap();
    symlink(&source, &linked).unwrap();
    assert!(read_local_image_source(&linked)
        .unwrap_err()
        .contains("符号链接"));
    let _ = fs::remove_dir_all(root);
}
