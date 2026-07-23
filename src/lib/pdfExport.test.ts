import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { invokeMock, showToastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));
vi.mock('../components/toast', () => ({
  showToast: showToastMock,
}));
vi.mock('./logger', () => ({
  logInfo: vi.fn(),
  logException: vi.fn(),
  logDebug: vi.fn(),
}));

import { exportPdfToFile, triggerPdfExport } from './pdfExport';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  invokeMock.mockReset();
  showToastMock.mockReset();
  vi.useRealTimers();
});

describe('PDF export - file generation', () => {
  it('shows warning when another export is in progress', async () => {
    invokeMock.mockImplementation(() => new Promise(() => {}));

    // Start first export (will hang)
    const first = exportPdfToFile('<html>test</html>');

    // Second export should be blocked
    const second = exportPdfToFile('<html>test2</html>');
    expect(await second).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('正在导出中，请稍候');

    // Cleanup: resolve the first one
    invokeMock.mockResolvedValue([37, 80, 68, 70, 45]); // %PDF-
    vi.advanceTimersByTime(65000); // timeout
    await first;
  });

  it('validates PDF file header', async () => {
    // Return invalid PDF bytes (not starting with %PDF-)
    invokeMock.mockResolvedValue([0, 0, 0, 0, 0]);

    const result = await exportPdfToFile('<html>test</html>');
    expect(result).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('PDF 生成失败：文件格式无效');
  });

  it('reports success for valid PDF', async () => {
    // Return valid PDF header bytes
    invokeMock.mockResolvedValue([37, 80, 68, 70, 45, 49, 46, 55]); // %PDF-1.7
    // Mock save dialog to return true
    invokeMock.mockResolvedValueOnce([37, 80, 68, 70, 45]);
    invokeMock.mockResolvedValueOnce(true);

    await exportPdfToFile('<html>test</html>');
    // The create_pdf command will be called with the HTML content
    expect(invokeMock).toHaveBeenCalledWith('create_pdf', { htmlContent: '<html>test</html>' });
  });

  it('handles timeout gracefully', async () => {
    // Never resolve the create_pdf call
    invokeMock.mockImplementation(() => new Promise(() => {}));

    const promise = exportPdfToFile('<html>test</html>');

    // Advance timers past the timeout
    vi.advanceTimersByTime(65000);

    const result = await promise;
    expect(result).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('PDF 导出超时，请重试');
  });

  it('handles create_pdf command failure', async () => {
    invokeMock.mockRejectedValue(new Error('Platform not supported'));

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
