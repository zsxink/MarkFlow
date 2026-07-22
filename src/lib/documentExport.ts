import { showToast } from '../components/toast';
import { saveDocumentExport } from './storage';
import { getFileName } from './pathUtils';
import { logException } from './logger';
import { buildExportSnapshot } from './exportSnapshot';
import { triggerPdfExport } from './pdfExport';
import { createDocxFromHtml, saveDocxFile } from './docxExport';

export type ExportFormat = 'html' | 'word' | 'pdf';

const EXPORT_STYLE = `
  :root { color-scheme: light; }
  body { max-width: 860px; margin: 0 auto; padding: 40px; color: #1f2937; font: 16px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  img, svg, video { max-width: 100%; height: auto; }
  pre { overflow: auto; padding: 12px; border-radius: 6px; background: #f3f4f6; }
  code { font-family: "SFMono-Regular", Consolas, monospace; }
  blockquote { margin-left: 0; padding-left: 1em; border-left: 3px solid #d1d5db; color: #4b5563; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px; border: 1px solid #d1d5db; text-align: left; }
  @media print { body { max-width: none; padding: 0; } }
`;

let exportInProgress = false;

export function getExportFileName(path: string | null | undefined, format: Exclude<ExportFormat, 'pdf'>): string {
  const fileName = path ? getFileName(path) : 'untitled';
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${baseName || 'untitled'}.${format === 'word' ? 'docx' : 'html'}`;
}

export function createHtmlExport(title: string, renderedHtml: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${EXPORT_STYLE}</style>
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
  exportInProgress = true;
  try {
    const snapshot = await buildExportSnapshot(renderedRoot);
    const div = document.createElement('div');
    div.appendChild(snapshot.cloneNode(true));
    const renderedHtml = div.innerHTML;

    if (format === 'pdf') {
      return await triggerPdfExport(createHtmlExport(title, renderedHtml));
    }

    if (format === 'word') {
      const docxData = await createDocxFromHtml(renderedHtml, title);
      return await saveDocxFile(docxData, getExportFileName(activePath, 'word'));
    }

    const output = createHtmlExport(title, renderedHtml);

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
