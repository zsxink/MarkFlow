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
/// On macOS, uses WKWebView.createPDF(configuration:completionHandler:) to generate
/// the PDF without opening the system print dialog.
///
/// Returns the PDF bytes on success.
#[tauri::command]
pub async fn create_pdf(html_content: String, app: AppHandle) -> Result<Vec<u8>, String> {
    use futures::channel::oneshot;
    use std::sync::{Arc, Mutex};

    // Create a unique label for the temporary window
    let label = format!(
        "pdf-gen-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "Time error".to_string())?
            .as_millis()
    );

    // Get saved window state for sizing
    let saved = load_settings_inner();
    let win_w = saved.last_window_width;
    let win_h = saved.last_window_height;

    // Create the window (hidden — we only need the webview for PDF generation)
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("MarkFlow PDF Generator")
        .inner_size(win_w, win_h)
        .visible(false)
        .build()
        .map_err(|e| format!("Failed to create PDF window: {}", e))?;

    // Inject the HTML content
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

    // Wait for content to render (fonts, images, etc.)
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    // Use platform-specific PDF generation
    #[cfg(target_os = "macos")]
    {
        generate_pdf_macos(&window).await
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Fallback: use print-to-PDF via window.print()
        // On non-macOS platforms, we fall back to the print dialog approach
        let _ = window.print();
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
        let _ = window.close();
        Err("PDF generation via native API is not yet supported on this platform. Use Print instead.".to_string())
    }
}

/// macOS-specific PDF generation using WKWebView.createPDF(configuration:completionHandler:)
#[cfg(target_os = "macos")]
async fn generate_pdf_macos(window: &tauri::Webview) -> Result<Vec<u8>, String> {
    use std::sync::mpsc;

    // Channel to receive the PDF data from the callback
    let (tx, rx) = mpsc::channel::<Result<Vec<u8>, String>>();

    let tx = Arc::new(Mutex::new(Some(tx)));

    // Use with_webview to access the raw WKWebView on macOS
    window
        .with_webview(move |webview| {
            // Access the underlying WKWebView via theocoa runtime
            // On macOS, tauri::Webview wraps WKWebView
            unsafe {
                use objc::msg_send;
                use objc::sel;
                use objc::sel_impl;
                use objc::runtime::{Object, Class};

                // Get the WKWebView instance
                let wk_webview: *mut Object = webview.webview as *mut Object;

                // Create a WKPDFConfiguration
                let pdf_config_class = Class::get("WKPDFConfiguration").unwrap();
                let pdf_config: *mut Object = msg_send![pdf_config_class, new];

                // Set the rect to use for PDF generation (full page)
                let rect: objc::runtime::NSRect = objc::runtime::NSRect {
                    origin: objc::runtime::NSPoint { x: 0.0, y: 0.0 },
                    size: objc::runtime::NSSize {
                        width: 800.0,
                        height: 1200.0,
                    },
                };
                let _: () = msg_send![pdf_config, setRect: rect];

                // Create a completion handler block
                // We need to use a trampoline that captures the sender
                let tx_clone = tx.clone();
                let completion_block = objc::block::ConcreteBlock::new(
                    move |data: *mut Object, error: *mut Object| {
                        if !error.is_null() {
                            let desc: *mut Object = msg_send![error, localizedDescription];
                            let msg: *const objc::runtime::Object = desc as *const _;
                            let rust_str = std::ffi::CStr::from_ptr(
                                msg_send![desc, UTF8String] as *const std::os::raw::c_char
                            );
                            let _ = tx_clone.lock().unwrap().take().map(|tx| {
                                tx.send(Err(format!("PDF generation failed: {}", rust_str.to_string_lossy())))
                            });
                            return;
                        }

                        // Convert NSData to Vec<u8>
                        let length: usize = msg_send![data, length];
                        let bytes: *const u8 = msg_send![data, bytes];
                        let mut pdf_bytes = vec![0u8; length];
                        std::ptr::copy_nonoverlapping(bytes, pdf_bytes.as_mut_ptr(), length);
                        let _ = tx_clone.lock().unwrap().take().map(|tx| {
                            tx.send(Ok(pdf_bytes))
                        });
                    },
                );

                let completion_block_copy = objc::block::Block::copy(&completion_block);

                // Call createPDFWithConfiguration:completionHandler:
                let _: () = msg_send![
                    wk_webview,
                    createPDFWithConfiguration: pdf_config
                    completionHandler: &*completion_block_copy
                ];

                // Note: The completion block is called asynchronously
                // We'll wait for it via the channel
            }
        })
        .map_err(|e| format!("Failed to access webview: {}", e))?;

    // Wait for the PDF generation callback with a timeout
    let result = tokio::task::spawn_blocking(move || {
        rx.recv_timeout(std::time::Duration::from_secs(30))
            .map_err(|_| "PDF generation timed out".to_string())
            .and_then(|r| r.map_err(|e| e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("PDF generation error: {}", e))?;

    // Close the temporary window
    let _ = window.close();

    Ok(result)
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
