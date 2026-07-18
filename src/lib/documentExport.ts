import { showToast } from '../components/toast';
import { readFileAsBase64, saveDocumentExport } from './storage';
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
    await convertLocalImages(renderedRoot);
    const renderedHtml = renderedRoot.innerHTML;

    if (format === 'pdf') {
      return await printDocument(createHtmlExport(title, renderedHtml));
    }

    const output = format === 'word'
      ? createWordExport(title, renderedHtml)
      : createHtmlExport(title, renderedHtml);

    const defaultName = getExportFileName(activePath, format);
    const filterName = format === 'word' ? 'Word 文档' : 'HTML 文档';
    const extensions = [format === 'word' ? 'doc' : 'html'];

    const saved = await saveDocumentExport(output, defaultName, filterName, extensions);
    if (!saved) return false;

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

export function printDocument(documentHtml: string, hostDocument: Document = document): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.setTimeout(() => {
        iframe.remove();
        resolve(value);
      }, 1000);
    };

    const iframe = hostDocument.createElement('iframe');
    iframe.setAttribute('title', 'MarkFlow PDF export');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';

    // Safety timeout: if load never fires, clean up and resolve false
    const safetyTimeout = window.setTimeout(() => {
      settle(false);
    }, 10_000);

    iframe.addEventListener('load', () => {
      clearTimeout(safetyTimeout);
      try {
        const printWindow = iframe.contentWindow;
        if (!printWindow) throw new Error('Print frame is unavailable');
        printWindow.focus();
        printWindow.print();
        settle(true);
      } catch (error) {
        console.error('Failed to open print dialog', error);
        showToast('无法打开 PDF 打印窗口');
        settle(false);
      }
    }, { once: true });

    hostDocument.body.appendChild(iframe);
    iframe.srcdoc = documentHtml;
  });
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

function assetUrlToFsPath(assetUrl: string): string {
  // asset://localhost/path/to/image.png → /path/to/image.png
  let path = assetUrl.replace(/^asset:\/\/localhost/, '');
  // URL-decode the path
  path = decodeURIComponent(path);
  // On Windows asset://localhost/C:/ → /C:/ → C:/
  if (path.match(/^\/[A-Za-z]:\//)) path = path.slice(1);
  return path;
}

function inferMimeType(src: string): string {
  const ext = src.split('.').pop()?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
  };
  return mimeMap[ext] ?? 'image/png';
}

async function convertLocalImages(root: HTMLElement): Promise<void> {
  const images = root.querySelectorAll('img');
  const conversions: Promise<void>[] = [];

  images.forEach(img => {
    const src = img.getAttribute('src');
    if (!src || !src.startsWith('asset://')) return;

    const promise = (async () => {
      try {
        const fsPath = assetUrlToFsPath(src);
        const base64 = await readFileAsBase64(fsPath);
        const mimeType = inferMimeType(src);
        img.setAttribute('src', `data:${mimeType};base64,${base64}`);
      } catch (error) {
        console.warn('Failed to convert image to data URI, keeping original:', src, error);
      }
    })();

    conversions.push(promise);
  });

  await Promise.all(conversions);
}
