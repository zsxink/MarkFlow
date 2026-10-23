//! Export commands: PDF generation and binary file export.
//!
//! Split by concern: `macos.rs` holds the WKWebView print-operation bridge,
//! `files.rs` the temp-file/validation/cleanup helpers, and this module the
//! `#[tauri::command]` surface plus the non-macOS capability stub.

pub mod files;
#[cfg(target_os = "macos")]
pub mod macos;

use crate::commands::settings::load_settings_inner;
use serde::Serialize;
use tauri::AppHandle;
#[cfg(target_os = "macos")]
use tauri::Manager;
// `print_webview` is compiled on every desktop platform (the frontend only
// calls it on macOS, but the command must exist in the handler list), so these
// two imports stay ungated.
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "macos")]
use crate::commands::export::files::inject_pdf_ready_script;
#[cfg(target_os = "macos")]
use crate::commands::export::files::{
    remove_file_if_present, schedule_delayed_pdf_cleanup, temporary_pdf_path,
};
#[cfg(target_os = "macos")]
use crate::commands::export::macos::{run_macos_pdf_job, unique_pdf_job_id};
#[cfg(target_os = "macos")]
use std::fs;
#[cfg(target_os = "macos")]
use std::path::PathBuf;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportResult {
    pub(crate) bytes_written: u64,
}

/// Print a webview on macOS using WebviewWindow::print().
/// Creates a temporary window with the export HTML, prints it, then closes.
#[tauri::command]
pub async fn print_webview(html_content: String, app: AppHandle) -> Result<bool, String> {
    // Create a unique label
    let label = format!(
        "print-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "Time error".to_string())?
            .as_millis()
    );

    // Get saved window state for sizing
    let saved = load_settings_inner();
    let win_w = saved.last_window_width;
    let win_h = saved.last_window_height;

    // Create the window
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("MarkFlow PDF Export")
        .inner_size(win_w, win_h)
        .build()
        .map_err(|e| format!("Failed to create print window: {}", e))?;

    // Inject the HTML content into the webview
    // Use eval to set the document content
    let escaped = html_content
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "\\r");

    let js = format!(
        "document.open(); document.write('{}'); document.close();",
        escaped
    );

    window
        .eval(&js)
        .map_err(|e| format!("Failed to inject HTML: {}", e))?;

    // Wait a moment for content to render
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // Call print
    window
        .print()
        .map_err(|e| format!("Failed to print: {}", e))?;

    Ok(true)
}

/// Generate and atomically save a PDF using the platform WebView API.
///
/// The frontend selects `output_path` before invoking this command. On macOS
/// the command waits for the isolated export page to report that fonts and
/// images are ready, invokes WKWebView's native PDF API, validates the result,
/// then atomically commits it to the selected path.
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn create_pdf(
    html_content: String,
    output_path: String,
    app: AppHandle,
) -> Result<PdfExportResult, String> {
    let output_path = PathBuf::from(output_path);
    let parent = output_path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or_else(|| "PDF_WRITE_FAILED: selected path has no parent directory".to_string())?;
    if !parent.is_dir() {
        return Err("PDF_WRITE_FAILED: selected destination directory does not exist".to_string());
    }

    let job_id = unique_pdf_job_id()?;
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("PDF_WRITE_FAILED: cannot resolve app cache: {error}"))?
        .join("pdf-export");
    fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("PDF_WRITE_FAILED: cannot create export cache: {error}"))?;

    let html_path = cache_dir.join(format!("{job_id}.html"));
    let temp_pdf_path = temporary_pdf_path(&output_path, &job_id)?;
    let ready_url = format!("markflow-pdf-ready://ready/{job_id}");
    let prepared_html = inject_pdf_ready_script(&html_content, &ready_url);
    fs::write(&html_path, prepared_html)
        .map_err(|error| format!("PDF_WRITE_FAILED: cannot write export HTML: {error}"))?;

    let result = run_macos_pdf_job(
        &app,
        &job_id,
        &ready_url,
        &html_path,
        &temp_pdf_path,
        &output_path,
    )
    .await;

    remove_file_if_present(&html_path);
    if result.is_err() {
        remove_file_if_present(&temp_pdf_path);
        schedule_delayed_pdf_cleanup(temp_pdf_path);
    }
    result
}

/// Other platforms keep a stable capability error until their native backend
/// is implemented. This must never open the print dialog or report success.
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn create_pdf(
    _html_content: String,
    _output_path: String,
    _app: AppHandle,
) -> Result<PdfExportResult, String> {
    Err("PDF_UNSUPPORTED: direct PDF export is not implemented on this platform".to_string())
}

/// Save a binary export file via dialog.
#[tauri::command]
pub async fn save_binary_export(
    data: Vec<u8>,
    default_name: String,
    filter_name: String,
    extensions: Vec<String>,
    app: AppHandle,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    let file = app
        .dialog()
        .file()
        .add_filter(
            filter_name,
            &extensions.iter().map(|s| s.as_str()).collect::<Vec<_>>(),
        )
        .set_file_name(&default_name)
        .blocking_save_file();

    match file {
        Some(path) => {
            let path_buf = path
                .into_path()
                .map_err(|_| "Invalid save path".to_string())?;
            std::fs::write(&path_buf, &data).map_err(|e| format!("Failed to write file: {}", e))?;
            Ok(true)
        }
        None => Ok(false), // User cancelled
    }
}

#[cfg(test)]
mod tests;
