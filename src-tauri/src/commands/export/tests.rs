#[cfg(target_os = "macos")]
use crate::commands::export::files::cleanup_pdf_after_delays;
use crate::commands::export::files::{
    commit_pdf_file, inject_pdf_ready_script, remove_file_if_present, temporary_pdf_path,
    validate_pdf_file,
};
use std::fs;
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::time::Duration;

fn test_dir(name: &str) -> PathBuf {
    let unique = format!(
        "markflow-pdf-test-{name}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    std::env::temp_dir().join(unique)
}

#[test]
fn ready_script_waits_for_fonts_images_and_two_frames() {
    let html = "<html><body><p>report</p></body></html>";
    let prepared = inject_pdf_ready_script(html, "markflow-pdf-ready://ready/job-1");

    assert!(prepared.contains("document.fonts.ready"));
    assert!(prepared.contains("image.decode"));
    assert_eq!(prepared.matches("requestAnimationFrame").count(), 2);
    assert!(prepared.contains("markflow-pdf-ready://ready/job-1"));
    assert!(prepared.find("data-markflow-pdf-ready").unwrap() < prepared.find("</body>").unwrap());
}

#[test]
fn validates_pdf_header_and_length() {
    let dir = test_dir("validate");
    fs::create_dir_all(&dir).unwrap();
    let valid = dir.join("valid.pdf");
    let invalid = dir.join("invalid.pdf");
    fs::write(&valid, b"%PDF-1.7\ncontent").unwrap();
    fs::write(&invalid, b"not-a-pdf").unwrap();

    assert_eq!(validate_pdf_file(&valid).unwrap(), 16);
    assert!(validate_pdf_file(&invalid)
        .unwrap_err()
        .starts_with("PDF_INVALID:"));

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn temporary_pdf_is_created_beside_destination() {
    let output = PathBuf::from("/tmp/report.pdf");
    assert_eq!(
        temporary_pdf_path(&output, "job-2").unwrap(),
        PathBuf::from("/tmp/.report.pdf.job-2.tmp")
    );
}

#[test]
fn invalid_temp_file_does_not_replace_existing_destination() {
    let dir = test_dir("atomic");
    fs::create_dir_all(&dir).unwrap();
    let output = dir.join("report.pdf");
    let temp = dir.join(".report.pdf.job.tmp");
    fs::write(&output, b"existing").unwrap();
    fs::write(&temp, b"invalid").unwrap();

    assert!(commit_pdf_file(&temp, &output).is_err());
    assert_eq!(fs::read(&output).unwrap(), b"existing");

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn valid_temp_file_replaces_destination_and_cleanup_is_idempotent() {
    let dir = test_dir("commit");
    fs::create_dir_all(&dir).unwrap();
    let output = dir.join("report.pdf");
    let temp = dir.join(".report.pdf.job.tmp");
    let orphan = dir.join("orphan.tmp");
    fs::write(&output, b"existing").unwrap();
    fs::write(&temp, b"%PDF-1.7\nnew report").unwrap();
    fs::write(&orphan, b"temporary").unwrap();

    commit_pdf_file(&temp, &output).unwrap();
    assert_eq!(fs::read(&output).unwrap(), b"%PDF-1.7\nnew report");
    assert!(!temp.exists());

    remove_file_if_present(&orphan);
    remove_file_if_present(&orphan);
    assert!(!orphan.exists());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn supported_platform_backend_must_not_regress_to_old_stub() {
    // The native bridge moved to `macos.rs` when the export module was split;
    // scan both so the regression guard still covers the platform backend.
    let source = [include_str!("mod.rs"), include_str!("macos.rs")].concat();
    let forbidden = [
        "PDF generation via native API is not yet implemented on this platform.",
        " Use Print instead.",
    ]
    .concat();
    let forbidden_raw_context = ["Box::into_", "raw(context)"].concat();
    assert!(!source.contains(&forbidden));
    assert!(!source.contains(&forbidden_raw_context));
    assert!(source.contains("objc_setAssociatedObject"));
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn delayed_native_output_is_cleaned_without_touching_destination() {
    let dir = test_dir("late-cleanup");
    fs::create_dir_all(&dir).unwrap();
    let output = dir.join("report.pdf");
    let temp = dir.join(".report.pdf.late.tmp");
    fs::write(&output, b"existing").unwrap();

    let late_temp = temp.clone();
    let writer = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(5)).await;
        fs::write(late_temp, b"%PDF-1.7\nlate").unwrap();
    });
    cleanup_pdf_after_delays(
        &temp,
        &[Duration::from_millis(1), Duration::from_millis(15)],
    )
    .await;
    writer.await.unwrap();

    assert!(!temp.exists());
    assert_eq!(fs::read(&output).unwrap(), b"existing");
    let _ = fs::remove_dir_all(dir);
}
