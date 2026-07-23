import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { invokeMock, saveMock, showToastMock, logInfoMock, logExceptionMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  saveMock: vi.fn(),
  showToastMock: vi.fn(),
  logInfoMock: vi.fn(),
  logExceptionMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: saveMock,
}));
vi.mock('../components/toast', () => ({
  showToast: showToastMock,
}));
vi.mock('./logger', () => ({
  logInfo: logInfoMock,
  logException: logExceptionMock,
  logDebug: vi.fn(),
}));

import { exportPdfToFile, triggerPdfExport } from './pdfExport';

beforeEach(() => {
  saveMock.mockResolvedValue('/tmp/document.pdf');
});

afterEach(() => {
  invokeMock.mockReset();
  saveMock.mockReset();
  showToastMock.mockReset();
  logInfoMock.mockReset();
  logExceptionMock.mockReset();
});

describe('PDF export - file generation', () => {
  it('shows warning when another export is in progress', async () => {
    let finishExport!: (result: { bytesWritten: number }) => void;
    invokeMock.mockImplementation(() => new Promise(resolve => {
      finishExport = resolve;
    }));

    // Start first export (will hang)
    const first = exportPdfToFile('<html>test</html>');

    // Second export should be blocked
    const second = exportPdfToFile('<html>test2</html>');
    expect(await second).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('正在导出中，请稍候');

    finishExport({ bytesWritten: 512 });
    await first;
  });

  it('does not call the backend when the save dialog is cancelled', async () => {
    saveMock.mockResolvedValue(null);

    const result = await exportPdfToFile('<html>test</html>');
    expect(result).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('selects a PDF path before invoking the backend', async () => {
    saveMock.mockResolvedValue('/tmp/report.pdf');
    invokeMock.mockResolvedValue({ bytesWritten: 1_024 });

    const result = await exportPdfToFile('<html>test</html>', 'report');

    expect(result).toBe(true);
    expect(saveMock).toHaveBeenCalledWith({
      defaultPath: 'report.pdf',
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
    });
    expect(invokeMock).toHaveBeenCalledWith('create_pdf', {
      htmlContent: '<html>test</html>',
      outputPath: '/tmp/report.pdf',
    });
    expect(showToastMock).toHaveBeenCalledWith('已导出 PDF 文件');
  });

  it('logs the successful lifecycle in order', async () => {
    invokeMock.mockResolvedValue({ bytesWritten: 512 });

    await exportPdfToFile('<html>test</html>');

    expect(logInfoMock.mock.calls.map(call => call.slice(0, 2))).toEqual([
      ['export.pdf', 'start'],
      ['export.pdf', 'ready'],
      ['export.pdf', 'generating'],
      ['export.pdf', 'written'],
      ['export.pdf', 'validated'],
    ]);
  });

  it('rejects invalid backend metadata', async () => {
    invokeMock.mockResolvedValue({ bytesWritten: 0 });

    const result = await exportPdfToFile('<html>test</html>');

    expect(result).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('PDF 导出失败，请重试');
  });

  it('handles timeout gracefully', async () => {
    invokeMock.mockRejectedValue('PDF_TIMEOUT: native PDF generation timed out');

    const result = await exportPdfToFile('<html>test</html>');
    expect(result).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('PDF 导出超时，请重试');
    expect(logInfoMock).toHaveBeenCalledWith('export.pdf', 'timeout');
  });

  it('shows a specific message for unsupported systems', async () => {
    invokeMock.mockRejectedValue('PDF_UNSUPPORTED: macOS version is not supported');

    const result = await exportPdfToFile('<html>test</html>');
    expect(result).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('当前系统版本暂不支持直接导出 PDF');
  });

  it('handles create_pdf command failure', async () => {
    invokeMock.mockRejectedValue(new Error('PDF_GENERATION_FAILED: WebKit error'));

    const result = await exportPdfToFile('<html>test</html>');

    expect(result).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('PDF 导出失败，请重试');
  });
});

describe('PDF export - print dialog', () => {
  it('shows warning when print is already in progress', async () => {
    // Mock window.open to return an object with print()
    const mockPrintWindow = {
      document: { write: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(mockPrintWindow as any);

    invokeMock.mockImplementation(() => new Promise(() => {}));

    // Start first print (will hang on non-macOS path)
    const first = triggerPdfExport('<html>test</html>');

    // Second print should be blocked
    const second = triggerPdfExport('<html>test2</html>');
    expect(await second).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('正在导出中，请稍候');

    // Cleanup: resolve the first one by triggering afterprint
    const afterprintHandler = mockPrintWindow.addEventListener.mock.calls
      .find((call: any[]) => call[0] === 'afterprint')?.[1];
    if (afterprintHandler) afterprintHandler();
    await first;

    vi.restoreAllMocks();
  });
});
