import { invoke } from '@tauri-apps/api/core';
import { logInfo, logException } from './logger';
import { showToast } from '../components/toast';

export type PdfExportEvent =
  | 'export.pdf.start'
  | 'export.pdf.ready'
  | 'export.pdf.generating'
  | 'export.pdf.written'
  | 'export.pdf.validated'
  | 'export.pdf.print_invoked'
  | 'export.pdf.afterprint'
  | 'export.pdf.timeout'
  | 'export.pdf.error';

// ── Concurrent export protection (task 4.7) ───────────────────────────────

let pdfExportInProgress = false;
const PDF_TIMEOUT_MS = 60_000;

// ── Export PDF (file generation, not print) ────────────────────────────────

/**
 * Export PDF by generating a .pdf file directly using platform-native API.
 * On macOS, uses WKWebView.createPDF() via Tauri command.
 * Opens a save dialog, generates PDF, validates the output, and saves.
 */
export async function exportPdfToFile(html: string): Promise<boolean> {
  if (pdfExportInProgress) {
    showToast('正在导出中，请稍候');
    return false;
  }

  pdfExportInProgress = true;
  logInfo('export.pdf', 'start');

  try {
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('PDF export timed out')), PDF_TIMEOUT_MS);
    });

    logInfo('export.pdf', 'generating');

    // Race between PDF generation and timeout
    const pdfBytes = await Promise.race([
      invoke<number[]>('create_pdf', { htmlContent: html }),
      timeoutPromise,
    ]);

    logInfo('export.pdf', 'written', { size: pdfBytes.length });

    // Validate PDF file header (task 4.4)
    if (!validatePdfHeader(pdfBytes)) {
      logException('export.pdf', 'Invalid PDF file header', new Error('File does not start with %PDF-'));
      showToast('PDF 生成失败：文件格式无效');
      return false;
    }

    logInfo('export.pdf', 'validated');

    // Save via native dialog
    const saved = await savePdfFile(pdfBytes);
    if (saved) {
      showToast('已导出 PDF 文件');
    }
    return saved;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('timed out')) {
      logInfo('export.pdf', 'timeout');
      showToast('PDF 导出超时，请重试');
    } else {
      logException('export.pdf', 'error', error);
      showToast('PDF 导出失败，请重试');
    }
    return false;
  } finally {
    pdfExportInProgress = false;
  }
}

// ── Print (system print dialog) ───────────────────────────────────────────

let printInProgress = false;

/**
 * Trigger PDF export by opening the system print dialog.
 * On macOS, uses Tauri WebviewWindow::print(); on other platforms falls back to window.print().
 * This is the "Print..." menu option (task 4.6).
 */
export async function triggerPdfExport(html: string): Promise<boolean> {
  if (printInProgress) {
    showToast('正在导出中，请稍候');
    return false;
  }

  printInProgress = true;
  logInfo('export.pdf', 'start');

  try {
    // Detect platform
    const isMac = navigator.userAgent.includes('Mac OS') || navigator.userAgent.includes('macOS');

    if (isMac) {
      return await triggerNativePdfExport(html);
    }
    return await triggerWindowPrint(html);
  } finally {
    printInProgress = false;
  }
}

async function triggerNativePdfExport(html: string): Promise<boolean> {
  // Use Tauri print command — creates a temporary print page and
  // calls WebviewWindow::print() on the Rust side
  try {
    const result = await invoke<boolean>('print_webview', { htmlContent: html });
    if (result) {
      logInfo('export.pdf', 'afterprint');
    } else {
      logInfo('export.pdf', 'timeout');
    }
    return result;
  } catch (error) {
    logException('export.pdf', 'error', error);
    showToast('无法打开 PDF 打印窗口');
    return false;
  }
}

async function triggerWindowPrint(html: string): Promise<boolean> {
  // Fallback for Windows/Linux: open a small visible window and call window.print()
  return new Promise<boolean>(resolve => {
    logInfo('export.pdf', 'ready');

    const printWindow = window.open('', 'MarkFlow PDF Export', 'width=800,height=600');
    if (!printWindow) {
      logException('export.pdf', 'error', new Error('Failed to open print window'));
      showToast('无法打开 PDF 打印窗口');
      resolve(false);
      return;
    }

    printWindow.document.write(html);
    printWindow.document.close();

    // Listen for afterprint or window close
    let settled = false;
    const settle = (success: boolean) => {
      if (settled) return;
      settled = true;
      if (success) {
        logInfo('export.pdf', 'afterprint');
      }
      resolve(success);
    };

    // Timeout after 60s
    const timeout = setTimeout(() => {
      logInfo('export.pdf', 'timeout');
      settle(false);
      printWindow.close();
    }, PDF_TIMEOUT_MS);

    printWindow.addEventListener('beforeprint', () => {
      logInfo('export.pdf', 'print_invoked');
    });

    printWindow.addEventListener('afterprint', () => {
      clearTimeout(timeout);
      settle(true);
      printWindow.close();
    });

    // Window close event = user cancelled
    printWindow.addEventListener('unload', () => {
      clearTimeout(timeout);
      settle(false);
    });

    // Focus then print
    printWindow.focus();
    logInfo('export.pdf', 'print_invoked');
    printWindow.print();
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Validate that the PDF bytes start with the %PDF- header (task 4.4).
 */
function validatePdfHeader(bytes: number[] | Uint8Array): boolean {
  if (bytes.length < 5) return false;
  const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
  return header === '%PDF-';
}

/**
 * Save PDF bytes via native save dialog.
 */
async function savePdfFile(bytes: number[]): Promise<boolean> {
  try {
    const saved = await invoke<boolean>('save_binary_export', {
      data: bytes,
      defaultName: 'document.pdf',
      filterName: 'PDF 文档',
      extensions: ['pdf'],
    });
    return saved;
  } catch (error) {
    logException('export.pdf', 'Failed to save PDF file', error);
    showToast('保存 PDF 失败');
    return false;
  }
}
