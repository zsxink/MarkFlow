use crate::commands::settings::load_settings_inner;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

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

/// Generate a PDF file directly from HTML content using platform-native API.
///
/// Currently returns an error on all platforms — the frontend falls back to
/// the print dialog. Native PDF generation (macOS WKWebView.createPDF,
/// Windows WebView2 PrintToPdf, Linux WebKitGTK) will be implemented in a
/// follow-up change.
#[tauri::command]
pub async fn create_pdf(_html_content: String, _app: AppHandle) -> Result<Vec<u8>, String> {
    Err("PDF generation via native API is not yet implemented on this platform. Use Print instead.".to_string())
}

/// Write binary data to a file (for DOCX export).
#[tauri::command]
pub async fn write_file_binary(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &data).map_err(|e| format!("Failed to write binary file: {}", e))
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
