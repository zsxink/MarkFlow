import { save } from '@tauri-apps/plugin-dialog';
import { showToast } from '../components/toast';
import { writeFile } from './storage';
import { getFileName } from './pathUtils';

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
  return `${baseName || 'untitled'}.${format === 'word' ? 'doc' : 'html'}`;
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

export function createWordExport(title: string, renderedHtml: string): string {
  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="ProgId" content="Word.Document">
  <meta name="Generator" content="MarkFlow">
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
  if (exportInProgress) return false;
  if (!renderedRoot) {
    showToast('没有可导出的文档内容');
    return false;
  }

  const title = getExportFileName(activePath, 'html').replace(/\.html$/, '');
  const renderedHtml = renderedRoot.innerHTML;
  exportInProgress = true;
  try {
    if (format === 'pdf') {
      return printDocument(createHtmlExport(title, renderedHtml));
    }

    const targetPath = await save({
      title: `导出 ${format === 'word' ? 'Word' : 'HTML'}`,
      defaultPath: getExportFileName(activePath, format),
      filters: [{ name: format === 'word' ? 'Word 文档' : 'HTML 文档', extensions: [format === 'word' ? 'doc' : 'html'] }],
    });
    if (!targetPath) return false;

    const output = format === 'word'
      ? createWordExport(title, renderedHtml)
      : createHtmlExport(title, renderedHtml);
    await writeFile(targetPath, output);
    showToast(`已导出${format === 'word' ? ' Word 文档' : ' HTML 文件'}`);
    return true;
  } catch (error) {
    console.error('Failed to export document', error);
    showToast('导出失败，请重试');
    return false;
  } finally {
    exportInProgress = false;
  }
}

export function printDocument(documentHtml: string, hostDocument: Document = document): boolean {
  const iframe = hostDocument.createElement('iframe');
  iframe.setAttribute('title', 'MarkFlow PDF export');
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';

  iframe.addEventListener('load', () => {
    try {
      const printWindow = iframe.contentWindow;
      if (!printWindow) throw new Error('Print frame is unavailable');
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      console.error('Failed to open print dialog', error);
      showToast('无法打开 PDF 打印窗口');
    } finally {
      window.setTimeout(() => iframe.remove(), 1000);
    }
  }, { once: true });
  hostDocument.body.appendChild(iframe);

  const frameDocument = iframe.contentDocument;
  if (!frameDocument) {
    iframe.remove();
    showToast('无法打开 PDF 打印窗口');
    return false;
  }
  frameDocument.open();
  frameDocument.write(documentHtml);
  frameDocument.close();
  return true;
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
