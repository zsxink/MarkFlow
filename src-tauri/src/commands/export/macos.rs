//! macOS native PDF generation through WKWebView.
//!
//! WKWebView throttles `requestAnimationFrame` for hidden windows, so the
//! export page is rendered off-screen but visible and signals readiness with an
//! explicit two-frame handshake before the native print operation runs.

use crate::commands::export::files::{commit_pdf_file, validate_pdf_file, wait_for_valid_pdf_file};
use crate::commands::export::PdfExportResult;
use std::{
    ffi::c_void,
    fs,
    path::Path,
    ptr::NonNull,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Url, WebviewUrl, WebviewWindowBuilder};

use objc2::{define_class, msg_send, DefinedClass, MainThreadOnly};
use objc2_app_kit::NSPrintOperation;
use objc2_foundation::{MainThreadMarker, NSObject, NSObjectProtocol};

pub(crate) const PDF_PAGE_READY_TIMEOUT: Duration = Duration::from_secs(20);
pub(crate) const PDF_NATIVE_TIMEOUT: Duration = Duration::from_secs(30);
pub(crate) const PDF_FILE_READY_TIMEOUT: Duration = Duration::from_secs(5);
static PDF_JOB_SEQUENCE: AtomicU64 = AtomicU64::new(1);
// Address of a static is stable for the process lifetime, which is what
// `objc_setAssociatedObject` requires as a key.
static PRINT_DELEGATE_ASSOCIATION_KEY: u8 = 0;

#[cfg(target_os = "macos")]
pub(crate) async fn run_macos_pdf_job(
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
pub(crate) enum NativePdfOutput {
    Bytes(Vec<u8>),
    File,
}

#[cfg(target_os = "macos")]
pub(crate) type NativePdfSender =
    Arc<Mutex<Option<tokio::sync::oneshot::Sender<Result<NativePdfOutput, String>>>>>;

#[cfg(target_os = "macos")]
pub(crate) struct PrintOperationDelegateIvars {
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
pub(crate) async fn generate_pdf_macos(
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
pub(crate) fn send_native_result(
    sender: &NativePdfSender,
    result: Result<NativePdfOutput, String>,
) {
    if let Ok(mut sender) = sender.lock() {
        if let Some(sender) = sender.take() {
            let _ = sender.send(result);
        }
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn copy_pdf_callback_data(
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
pub(crate) fn unique_pdf_job_id() -> Result<String, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "PDF_GENERATION_FAILED: system clock is before Unix epoch".to_string())?
        .as_nanos();
    let sequence = PDF_JOB_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    Ok(format!("{timestamp}-{sequence}"))
}
