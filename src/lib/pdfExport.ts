import { invoke } from '@tauri-apps/api/core';
import { logInfo, logException } from './logger';
import { showToast } from '../components/toast';

export type PdfExportEvent =
  | 'export.pdf.start'
  | 'export.pdf.ready'
  | 'export.pdf.print_invoked'
  | 'export.pdf.afterprint'
  | 'export.pdf.timeout'
  | 'export.pdf.error';

/**
 * Trigger PDF export by opening a temporary print window.
 * On macOS, uses Tauri WebviewWindow::print(); on other platforms falls back to window.print().
 */
export async function triggerPdfExport(html: string): Promise<boolean> {
  logInfo('export.pdf', 'start');

  // Detect platform
  const isMac = navigator.userAgent.includes('Mac OS') || navigator.userAgent.includes('macOS');

  if (isMac) {
    return triggerNativePdfExport(html);
  }
  return triggerWindowPrint(html);
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
    }, 60_000);

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
