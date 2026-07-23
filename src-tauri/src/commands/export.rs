use crate::commands::settings::load_settings_inner;
use serde::Serialize;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "macos")]
use std::{
    ffi::c_void,
    ptr::NonNull,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
#[cfg(target_os = "macos")]
use tauri::{Manager, Url};

#[cfg(target_os = "macos")]
use objc2::{define_class, msg_send, DefinedClass, MainThreadOnly};
#[cfg(target_os = "macos")]
use objc2_app_kit::NSPrintOperation;
#[cfg(target_os = "macos")]
use objc2_foundation::{MainThreadMarker, NSObject, NSObjectProtocol};

#[cfg(target_os = "macos")]
const PDF_PAGE_READY_TIMEOUT: Duration = Duration::from_secs(20);
#[cfg(target_os = "macos")]
const PDF_NATIVE_TIMEOUT: Duration = Duration::from_secs(30);
#[cfg(target_os = "macos")]
const PDF_FILE_READY_TIMEOUT: Duration = Duration::from_secs(5);
#[cfg(target_os = "macos")]
static PDF_JOB_SEQUENCE: AtomicU64 = AtomicU64::new(1);
#[cfg(target_os = "macos")]
static PRINT_DELEGATE_ASSOCIATION_KEY: u8 = 0;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportResult {
    bytes_written: u64,
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

#[cfg(target_os = "macos")]
async fn run_macos_pdf_job(
    app: &AppHandle,
    job_id: &str,
    ready_url: &str,
    html_path: &Path,
    temp_pdf_path: &Path,
    output_path: &Path,
) -> Result<PdfExportResult, String> {
    use tokio::sync::oneshot;

    let page_url = Url::from_file_path(html_path)
        .map_err(|_| "PDF_LOAD_FAILED: cannot convert export HTML path to URL".to_string())?;
    let (ready_tx, ready_rx) = oneshot::channel::<()>();
    let ready_sender = Arc::new(Mutex::new(Some(ready_tx)));
    let expected_ready_url = ready_url.to_string();
    let navigation_sender = Arc::clone(&ready_sender);

    let window = WebviewWindowBuilder::new(
        app,
        format!("pdf-export-{job_id}"),
        WebviewUrl::External(page_url),
    )
    .title("MarkFlow PDF Export")
    .inner_size(900.0, 1100.0)
    // WKWebView throttles requestAnimationFrame for hidden windows. Keep the
    // renderer active off-screen so the explicit two-frame ready handshake can
    // complete without flashing or taking focus from the editor.
    .position(-10_000.0, -10_000.0)
    .focused(false)
    .skip_taskbar(true)
    .visible(true)
    .on_navigation(move |url| {
        if url.as_str().trim_end_matches('/') == expected_ready_url.trim_end_matches('/') {
            if let Ok(mut sender) = navigation_sender.lock() {
                if let Some(sender) = sender.take() {
                    let _ = sender.send(());
                }
            }
            return false;
        }
        true
    })
    .build()
    .map_err(|error| format!("PDF_LOAD_FAILED: cannot create export WebView: {error}"))?;

    let result = async {
        match tokio::time::timeout(PDF_PAGE_READY_TIMEOUT, ready_rx).await {
            Ok(Ok(())) => {}
            Ok(Err(_)) => {
                return Err(
                    "PDF_LOAD_FAILED: export page closed before reporting ready".to_string()
                );
            }
            Err(_) => {
                return Err("PDF_TIMEOUT: export page did not become ready".to_string());
            }
        }

        let native_output = generate_pdf_macos(&window, temp_pdf_path).await?;
        let bytes_written = match native_output {
            NativePdfOutput::Bytes(bytes) => {
                fs::write(temp_pdf_path, bytes).map_err(|error| {
                    format!("PDF_WRITE_FAILED: cannot write temporary PDF: {error}")
                })?;
                validate_pdf_file(temp_pdf_path)?
            }
            NativePdfOutput::File => wait_for_valid_pdf_file(temp_pdf_path).await?,
        };
        commit_pdf_file(temp_pdf_path, output_path)?;
        Ok(PdfExportResult { bytes_written })
    }
    .await;

    let _ = window.close();
    result
}

#[cfg(target_os = "macos")]
enum NativePdfOutput {
    Bytes(Vec<u8>),
    File,
}

#[cfg(target_os = "macos")]
type NativePdfSender =
    Arc<Mutex<Option<tokio::sync::oneshot::Sender<Result<NativePdfOutput, String>>>>>;

#[cfg(target_os = "macos")]
struct PrintOperationDelegateIvars {
    sender: NativePdfSender,
}

#[cfg(target_os = "macos")]
define_class!(
    // SAFETY: NSObject has no subclassing requirements, and the delegate has
    // no Rust fields or Drop implementation.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "MarkFlowPrintOperationDelegate"]
    #[ivars = PrintOperationDelegateIvars]
    struct PrintOperationDelegate;

    // SAFETY: NSObjectProtocol has no additional implementation requirements.
    unsafe impl NSObjectProtocol for PrintOperationDelegate {}

    impl PrintOperationDelegate {
        // SAFETY: The selector and signature are defined by NSPrintOperation's
        // modal completion contract.
        #[unsafe(method(printOperationDidRun:success:contextInfo:))]
        fn print_operation_did_run(
            &self,
            _operation: &NSPrintOperation,
            success: bool,
            _context_info: *mut c_void,
        ) {
            let result = if success {
                Ok(NativePdfOutput::File)
            } else {
                Err(
                    "PDF_GENERATION_FAILED: WebKit print operation returned failure"
                    .to_string(),
                )
            };
            send_native_result(&self.ivars().sender, result);
        }
    }
);

#[cfg(target_os = "macos")]
impl PrintOperationDelegate {
    fn new(sender: NativePdfSender, mtm: MainThreadMarker) -> objc2::rc::Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(PrintOperationDelegateIvars { sender });
        // SAFETY: NSObject's designated initializer is valid for this
        // fieldless NSObject subclass.
        unsafe { msg_send![super(this), init] }
    }
}

#[cfg(target_os = "macos")]
async fn generate_pdf_macos(
    window: &tauri::WebviewWindow,
    temp_pdf_path: &Path,
) -> Result<NativePdfOutput, String> {
    use block2::RcBlock;
    use objc2::ffi::{objc_setAssociatedObject, OBJC_ASSOCIATION_RETAIN_NONATOMIC};
    use objc2::sel;
    use objc2_app_kit::{NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob};
    use objc2_foundation::{NSCopying, NSData, NSError, NSObjectProtocol, NSString, NSURL};
    use objc2_web_kit::WKWebView;
    use tokio::sync::oneshot;

    fn save_pdf_with_print_operation(
        webview: &WKWebView,
        output_path: &Path,
        sender: NativePdfSender,
    ) -> Result<(), String> {
        let path = output_path.to_string_lossy();
        let ns_path = NSString::from_str(&path);
        let output_url = NSURL::fileURLWithPath(&ns_path);
        let print_info = NSPrintInfo::sharedPrintInfo().copy();
        let save_job = unsafe { NSPrintSaveJob };
        print_info.setJobDisposition(save_job);
        let attributes = unsafe { print_info.dictionary() };
        let save_url_key = unsafe { NSPrintJobSavingURL };
        attributes.insert(save_url_key, &output_url);
        let operation = unsafe { webview.printOperationWithPrintInfo(&print_info) };
        operation.setShowsPrintPanel(false);
        operation.setShowsProgressPanel(false);
        operation.setCanSpawnSeparateThread(true);

        let doc_window = webview.window().ok_or_else(|| {
            "PDF_GENERATION_FAILED: export WebView has no native window".to_string()
        })?;
        let delegate = PrintOperationDelegate::new(sender, webview.mtm());

        // Retain the completion delegate for exactly as long as AppKit retains
        // the print operation. This avoids a raw Box that can only be reclaimed
        // by a callback which may never arrive on native timeout.
        unsafe {
            objc_setAssociatedObject(
                std::ptr::from_ref::<NSPrintOperation>(&operation)
                    .cast_mut()
                    .cast(),
                std::ptr::addr_of!(PRINT_DELEGATE_ASSOCIATION_KEY).cast(),
                std::ptr::from_ref::<PrintOperationDelegate>(&delegate)
                    .cast_mut()
                    .cast(),
                OBJC_ASSOCIATION_RETAIN_NONATOMIC,
            );
        }

        // SAFETY: The delegate implements the supplied selector with AppKit's
        // required signature, and the operation-associated reference keeps the
        // delegate alive until AppKit finishes or releases the operation.
        unsafe {
            operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                &doc_window,
                Some(&delegate),
                Some(sel!(printOperationDidRun:success:contextInfo:)),
                std::ptr::null_mut(),
            );
        }
        Ok(())
    }

    let (native_tx, native_rx) = oneshot::channel::<Result<NativePdfOutput, String>>();
    let sender: NativePdfSender = Arc::new(Mutex::new(Some(native_tx)));
    let callback_sender = Arc::clone(&sender);
    let fallback_sender = Arc::clone(&sender);
    let fallback_path = temp_pdf_path.to_path_buf();

    window
        .with_webview(move |platform_webview| {
            let raw_webview = platform_webview.inner().cast::<WKWebView>();
            if raw_webview.is_null() {
                send_native_result(
                    &sender,
                    Err("PDF_GENERATION_FAILED: WKWebView handle is null".to_string()),
                );
                return;
            }

            // SAFETY: Tauri invokes this closure on the WebView main thread and
            // `inner()` is documented as the retained WKWebView handle.
            let webview = unsafe { &*raw_webview };

            // Prefer WebKit's save print operation because it honors @page and
            // paginates long documents. `createPDF` captures the page bounds as
            // one tall PDF page on current macOS.
            if webview.respondsToSelector(sel!(printOperationWithPrintInfo:)) {
                if let Err(error) = save_pdf_with_print_operation(
                    webview,
                    &fallback_path,
                    Arc::clone(&fallback_sender),
                ) {
                    send_native_result(&fallback_sender, Err(error));
                }
                return;
            }

            if webview.respondsToSelector(sel!(
                createPDFWithConfiguration:completionHandler:
            )) {
                let completion = RcBlock::new(move |data: *mut NSData, error: *mut NSError| {
                    let result = copy_pdf_callback_data(data, error).map(NativePdfOutput::Bytes);
                    send_native_result(&callback_sender, result);
                });

                // SAFETY: The selector capability was checked above, the typed
                // binding matches objc2-web-kit 0.3.2, and WebKit copies the
                // completion block for the asynchronous operation.
                unsafe {
                    webview.createPDFWithConfiguration_completionHandler(None, &completion);
                }
                return;
            }

            send_native_result(
                &sender,
                Err(
                    "PDF_UNSUPPORTED: this macOS version exposes no direct WKWebView PDF API"
                        .to_string(),
                ),
            );
        })
        .map_err(|error| format!("PDF_GENERATION_FAILED: cannot access WKWebView: {error}"))?;

    match tokio::time::timeout(PDF_NATIVE_TIMEOUT, native_rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("PDF_GENERATION_FAILED: native callback was dropped".to_string()),
        Err(_) => Err("PDF_TIMEOUT: native PDF generation timed out".to_string()),
    }
}

#[cfg(target_os = "macos")]
async fn wait_for_valid_pdf_file(path: &Path) -> Result<u64, String> {
    let deadline = tokio::time::Instant::now() + PDF_FILE_READY_TIMEOUT;
    loop {
        match validate_pdf_file(path) {
            Ok(length) => return Ok(length),
            Err(_) if tokio::time::Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            Err(error) => return Err(error),
        }
    }
}

#[cfg(target_os = "macos")]
fn send_native_result(sender: &NativePdfSender, result: Result<NativePdfOutput, String>) {
    if let Ok(mut sender) = sender.lock() {
        if let Some(sender) = sender.take() {
            let _ = sender.send(result);
        }
    }
}

#[cfg(target_os = "macos")]
fn copy_pdf_callback_data(
    data: *mut objc2_foundation::NSData,
    error: *mut objc2_foundation::NSError,
) -> Result<Vec<u8>, String> {
    if let Some(error) = unsafe { error.as_ref() } {
        return Err(format!(
            "PDF_GENERATION_FAILED: {}",
            error.localizedDescription()
        ));
    }
    let data = unsafe { data.as_ref() }
        .ok_or_else(|| "PDF_GENERATION_FAILED: WKWebView returned no PDF data".to_string())?;
    let length = data.length();
    if length == 0 {
        return Err("PDF_INVALID: WKWebView returned an empty PDF".to_string());
    }

    let mut bytes = vec![0_u8; length];
    let buffer = NonNull::new(bytes.as_mut_ptr().cast::<c_void>())
        .ok_or_else(|| "PDF_GENERATION_FAILED: cannot allocate PDF buffer".to_string())?;
    unsafe {
        data.getBytes_length(buffer, length);
    }
    Ok(bytes)
}

#[cfg(target_os = "macos")]
fn unique_pdf_job_id() -> Result<String, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "PDF_GENERATION_FAILED: system clock is before Unix epoch".to_string())?
        .as_nanos();
    let sequence = PDF_JOB_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    Ok(format!("{timestamp}-{sequence}"))
}

#[cfg(any(target_os = "macos", test))]
fn inject_pdf_ready_script(html: &str, ready_url: &str) -> String {
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
fn temporary_pdf_path(output_path: &Path, job_id: &str) -> Result<PathBuf, String> {
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
fn validate_pdf_file(path: &Path) -> Result<u64, String> {
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
fn commit_pdf_file(temp_path: &Path, output_path: &Path) -> Result<(), String> {
    validate_pdf_file(temp_path)?;
    fs::rename(temp_path, output_path)
        .map_err(|error| format!("PDF_WRITE_FAILED: cannot commit generated PDF: {error}"))
}

#[cfg(any(target_os = "macos", test))]
fn remove_file_if_present(path: &Path) {
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
fn schedule_delayed_pdf_cleanup(path: PathBuf) {
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
async fn cleanup_pdf_after_delays(path: &Path, delays: &[Duration]) {
    for delay in delays {
        tokio::time::sleep(*delay).await;
        remove_file_if_present(path);
    }
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

#[cfg(test)]
mod tests {
    use super::*;

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
        assert!(
            prepared.find("data-markflow-pdf-ready").unwrap() < prepared.find("</body>").unwrap()
        );
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
        let source = include_str!("export.rs");
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
}
