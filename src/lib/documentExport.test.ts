import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  saveDocumentExportMock,
  readFileAsBase64Mock,
  showToastMock,
  invokeMock,
  coreSessionState,
  flushCoreSessionMock,
  triggerPdfExportMock,
  createDocxFromHtmlMock,
  saveDocxFileMock,
} = vi.hoisted(() => ({
  saveDocumentExportMock: vi.fn(),
  readFileAsBase64Mock: vi.fn(),
  showToastMock: vi.fn(),
  invokeMock: vi.fn(),
  coreSessionState: {
    sessionId: 0,
    documentId: 0,
    confirmedRevision: 0,
    persistedRevision: 0,
    pendingCount: 0,
    pendingBytes: 0,
    syncState: 'idle',
    isActive: false,
    filePath: null,
    sizeClass: 'normal',
    stats: null,
  },
  flushCoreSessionMock: vi.fn().mockResolvedValue(5),
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
  waitForFontsReady: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./coreSession', () => ({
  getCoreSessionState: vi.fn(() => ({ ...coreSessionState })),
  flushCoreSession: flushCoreSessionMock,
}));
vi.mock('./pdfExport', () => ({
  triggerPdfExport: triggerPdfExportMock,
  exportPdfToFile: triggerPdfExportMock, // reuse the same mock for simplicity
}));
vi.mock('./docxExport', () => ({
  createDocxFromHtml: createDocxFromHtmlMock,
  saveDocxFile: saveDocxFileMock,
}));

// Mock only generateInlineFontCss from exportTheme (keep buildExportTheme and exportThemeToCss real)
vi.mock('./exportTheme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./exportTheme')>();
  return {
    ...actual,
    generateInlineFontCss: vi.fn().mockResolvedValue('/* font css */'),
  };
});

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
  flushCoreSessionMock.mockReset();
  flushCoreSessionMock.mockResolvedValue(5);
  Object.assign(coreSessionState, {
    sessionId: 0,
    documentId: 0,
    confirmedRevision: 0,
    persistedRevision: 0,
    pendingCount: 0,
    pendingBytes: 0,
    syncState: 'idle',
    isActive: false,
    filePath: null,
    sizeClass: 'normal',
    stats: null,
  });
  vi.useRealTimers();
});

describe('rendered document export', () => {
  it('derives format-specific names from the active Markdown file', () => {
    expect(getExportFileName('/notes/meeting.md', 'html')).toBe('meeting.html');
    expect(getExportFileName('C:\\notes\\meeting.markdown', 'word')).toBe('meeting.docx');
    expect(getExportFileName('/notes/meeting.md', 'pdf')).toBe('meeting.pdf');
    expect(getExportFileName(null, 'html')).toBe('untitled.html');
  });

  it('wraps rendered HTML in a standalone HTML document', async () => {
    const html = await createHtmlExport('A < B', '<h1>报告</h1><img src="diagram.svg">');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>A &lt; B</title>');
    expect(html).toContain('<h1>报告</h1><img src="diagram.svg">');
    // Theme-based CSS includes .ProseMirror content selectors
    expect(html).toContain('.ProseMirror');
    expect(html).toContain(':root {');
    expect(html).toContain('--color-fg:');
  });

  it('includes print-specific CSS for PDF HTML', async () => {
    const html = await createHtmlExport(
      '报告',
      '<div class="ProseMirror"><p>内容</p></div>',
      undefined,
      { print: true },
    );
    expect(html).toContain('@page {');
    expect(html).toContain('@media print {');
  });

  it('does not write when the save dialog is cancelled', async () => {
    Object.assign(coreSessionState, {
      sessionId: 42,
      documentId: 9,
      confirmedRevision: 4,
      isActive: true,
      filePath: '/notes/a.md',
    });
    invokeMock.mockImplementation((_command: string, payload: { export_request_id: string }) => Promise.resolve({
      schema_version: 1,
      session_id: 42,
      document_id: 9,
      base_revision: 5,
      export_request_id: payload.export_request_id,
      metadata: { frontmatter: null },
      blocks: [
        {
          id: 'b1',
          kind: { type: 'paragraph' },
          source_range: { start: 0, end: 6 },
          content_range: { start: 0, end: 6 },
          line_range: { start: 0, end: 1 },
          source: '内容',
        },
      ],
      assets: [],
      diagnostics: [],
    }));
    saveDocumentExportMock.mockResolvedValue(false);
    const result = await exportRenderedDocument('html', null, '/notes/a.md');
    expect(result).toBe(false);
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('requires an active Core session before exporting', async () => {
    const result = await exportRenderedDocument('html', null, '/notes/a.md');
    expect(result).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('导出需要已确认的 Core 会话');
    expect(saveDocumentExportMock).not.toHaveBeenCalled();
  });

  it('does not use a rendered DOM root as fallback without Core session', async () => {
    saveDocumentExportMock.mockResolvedValue(true);
    const container = document.createElement('div');
    container.innerHTML = '<p>内容</p>';
    const result = await exportRenderedDocument('html', container, '/notes/a.md');
    expect(result).toBe(false);
    expect(saveDocumentExportMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith('导出需要已确认的 Core 会话');
  });

  it('exports HTML from Core Export IR when a session is active', async () => {
    Object.assign(coreSessionState, {
      sessionId: 42,
      documentId: 9,
      confirmedRevision: 4,
      isActive: true,
      filePath: '/notes/a.md',
    });
    saveDocumentExportMock.mockResolvedValue(true);
    invokeMock.mockImplementation((_command: string, payload: { export_request_id: string }) => Promise.resolve({
      schema_version: 1,
      session_id: 42,
      document_id: 9,
      base_revision: 5,
      export_request_id: payload.export_request_id,
      metadata: { frontmatter: null },
      blocks: [
        {
          id: 'b1',
          kind: { type: 'heading', level: 1, title: '标题' },
          source_range: { start: 0, end: 8 },
          content_range: { start: 2, end: 8 },
          line_range: { start: 0, end: 1 },
          source: '# 标题',
        },
      ],
      assets: [],
      diagnostics: [],
    }));

    const result = await exportRenderedDocument('html', null, '/notes/a.md');

    expect(result).toBe(true);
    expect(flushCoreSessionMock).toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith('get_export_document', {
      session_id: 42,
      revision: 5,
      export_request_id: expect.any(String),
      options: { max_schema_version: 1, include_diagnostics: true },
    });
    expect(saveDocumentExportMock).toHaveBeenCalledWith(
      expect.stringContaining('<h1>标题</h1>'),
      'a.html',
      'HTML 文档',
      ['html'],
      {
        sessionId: 42,
        documentId: 9,
        baseRevision: 5,
        requestId: expect.any(String),
      },
    );
    expect(saveDocumentExportMock).toHaveBeenCalledWith(
      expect.stringContaining('<div class="ProseMirror" data-export-ir-schema-version="1" data-session-id="42" data-revision="5">'),
      'a.html',
      'HTML 文档',
      ['html'],
      {
        sessionId: 42,
        documentId: 9,
        baseRevision: 5,
        requestId: expect.any(String),
      },
    );
  });

  it('drains SourceSyncController pending patches before requesting Export IR', async () => {
    Object.assign(coreSessionState, {
      sessionId: 42,
      documentId: 9,
      confirmedRevision: 4,
      isActive: true,
      filePath: '/notes/a.md',
    });
    flushCoreSessionMock.mockResolvedValue(8);
    saveDocumentExportMock.mockResolvedValue(true);
    invokeMock.mockImplementation((_command: string, payload: { export_request_id: string }) => Promise.resolve({
      schema_version: 1,
      session_id: 42,
      document_id: 9,
      base_revision: 8,
      export_request_id: payload.export_request_id,
      metadata: { frontmatter: null },
      blocks: [
        {
          id: 'b1',
          kind: { type: 'paragraph' },
          source_range: { start: 0, end: 19 },
          content_range: { start: 0, end: 19 },
          line_range: { start: 0, end: 1 },
          source: 'latest source text',
        },
      ],
      assets: [],
      diagnostics: [],
    }));

    await exportRenderedDocument('html', null, '/notes/a.md');

    expect(flushCoreSessionMock.mock.invocationCallOrder[0])
      .toBeLessThan(invokeMock.mock.invocationCallOrder[0]);
    expect(invokeMock).toHaveBeenCalledWith('get_export_document', expect.objectContaining({
      session_id: 42,
      revision: 8,
    }));
  });

  it('rejects Export IR results whose identity does not match the initiating request', async () => {
    Object.assign(coreSessionState, {
      sessionId: 42,
      documentId: 9,
      confirmedRevision: 4,
      isActive: true,
      filePath: '/notes/a.md',
    });
    saveDocumentExportMock.mockResolvedValue(true);
    invokeMock.mockImplementation((_command: string, payload: { export_request_id: string }) => Promise.resolve({
      schema_version: 1,
      session_id: 99,
      document_id: 9,
      base_revision: 5,
      export_request_id: payload.export_request_id,
      metadata: { frontmatter: null },
      blocks: [],
      assets: [],
      diagnostics: [],
    }));

    const result = await exportRenderedDocument('html', null, '/notes/a.md');

    expect(result).toBe(false);
    expect(saveDocumentExportMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith('导出失败，请重试');
  });

  it('rejects export when the active session changes during flush', async () => {
    Object.assign(coreSessionState, {
      sessionId: 42,
      documentId: 9,
      confirmedRevision: 4,
      isActive: true,
      filePath: '/notes/a.md',
    });
    flushCoreSessionMock.mockImplementation(async () => {
      Object.assign(coreSessionState, {
        sessionId: 99,
        documentId: 10,
        confirmedRevision: 1,
        isActive: true,
        filePath: '/notes/b.md',
      });
      return 5;
    });

    const result = await exportRenderedDocument('html', null, '/notes/a.md');

    expect(result).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(saveDocumentExportMock).not.toHaveBeenCalled();
  });

  it('rejects export when the active session changes before result routing', async () => {
    Object.assign(coreSessionState, {
      sessionId: 42,
      documentId: 9,
      confirmedRevision: 4,
      isActive: true,
      filePath: '/notes/a.md',
    });
    saveDocumentExportMock.mockResolvedValue(true);
    invokeMock.mockImplementation((_command: string, payload: { export_request_id: string }) => {
      Object.assign(coreSessionState, {
        sessionId: 99,
        documentId: 10,
        confirmedRevision: 1,
        isActive: true,
        filePath: '/notes/b.md',
      });
      return Promise.resolve({
        schema_version: 1,
        session_id: 42,
        document_id: 9,
        base_revision: 5,
        export_request_id: payload.export_request_id,
        metadata: { frontmatter: null },
        blocks: [
          {
            id: 'b1',
            kind: { type: 'paragraph' },
            source_range: { start: 0, end: 9 },
            content_range: { start: 0, end: 9 },
            line_range: { start: 0, end: 1 },
            source: 'session A',
          },
        ],
        assets: [],
        diagnostics: [],
      });
    });

    const result = await exportRenderedDocument('html', null, '/notes/a.md');

    expect(result).toBe(false);
    expect(saveDocumentExportMock).not.toHaveBeenCalled();
  });

  it('writes Word document via DOCX export', async () => {
    Object.assign(coreSessionState, {
      sessionId: 42,
      documentId: 9,
      confirmedRevision: 4,
      isActive: true,
      filePath: '/notes/a.md',
    });
    invokeMock.mockImplementation((_command: string, payload: { export_request_id: string }) => Promise.resolve({
      schema_version: 1,
      session_id: 42,
      document_id: 9,
      base_revision: 5,
      export_request_id: payload.export_request_id,
      metadata: { frontmatter: null },
      blocks: [
        {
          id: 'b1',
          kind: { type: 'paragraph' },
          source_range: { start: 0, end: 6 },
          content_range: { start: 0, end: 6 },
          line_range: { start: 0, end: 1 },
          source: '内容',
        },
      ],
      assets: [],
      diagnostics: [],
    }));

    const result = await exportRenderedDocument('word', null, '/notes/a.md');
    expect(result).toBe(true);
    expect(createDocxFromHtmlMock).toHaveBeenCalledWith(
      expect.stringContaining('<p>内容</p>'),
      'a',
      expect.any(Object),
    );
    expect(saveDocxFileMock).toHaveBeenCalledWith(expect.any(Uint8Array), 'a.docx', {
      sessionId: 42,
      documentId: 9,
      baseRevision: 5,
      requestId: expect.any(String),
    });
  });

  it('passes print HTML and the active document name to PDF export', async () => {
    Object.assign(coreSessionState, {
      sessionId: 42,
      documentId: 9,
      confirmedRevision: 4,
      isActive: true,
      filePath: '/notes/a.md',
    });
    invokeMock.mockImplementation((_command: string, payload: { export_request_id: string }) => Promise.resolve({
      schema_version: 1,
      session_id: 42,
      document_id: 9,
      base_revision: 5,
      export_request_id: payload.export_request_id,
      metadata: { frontmatter: null },
      blocks: [
        {
          id: 'b1',
          kind: { type: 'paragraph' },
          source_range: { start: 0, end: 6 },
          content_range: { start: 0, end: 6 },
          line_range: { start: 0, end: 1 },
          source: '内容',
        },
      ],
      assets: [],
      diagnostics: [],
    }));

    const result = await exportRenderedDocument('pdf', null, '/notes/a.md');

    expect(result).toBe(true);
    expect(triggerPdfExportMock).toHaveBeenCalledWith(
      expect.stringContaining('@media print {'),
      'a.pdf',
      {
        sessionId: 42,
        documentId: 9,
        baseRevision: 5,
        requestId: expect.any(String),
      },
    );
  });

  it('reports export failure when backend command throws', async () => {
    saveDocumentExportMock.mockRejectedValue(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.assign(coreSessionState, {
      sessionId: 42,
      documentId: 9,
      confirmedRevision: 4,
      isActive: true,
      filePath: '/notes/a.md',
    });
    invokeMock.mockImplementation((_command: string, payload: { export_request_id: string }) => Promise.resolve({
      schema_version: 1,
      session_id: 42,
      document_id: 9,
      base_revision: 5,
      export_request_id: payload.export_request_id,
      metadata: { frontmatter: null },
      blocks: [],
      assets: [],
      diagnostics: [],
    }));
    const result = await exportRenderedDocument('html', null, '/notes/a.md');
    expect(result).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('导出失败，请重试');
  });

  it('does not allow concurrent exports', async () => {
    saveDocumentExportMock.mockImplementation(() => new Promise(() => {}));
    Object.assign(coreSessionState, {
      sessionId: 42,
      documentId: 9,
      confirmedRevision: 4,
      isActive: true,
      filePath: '/notes/a.md',
    });
    invokeMock.mockImplementation((_command: string, payload: { export_request_id: string }) => Promise.resolve({
      schema_version: 1,
      session_id: 42,
      document_id: 9,
      base_revision: 5,
      export_request_id: payload.export_request_id,
      metadata: { frontmatter: null },
      blocks: [],
      assets: [],
      diagnostics: [],
    }));

    void exportRenderedDocument('html', null, '/notes/a.md');
    const second = exportRenderedDocument('html', null, '/notes/a.md');

    expect(await second).toBe(false);
  });
});
