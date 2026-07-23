import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
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
const PRINT_TIMEOUT_MS = 60_000;

interface PdfExportResult {
  bytesWritten: number;
}

// ── Export PDF (file generation, not print) ────────────────────────────────

/**
 * Export PDF by generating a .pdf file directly using platform-native API.
 * The destination is selected before the backend creates any temporary
 * resources. The backend writes, validates, and atomically commits the file.
 */
export async function exportPdfToFile(
  html: string,
  defaultName = 'document.pdf',
): Promise<boolean> {
  if (pdfExportInProgress) {
    showToast('正在导出中，请稍候');
    return false;
  }

  pdfExportInProgress = true;
  logInfo('export.pdf', 'start');

  try {
    const outputPath = await save({
      defaultPath: ensurePdfExtension(defaultName),
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
    });
    if (!outputPath) return false;

    logInfo('export.pdf', 'ready');

    logInfo('export.pdf', 'generating');

    // The backend owns page/native timeouts and cleanup. Do not race the IPC
    // call with a frontend timer: that would release the concurrency guard
    // while the native job could still be writing the selected destination.
    const result = await invoke<PdfExportResult>('create_pdf', {
      htmlContent: html,
      outputPath,
    });

    if (!Number.isFinite(result.bytesWritten) || result.bytesWritten < 5) {
      throw new Error('PDF_INVALID: backend returned an invalid byte count');
    }

    logInfo('export.pdf', 'written', { size: result.bytesWritten });
    logInfo('export.pdf', 'validated');
    showToast('已导出 PDF 文件');
    return true;
  } catch (error) {
    const msg = getErrorMessage(error);
    if (msg.includes('PDF_TIMEOUT') || msg.toLowerCase().includes('timed out')) {
      logInfo('export.pdf', 'timeout');
      showToast('PDF 导出超时，请重试');
    } else if (msg.includes('PDF_UNSUPPORTED')) {
      logException('export.pdf', 'error', error);
      showToast('当前系统版本暂不支持直接导出 PDF');
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
    }, PRINT_TIMEOUT_MS);

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

function ensurePdfExtension(name: string): string {
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
