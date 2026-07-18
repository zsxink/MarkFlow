import { afterEach, describe, expect, it, vi } from 'vitest';

const { saveMock, writeFileMock, showToastMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  writeFileMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: saveMock }));
vi.mock('./storage', () => ({ writeFile: writeFileMock }));
vi.mock('../components/toast', () => ({ showToast: showToastMock }));

import {
  createHtmlExport,
  createWordExport,
  exportRenderedDocument,
  getExportFileName,
  printDocument,
} from './documentExport';

afterEach(() => {
  saveMock.mockReset();
  writeFileMock.mockReset();
  showToastMock.mockReset();
  vi.restoreAllMocks();
});

describe('rendered document export', () => {
  it('derives format-specific names from the active Markdown file', () => {
    expect(getExportFileName('/notes/meeting.md', 'html')).toBe('meeting.html');
    expect(getExportFileName('C:\\notes\\meeting.markdown', 'word')).toBe('meeting.doc');
    expect(getExportFileName(null, 'html')).toBe('untitled.html');
  });

  it('wraps rendered HTML in a standalone HTML document', () => {
    const html = createHtmlExport('A < B', '<h1>报告</h1><img src="diagram.svg">');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>A &lt; B</title>');
    expect(html).toContain('<h1>报告</h1><img src="diagram.svg">');
    expect(html).toContain('@media print');
  });

  it('adds Word-compatible namespaces and MIME metadata', () => {
    const word = createWordExport('报告', '<p>内容</p>');
    expect(word).toContain('xmlns:o="urn:schemas-microsoft-com:office:office"');
    expect(word).toContain('xmlns:w="urn:schemas-microsoft-com:office:word"');
    expect(word).toContain('content="text/html; charset=utf-8"');
    expect(word).toContain('<p>内容</p>');
  });

  it('does not write when the save dialog is cancelled', async () => {
    saveMock.mockResolvedValue(null);
    const result = await exportRenderedDocument('html', { innerHTML: '<p>内容</p>' } as HTMLElement, '/notes/a.md');
    expect(result).toBe(false);
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('writes standalone HTML to the selected path', async () => {
    saveMock.mockResolvedValue('/exports/a.html');
    const result = await exportRenderedDocument('html', { innerHTML: '<p>内容</p>' } as HTMLElement, '/notes/a.md');
    expect(result).toBe(true);
    expect(writeFileMock).toHaveBeenCalledWith('/exports/a.html', expect.stringContaining('<p>内容</p>'));
    expect(showToastMock).toHaveBeenCalledWith('已导出 HTML 文件');
  });

  it('writes the Word wrapper and reports write failures', async () => {
    saveMock.mockResolvedValue('/exports/a.doc');
    writeFileMock.mockRejectedValue(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await exportRenderedDocument('word', { innerHTML: '<p>内容</p>' } as HTMLElement, '/notes/a.md');
    expect(result).toBe(false);
    expect(writeFileMock).toHaveBeenCalledWith('/exports/a.doc', expect.stringContaining('xmlns:w='));
    expect(showToastMock).toHaveBeenCalledWith('导出失败，请重试');
  });

  it('reports an unavailable PDF print frame', () => {
    const iframe = {
      setAttribute: vi.fn(),
      style: { cssText: '' },
      addEventListener: vi.fn(),
      remove: vi.fn(),
      contentDocument: null,
    };
    const hostDocument = {
      createElement: vi.fn(() => iframe),
      body: { appendChild: vi.fn() },
    } as unknown as Document;

    expect(printDocument('<p>内容</p>', hostDocument)).toBe(false);
    expect(iframe.remove).toHaveBeenCalledOnce();
    expect(showToastMock).toHaveBeenCalledWith('无法打开 PDF 打印窗口');
  });
});
