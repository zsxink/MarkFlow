import { showToast } from '../components/toast';
import { saveDocumentExport } from './storage';
import { getFileName } from './pathUtils';
import { logException } from './logger';
import { buildExportSnapshot, waitForFontsReady } from './exportSnapshot';
import { triggerPdfExport, exportPdfToFile } from './pdfExport';
import { createDocxFromHtml, saveDocxFile } from './docxExport';
import { buildExportTheme, exportThemeToCss, generateInlineFontCss, type ExportTheme } from './exportTheme';

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

export function getExportFileName(path: string | null | undefined, format: Exclude<ExportFormat, 'pdf' | 'print'>): string {
  const fileName = path ? getFileName(path) : 'untitled';
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${baseName || 'untitled'}.${format === 'word' ? 'docx' : 'html'}`;
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
): Promise<string> {
  const resolvedTheme = theme ?? buildExportTheme('light');
  const themeCss = exportThemeToCss(resolvedTheme);

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
  if (!renderedRoot) {
    showToast('没有可导出的文档内容');
    return false;
  }

  const title = getExportFileName(activePath, 'html').replace(/\.html$/, '');
  const theme = buildThemeFromEditor(renderedRoot);

  exportInProgress = true;
  try {
    // Wait for fonts to be ready before snapshot (task 3.6)
    await waitForFontsReady();

    const snapshot = await buildExportSnapshot(renderedRoot);
    const div = document.createElement('div');
    div.appendChild(snapshot.cloneNode(true));
    const renderedHtml = div.innerHTML;

    if (format === 'print') {
      // "Print..." — use the system print dialog (existing flow, task 4.6)
      return await triggerPdfExport(await createHtmlExport(title, renderedHtml, theme));
    }

    if (format === 'pdf') {
      // "Export PDF (.pdf)" — generate PDF file directly via platform API
      return await exportPdfToFile(await createHtmlExport(title, renderedHtml, theme));
    }

    if (format === 'word') {
      const docxData = await createDocxFromHtml(renderedHtml, title, theme);
      return await saveDocxFile(docxData, getExportFileName(activePath, 'word'));
    }

    const output = await createHtmlExport(title, renderedHtml, theme);

    const defaultName = getExportFileName(activePath, format);

    const saved = await saveDocumentExport(output, defaultName, 'HTML 文档', ['html']);
    if (!saved) return false;

    showToast('已导出 HTML 文件');
    return true;
  } catch (error) {
    logException('export', 'Failed to export document', error);
    showToast('导出失败，请重试');
    return false;
  } finally {
    exportInProgress = false;
  }
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
