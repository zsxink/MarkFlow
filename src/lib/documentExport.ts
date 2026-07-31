import { showToast } from '../components/toast';
import { createToastRouteContext, showRoutedToast } from '../app-service/notifications';
import { saveDocumentExport, type ExportHostIdentity } from './storage';
import { getFileName } from './pathUtils';
import { getExportDocument, generateRequestId } from './coreBridge';
import { flushCoreSession, getCoreSessionState } from './coreSession';
import { renderExportIrToHtmlContent } from './exportIrRenderer';
import { logDebug, logException } from './logger';
import { waitForFontsReady } from './exportSnapshot';
import { triggerPdfExport, exportPdfToFile } from './pdfExport';
import { createDocxFromHtml, saveDocxFile } from './docxExport';
import { buildExportTheme, exportThemeToCss, generateInlineFontCss, type ExportTheme } from './exportTheme';
import { assertHostResultIdentity } from '../host-bridge/resultRouting';

export type ExportFormat = 'html' | 'word' | 'pdf' | 'print';

let exportInProgress = false;

/**
 * Build an ExportTheme from the live editor's current theme state.
 * Reads `data-theme` from the editor's `.ProseMirror` root element.
 */
function buildThemeFromEditor(renderedRoot: HTMLElement | null): ExportTheme {
  const themeAttr = renderedRoot?.getAttribute('data-theme') ?? null;
  return buildExportTheme(themeAttr);
}

export function getExportFileName(
  path: string | null | undefined,
  format: Exclude<ExportFormat, 'print'>,
): string {
  const fileName = path ? getFileName(path) : 'untitled';
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = format === 'word' ? 'docx' : format;
  return `${baseName || 'untitled'}.${extension}`;
}

/**
 * Create a self-contained HTML document from rendered snapshot.
 * Uses ExportTheme for CSS instead of hardcoded EXPORT_STYLE.
 * The snapshot preserves the `.ProseMirror` root with `data-theme`.
 * Includes inline font-face declarations for offline display.
 */
export async function createHtmlExport(
  title: string,
  renderedHtml: string,
  theme?: ExportTheme,
  options?: { print?: boolean },
): Promise<string> {
  const resolvedTheme = theme ?? buildExportTheme('light');
  const themeCss = exportThemeToCss(
    resolvedTheme,
    options?.print ? { print: true } : undefined,
  );

  // Generate inline font-face CSS with base64 data URIs for self-contained HTML
  let fontCss = '';
  try {
    fontCss = await generateInlineFontCss();
  } catch {
    // If font inlining fails, proceed without inline fonts
  }

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
${fontCss ? fontCss + '\n\n' : ''}${themeCss}
  </style>
</head>
<body>
${renderedHtml}
</body>
</html>`;
}

export async function exportRenderedDocument(
  format: ExportFormat,
  renderedRoot: HTMLElement | null,
  activePath: string | null | undefined,
): Promise<boolean> {
  if (exportInProgress) {
    showToast('正在导出中，请稍候');
    return false;
  }
  const initialSessionForContent = getCoreSessionState();
  if (!initialSessionForContent.isActive || initialSessionForContent.sessionId <= 0) {
    showToast('导出需要已确认的 Core 会话');
    return false;
  }

  const title = getExportFileName(activePath, 'html').replace(/\.html$/, '');
  const theme = buildThemeFromEditor(renderedRoot);
  const toastRoute = createToastRouteContext({
    sessionId: initialSessionForContent.isActive ? initialSessionForContent.sessionId : undefined,
  });

  exportInProgress = true;
  try {
    await waitForFontsReady();
    const rendered = await buildConfirmedRevisionHtml();
    const renderedHtml = rendered.html;

    if (format === 'print') {
      // "Print..." — use the system print dialog (existing flow, task 4.6)
      return await triggerPdfExport(await createHtmlExport(title, renderedHtml, theme), rendered.identity);
    }

    if (format === 'pdf') {
      // "Export PDF (.pdf)" — generate PDF file directly via platform API
      return await exportPdfToFile(
        await createHtmlExport(title, renderedHtml, theme, { print: true }),
        getExportFileName(activePath, 'pdf'),
        rendered.identity,
      );
    }

    if (format === 'word') {
      const docxData = await createDocxFromHtml(renderedHtml, title, theme);
      return await saveDocxFile(docxData, getExportFileName(activePath, 'word'), rendered.identity);
    }

    const output = await createHtmlExport(title, renderedHtml, theme);

    const defaultName = getExportFileName(activePath, format);

    const saved = await saveDocumentExport(output, defaultName, 'HTML 文档', ['html'], rendered.identity);
    if (!saved) return false;

    showRoutedToast('已导出 HTML 文件', toastRoute);
    return true;
  } catch (error) {
    logException('export', 'Failed to export document', error);
    showRoutedToast('导出失败，请重试', toastRoute);
    return false;
  } finally {
    exportInProgress = false;
  }
}

interface RenderedExportHtml {
  html: string;
  identity?: ExportHostIdentity;
}

async function buildConfirmedRevisionHtml(): Promise<RenderedExportHtml> {
  const initialSession = getCoreSessionState();
  if (initialSession.isActive && initialSession.sessionId > 0) {
    const exportRequestId = generateRequestId();
    const revision = await flushCoreSession();
    const latestSession = getCoreSessionState();
    if (!latestSession.isActive || latestSession.sessionId !== initialSession.sessionId) {
      throw new Error('EXPORT_SESSION_CHANGED: export session changed during flush');
    }
    const exportDocument = await getExportDocument(
      initialSession.sessionId,
      revision,
      exportRequestId,
      { max_schema_version: 1, include_diagnostics: true },
    );
    assertHostResultIdentity(
      {
        requestId: exportRequestId,
        sessionId: initialSession.sessionId,
        documentId: initialSession.documentId,
        baseRevision: revision,
      },
      {
        requestId: exportDocument.export_request_id,
        sessionId: exportDocument.session_id,
        documentId: exportDocument.document_id,
        baseRevision: exportDocument.base_revision,
      },
    );
    const currentSession = getCoreSessionState();
    assertHostResultIdentity(
      { sessionId: initialSession.sessionId },
      {
        sessionId: currentSession.isActive ? currentSession.sessionId : undefined,
      },
    );
    logDebug('export', 'Using Core Export IR', {
      sessionId: exportDocument.session_id,
      revision: exportDocument.base_revision,
      requestId: exportDocument.export_request_id,
      blockCount: exportDocument.blocks.length,
      diagnosticCount: exportDocument.diagnostics.length,
    });
    return {
      html: wrapExportIrHtml(renderExportIrToHtmlContent(exportDocument), exportDocument),
      identity: {
        sessionId: exportDocument.session_id,
        documentId: exportDocument.document_id,
        baseRevision: exportDocument.base_revision,
        requestId: exportDocument.export_request_id,
      },
    };
  }

  throw new Error('EXPORT_CORE_SESSION_UNAVAILABLE: export requires an active Core session');
}

function wrapExportIrHtml(
  renderedHtml: string,
  exportDocument: { schema_version: number; session_id: number; base_revision: number },
): string {
  return [
    `<div class="ProseMirror" data-export-ir-schema-version="${exportDocument.schema_version}" data-session-id="${exportDocument.session_id}" data-revision="${exportDocument.base_revision}">`,
    renderedHtml,
    '</div>',
  ].join('\n');
}


function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!);
}
