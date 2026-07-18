import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { saveDocumentExportMock, readFileAsBase64Mock, showToastMock } = vi.hoisted(() => ({
  saveDocumentExportMock: vi.fn(),
  readFileAsBase64Mock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock('./storage', () => ({
  saveDocumentExport: saveDocumentExportMock,
  readFileAsBase64: readFileAsBase64Mock,
}));
vi.mock('../components/toast', () => ({ showToast: showToastMock }));

import {
  createHtmlExport,
  createWordExport,
  exportRenderedDocument,
  getExportFileName,
  printDocument,
} from './documentExport';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  saveDocumentExportMock.mockReset();
  readFileAsBase64Mock.mockReset();
  showToastMock.mockReset();
  vi.restoreAllMocks();
  vi.useRealTimers();
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
    saveDocumentExportMock.mockResolvedValue(false);
    const container = document.createElement('div');
    container.innerHTML = '<p>内容</p>';
    const result = await exportRenderedDocument('html', container, '/notes/a.md');
    expect(result).toBe(false);
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('shows warning when renderedRoot is null', async () => {
    const result = await exportRenderedDocument('html', null, '/notes/a.md');
    expect(result).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('没有可导出的文档内容');
    expect(saveDocumentExportMock).not.toHaveBeenCalled();
  });

  it('writes standalone HTML via backend command', async () => {
    saveDocumentExportMock.mockResolvedValue(true);
    const container = document.createElement('div');
    container.innerHTML = '<p>内容</p>';
    const result = await exportRenderedDocument('html', container, '/notes/a.md');
    expect(result).toBe(true);
    expect(saveDocumentExportMock).toHaveBeenCalledWith(
      expect.stringContaining('<p>内容</p>'),
      'a.html',
      'HTML 文档',
      ['html'],
    );
    expect(showToastMock).toHaveBeenCalledWith('已导出 HTML 文件');
  });

  it('writes the Word wrapper via backend command', async () => {
    saveDocumentExportMock.mockResolvedValue(true);
    const container = document.createElement('div');
    container.innerHTML = '<p>内容</p>';
    const result = await exportRenderedDocument('word', container, '/notes/a.md');
    expect(result).toBe(true);
    expect(saveDocumentExportMock).toHaveBeenCalledWith(
      expect.stringContaining('xmlns:w='),
      'a.doc',
      'Word 文档',
      ['doc'],
    );
    expect(showToastMock).toHaveBeenCalledWith('已导出 Word 文档');
  });

  it('reports export failure when backend command throws', async () => {
    saveDocumentExportMock.mockRejectedValue(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const container = document.createElement('div');
    container.innerHTML = '<p>内容</p>';
    const result = await exportRenderedDocument('html', container, '/notes/a.md');
    expect(result).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('导出失败，请重试');
  });

  it('converts local asset images to data URIs before export', async () => {
    saveDocumentExportMock.mockResolvedValue(true);
    readFileAsBase64Mock.mockResolvedValue('base64data');

    const container = document.createElement('div');
    container.innerHTML = '<img src="asset://localhost/path/to/image.png">';

    await exportRenderedDocument('html', container, '/notes/a.md');

    expect(readFileAsBase64Mock).toHaveBeenCalledWith('/path/to/image.png');
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,base64data');
  });

  it('infers correct MIME type from file extension', async () => {
    saveDocumentExportMock.mockResolvedValue(true);
    readFileAsBase64Mock.mockResolvedValue('base64data');

    const container = document.createElement('div');
    container.innerHTML = '<img src="asset://localhost/photo.jpg">';

    await exportRenderedDocument('html', container, '/notes/a.md');

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('data:image/jpeg;base64,base64data');
  });

  it('skips images that are not asset protocol URLs', async () => {
    saveDocumentExportMock.mockResolvedValue(true);

    const container = document.createElement('div');
    container.innerHTML = '<img src="https://example.com/image.png">';

    await exportRenderedDocument('html', container, '/notes/a.md');

    expect(readFileAsBase64Mock).not.toHaveBeenCalled();
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/image.png');
  });

  it('continues export when image conversion fails', async () => {
    saveDocumentExportMock.mockResolvedValue(true);
    readFileAsBase64Mock.mockRejectedValue(new Error('file not found'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const container = document.createElement('div');
    container.innerHTML = '<img src="asset://localhost/missing.png">';

    const result = await exportRenderedDocument('html', container, '/notes/a.md');

    expect(result).toBe(true);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('asset://localhost/missing.png');
  });

  it('does not allow concurrent exports', async () => {
    saveDocumentExportMock.mockImplementation(() => new Promise(() => {}));

    const container = document.createElement('div');
    container.innerHTML = '<p>内容</p>';
    void exportRenderedDocument('html', container, '/notes/a.md');
    const second = exportRenderedDocument('html', container, '/notes/a.md');

    expect(await second).toBe(false);
  });
});

describe('printDocument', () => {
  it('creates iframe with srcdoc and returns a promise', async () => {
    const handlers: Record<string, (() => void) | undefined> = {};
    const iframe = {
      setAttribute: vi.fn(),
      style: { cssText: '' },
      addEventListener: vi.fn((event: string, handler: () => void) => {
        handlers[event] = handler;
      }),
      remove: vi.fn(),
      srcdoc: '',
      contentWindow: {
        focus: vi.fn(),
        print: vi.fn(),
      },
    };
    const hostDocument = {
      createElement: vi.fn(() => iframe),
      body: { appendChild: vi.fn() },
    } as unknown as Document;

    const resultPromise = printDocument('<p>内容</p>', hostDocument);

    expect(iframe.srcdoc).toBe('<p>内容</p>');
    expect(hostDocument.body.appendChild).toHaveBeenCalledWith(iframe);

    // Simulate load event
    handlers.load?.();

    // Advance past the 1s cleanup timeout
    vi.advanceTimersByTime(1100);

    const resolved = await resultPromise;
    expect(resolved).toBe(true);
  });

  it('reports an unavailable PDF print frame', async () => {
    const handlers: Record<string, (() => void) | undefined> = {};
    const iframe = {
      setAttribute: vi.fn(),
      style: { cssText: '' },
      addEventListener: vi.fn((event: string, handler: () => void) => {
        handlers[event] = handler;
      }),
      remove: vi.fn(),
      srcdoc: '',
      contentWindow: null,
    };
    const hostDocument = {
      createElement: vi.fn(() => iframe),
      body: { appendChild: vi.fn() },
    } as unknown as Document;

    const resultPromise = printDocument('<p>内容</p>', hostDocument);

    // Simulate load event
    handlers.load?.();

    // Advance past the 1s cleanup timeout
    vi.advanceTimersByTime(1100);

    const resolved = await resultPromise;
    expect(resolved).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('无法打开 PDF 打印窗口');
  });
});
