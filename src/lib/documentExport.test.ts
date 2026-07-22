import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  saveDocumentExportMock,
  readFileAsBase64Mock,
  showToastMock,
  invokeMock,
  buildExportSnapshotMock,
  triggerPdfExportMock,
  createDocxFromHtmlMock,
  saveDocxFileMock,
} = vi.hoisted(() => ({
  saveDocumentExportMock: vi.fn(),
  readFileAsBase64Mock: vi.fn(),
  showToastMock: vi.fn(),
  invokeMock: vi.fn(),
  buildExportSnapshotMock: vi.fn().mockImplementation((root: HTMLElement) => {
    const frag = document.createDocumentFragment();
    frag.appendChild(root.cloneNode(true));
    return Promise.resolve(frag);
  }),
  triggerPdfExportMock: vi.fn().mockResolvedValue(true),
  createDocxFromHtmlMock: vi.fn().mockResolvedValue(new Uint8Array()),
  saveDocxFileMock: vi.fn().mockResolvedValue(true),
}));

vi.mock('./storage', () => ({
  saveDocumentExport: saveDocumentExportMock,
  readFileAsBase64: readFileAsBase64Mock,
}));
vi.mock('../components/toast', () => ({ showToast: showToastMock }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('./logger', () => ({
  logException: vi.fn(),
  logDebug: vi.fn(),
  logInfo: vi.fn(),
}));
vi.mock('./exportSnapshot', () => ({
  buildExportSnapshot: buildExportSnapshotMock,
}));
vi.mock('./pdfExport', () => ({
  triggerPdfExport: triggerPdfExportMock,
}));
vi.mock('./docxExport', () => ({
  createDocxFromHtml: createDocxFromHtmlMock,
  saveDocxFile: saveDocxFileMock,
}));

import {
  createHtmlExport,
  exportRenderedDocument,
  getExportFileName,
} from './documentExport';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  saveDocumentExportMock.mockReset();
  readFileAsBase64Mock.mockReset();
  showToastMock.mockReset();
  invokeMock.mockReset();
  vi.useRealTimers();
});

describe('rendered document export', () => {
  it('derives format-specific names from the active Markdown file', () => {
    expect(getExportFileName('/notes/meeting.md', 'html')).toBe('meeting.html');
    expect(getExportFileName('C:\\notes\\meeting.markdown', 'word')).toBe('meeting.docx');
    expect(getExportFileName(null, 'html')).toBe('untitled.html');
  });

  it('wraps rendered HTML in a standalone HTML document', () => {
    const html = createHtmlExport('A < B', '<h1>报告</h1><img src="diagram.svg">');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>A &lt; B</title>');
    expect(html).toContain('<h1>报告</h1><img src="diagram.svg">');
    expect(html).toContain('@media print');
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

  it('writes Word document via DOCX export', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>内容</p>';
    const result = await exportRenderedDocument('word', container, '/notes/a.md');
    expect(result).toBe(true);
    expect(createDocxFromHtmlMock).toHaveBeenCalled();
    expect(saveDocxFileMock).toHaveBeenCalledWith(expect.any(Uint8Array), 'a.docx');
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

  it('does not allow concurrent exports', async () => {
    saveDocumentExportMock.mockImplementation(() => new Promise(() => {}));

    const container = document.createElement('div');
    container.innerHTML = '<p>内容</p>';
    void exportRenderedDocument('html', container, '/notes/a.md');
    const second = exportRenderedDocument('html', container, '/notes/a.md');

    expect(await second).toBe(false);
  });
});
