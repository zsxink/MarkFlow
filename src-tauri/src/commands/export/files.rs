//! PDF file handling: temp naming, header validation, atomic commit, cleanup.
//!
//! The generated PDF only becomes visible at the user-selected path after it
//! passes the `%PDF-` header check, so a failed export can never truncate an
//! existing file.

#[cfg(target_os = "macos")]
use std::time::Duration;
#[cfg(any(target_os = "macos", test))]
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};
#[cfg(target_os = "macos")]
use tokio::time::Instant;

#[cfg(any(target_os = "macos", test))]
pub(crate) fn inject_pdf_ready_script(html: &str, ready_url: &str) -> String {
    let encoded_ready_url =
        serde_json::to_string(ready_url).expect("serializing a URL string cannot fail");
    let script = format!(
        r#"<script data-markflow-pdf-ready>
(async () => {{
  const fonts = document.fonts
    ? document.fonts.ready.catch(() => undefined)
    : Promise.resolve();
  const images = Array.from(document.images, image =>
    image.decode ? image.decode().catch(() => undefined) : Promise.resolve()
  );
  await Promise.all([fonts, ...images]);
  await new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  );
  window.location.replace({encoded_ready_url});
}})();
</script>"#
    );

    if let Some(body_end) = html.rfind("</body>") {
        let mut prepared = String::with_capacity(html.len() + script.len());
        prepared.push_str(&html[..body_end]);
        prepared.push_str(&script);
        prepared.push_str(&html[body_end..]);
        prepared
    } else {
        format!("{html}{script}")
    }
}

#[cfg(any(target_os = "macos", test))]
pub(crate) fn temporary_pdf_path(output_path: &Path, job_id: &str) -> Result<PathBuf, String> {
    let parent = output_path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or_else(|| "PDF_WRITE_FAILED: selected path has no parent directory".to_string())?;
    let file_name = output_path
        .file_name()
        .ok_or_else(|| "PDF_WRITE_FAILED: selected path has no file name".to_string())?
        .to_string_lossy();
    Ok(parent.join(format!(".{file_name}.{job_id}.tmp")))
}

#[cfg(any(target_os = "macos", test))]
pub(crate) fn validate_pdf_file(path: &Path) -> Result<u64, String> {
    let mut file = fs::File::open(path)
        .map_err(|error| format!("PDF_WRITE_FAILED: cannot open generated PDF: {error}"))?;
    let length = file
        .metadata()
        .map_err(|error| format!("PDF_WRITE_FAILED: cannot inspect generated PDF: {error}"))?
        .len();
    if length < 5 {
        return Err("PDF_INVALID: generated PDF is empty or truncated".to_string());
    }

    let mut header = [0_u8; 5];
    file.read_exact(&mut header)
        .map_err(|error| format!("PDF_INVALID: cannot read generated PDF header: {error}"))?;
    if &header != b"%PDF-" {
        return Err("PDF_INVALID: generated file does not start with %PDF-".to_string());
    }
    Ok(length)
}

#[cfg(any(target_os = "macos", test))]
pub(crate) fn commit_pdf_file(temp_path: &Path, output_path: &Path) -> Result<(), String> {
    validate_pdf_file(temp_path)?;
    fs::rename(temp_path, output_path)
        .map_err(|error| format!("PDF_WRITE_FAILED: cannot commit generated PDF: {error}"))
}

#[cfg(any(target_os = "macos", test))]
pub(crate) fn remove_file_if_present(path: &Path) {
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => tracing::warn!(
            target: "backend.export",
            path = %path.display(),
            error = %error,
            "Failed to remove temporary export file"
        ),
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn schedule_delayed_pdf_cleanup(path: PathBuf) {
    tauri::async_runtime::spawn(async move {
        // Closing the export WebView normally ends the print operation
        // immediately. Retry cleanup for late native completion so a timed-out
        // save job cannot leave a hidden file after the command has returned.
        cleanup_pdf_after_delays(
            &path,
            &[250_u64, 750, 2_000, 5_000, 10_000].map(Duration::from_millis),
        )
        .await;
    });
}

#[cfg(target_os = "macos")]
pub(crate) async fn cleanup_pdf_after_delays(path: &Path, delays: &[Duration]) {
    for delay in delays {
        tokio::time::sleep(*delay).await;
        remove_file_if_present(path);
    }
}

#[cfg(target_os = "macos")]
pub(crate) async fn wait_for_valid_pdf_file(path: &Path) -> Result<u64, String> {
    let deadline = Instant::now() + super::macos::PDF_FILE_READY_TIMEOUT;
    loop {
        match validate_pdf_file(path) {
            Ok(length) => return Ok(length),
            Err(_) if Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            Err(error) => return Err(error),
        }
    }
}
