use super::*;
use std::fs;
use std::path::PathBuf;

fn temp_root() -> PathBuf {
    let root = std::env::temp_dir().join(format!("markflow-open-tests-{}", std::process::id()));
    fs::create_dir_all(&root).expect("create temp test root");
    root
}

#[test]
fn existing_directory_classifies_as_dir() {
    let dir = temp_root().join("some-dir");
    fs::create_dir_all(&dir).expect("create test dir");
    assert_eq!(classify_open_target(&dir), OpenTarget::Dir);
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn existing_file_classifies_as_file() {
    let file = temp_root().join("note.md");
    fs::write(&file, "demo").expect("create test file");
    assert_eq!(classify_open_target(&file), OpenTarget::File);
    fs::remove_file(&file).ok();
}

#[test]
fn missing_path_classifies_as_missing() {
    let missing = temp_root().join("does-not-exist");
    assert_eq!(classify_open_target(&missing), OpenTarget::Missing);
}

#[test]
fn forward_slash_paths_are_not_rejected_by_form() {
    // The backend hands out normalized forward-slash paths (issue #377 root
    // cause); classification must inspect the path, not its separator form.
    let root = temp_root();
    let file = root.join("forward-slash.md");
    fs::write(&file, "demo").expect("create test file");

    let joined = format!("{}/forward-slash.md", root.to_string_lossy());
    assert_eq!(classify_open_target(Path::new(&joined)), OpenTarget::File);

    // A drive-letter style path that cannot exist here still lands on Missing
    // instead of erroring on the separator form.
    assert_eq!(
        classify_open_target(Path::new("C:/definitely/missing/logs")),
        OpenTarget::Missing
    );
    fs::remove_file(&file).ok();
}

#[test]
fn missing_path_error_is_io_and_carries_the_path() {
    let error = missing_path_error("C:/Users/x/logs");
    assert_eq!(error.code, crate::error::AppErrorCode::Io);
    assert!(error.message.contains("C:/Users/x/logs"));
}
