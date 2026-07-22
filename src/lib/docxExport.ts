import { logException, logDebug, logInfo } from './logger';
import { showToast } from '../components/toast';
import { invoke } from '@tauri-apps/api/core';
import { convertSvgToPngDataUrl } from './exportSnapshot';

function d(): Promise<typeof import('docx')> {
  return import('docx');
}

/**
 * Create a real OOXML .docx file from cleaned HTML content.
 * Uses the `docx` npm package, lazy-loaded to avoid increasing the main bundle.
 */
export async function createDocxFromHtml(html: string, _title: string): Promise<Uint8Array> {
  const docx = await d();

  // Parse HTML to DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const bodyEl = doc.body;

  // Pre-process: convert SVGs to PNG data URIs
  const svgs = bodyEl.querySelectorAll('svg');
  for (let i = 0; i < svgs.length; i++) {
    try {
      const pngDataUrl = await convertSvgToPngDataUrl(svgs[i] as unknown as SVGElement);
      const img = doc.createElement('img');
      img.setAttribute('src', pngDataUrl);
      img.setAttribute('alt', svgs[i].getAttribute('alt') || 'chart');
      svgs[i].parentNode?.replaceChild(img, svgs[i]);
    } catch (e) {
      logDebug('export.docx', 'Failed to convert SVG to PNG', { error: String(e) });
    }
  }

  const children: any[] = [];
  processNodeList(bodyEl.childNodes, children, docx);

  // Build the document
  const docxDoc = new docx.Document({
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 24 },
          paragraph: { spacing: { after: 200 } },
        },
        heading1: {
          run: { font: 'Times New Roman', size: 36, bold: true, color: '1F2937' },
          paragraph: { spacing: { before: 360, after: 200 } },
        },
        heading2: {
          run: { font: 'Times New Roman', size: 30, bold: true, color: '374151' },
          paragraph: { spacing: { before: 360, after: 200 } },
        },
        heading3: {
          run: { font: 'Times New Roman', size: 26, bold: true, color: '4B5563' },
          paragraph: { spacing: { before: 360, after: 200 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 in twips
            margin: {
              top: docx.convertInchesToTwip(1),
              right: docx.convertInchesToTwip(1),
              bottom: docx.convertInchesToTwip(1),
              left: docx.convertInchesToTwip(1),
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await docx.Packer.toBuffer(docxDoc);
  const uint8 = new Uint8Array(buffer);
  logInfo('export.docx', 'DOCX generated', { size: uint8.length });
  return uint8;
}

/**
 * Save a DOCX binary via Tauri native save dialog.
 */
export async function saveDocxFile(data: Uint8Array, defaultName: string): Promise<boolean> {
  try {
    const saved = await invoke<boolean>('save_binary_export', {
      data: Array.from(data),
      defaultName,
      filterName: 'Word 文档',
      extensions: ['docx'],
    });
    if (saved) {
      showToast('已导出 Word 文档');
      logInfo('export.docx', 'DOCX saved successfully', { fileName: defaultName });
    }
    return saved;
  } catch (error) {
    logException('export.docx', 'Failed to save DOCX file', error);
    showToast('导出失败，请重试');
    return false;
  }
}

// --- DOM-to-DOCX processing ---

function processNodeList(nodes: NodeList, children: any[], docx: any): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.nodeType === Node.ELEMENT_NODE) {
      processElement(node as HTMLElement, children, docx, nodes, i);
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        children.push(
          new docx.Paragraph({
            children: [new docx.TextRun({ text, size: 24 })],
            spacing: { after: 200 },
          }),
        );
      }
    }
  }
}

function processElement(el: HTMLElement, children: any[], docx: any, _parentNodes?: NodeList, _index?: number): void {
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const level = parseInt(tag[1], 10) as 1 | 2 | 3 | 4 | 5 | 6;
      const headingLevels = [
        docx.HeadingLevel.HEADING_1,
        docx.HeadingLevel.HEADING_2,
        docx.HeadingLevel.HEADING_3,
        docx.HeadingLevel.HEADING_4,
        docx.HeadingLevel.HEADING_5,
        docx.HeadingLevel.HEADING_6,
      ];
      children.push(
        new docx.Paragraph({
          children: buildTextRuns(el, docx),
          heading: headingLevels[level - 1],
          spacing: { before: 360, after: 200 },
        }),
      );
      break;
    }

    case 'p': {
      const align = getAlignment(el, docx);
      children.push(
        new docx.Paragraph({
          children: buildTextRuns(el, docx),
          spacing: { after: 200 },
          alignment: align,
        }),
      );
      break;
    }

    case 'blockquote': {
      children.push(
        new docx.Paragraph({
          children: buildTextRuns(el, docx),
          spacing: { before: 200, after: 200 },
          indent: { left: docx.convertInchesToTwip(0.5) },
          shading: { type: docx.ShadingType.CLEAR, fill: 'F3F4F6' },
        }),
      );
      break;
    }

    case 'pre': {
      const codeEl = el.querySelector('code');
      const codeText = codeEl?.textContent || el.textContent || '';
      // Split code into lines for better wrapping
      const lines = codeText.split('\n');
      lines.forEach((line, i) => {
        if (line === '' && i === lines.length - 1) return;
        children.push(
          new docx.Paragraph({
            children: [new docx.TextRun({ text: line || ' ', font: 'Consolas', size: 20 })],
            spacing: { before: i === 0 ? 200 : 0, after: i === lines.length - 1 ? 200 : 0 },
            indent: { left: docx.convertInchesToTwip(0.3) },
            shading: { type: docx.ShadingType.CLEAR, fill: 'F3F4F6' },
          }),
        );
      });
      break;
    }

    case 'code': {
      // Inline code inside a paragraph — handled by buildTextRuns
      // Block-level <code> without <pre> parent: treat as code block
      if (el.parentElement?.tagName === 'PRE') break;
      const codeText = el.textContent || '';
      children.push(
        new docx.Paragraph({
          children: [new docx.TextRun({ text: codeText, font: 'Consolas', size: 20 })],
          spacing: { before: 200, after: 200 },
          indent: { left: docx.convertInchesToTwip(0.3) },
          shading: { type: docx.ShadingType.CLEAR, fill: 'F3F4F6' },
        }),
      );
      break;
    }

    case 'hr': {
      children.push(
        new docx.Paragraph({
          children: [new docx.TextRun({ text: '─────────────────────', color: '9CA3AF', size: 20 })],
          spacing: { before: 200, after: 200 },
          alignment: docx.AlignmentType.CENTER,
        }),
      );
      break;
    }

    case 'ul': case 'ol': {
      const isOrdered = tag === 'ol';
      const items = el.querySelectorAll(':scope > li');
      let itemIndex = 0;
      items.forEach((li) => {
        itemIndex++;
        const liEl = li as HTMLElement;
        const checkboxEl = liEl.querySelector('input[type="checkbox"]');
        const isTask = !!checkboxEl;
        const checked = isTask ? (checkboxEl as HTMLInputElement).checked : false;
        const prefix = isTask ? (checked ? '☑ ' : '☐ ') : (isOrdered ? `${itemIndex}. ` : '• ');
        children.push(
          new docx.Paragraph({
            children: [new docx.TextRun({ text: prefix, size: 24, bold: !isOrdered && !isTask }), ...buildTextRuns(liEl, docx)],
            spacing: { after: 100 },
            indent: { left: docx.convertInchesToTwip(0.5), hanging: docx.convertInchesToTwip(0.25) },
          }),
        );
      });
      break;
    }

    case 'table': {
      const rowEls = el.querySelectorAll(':scope > tr, :scope > tbody > tr, :scope > thead > tr');
      const tableRows: any[] = [];
      let isHeader = true;

      rowEls.forEach(row => {
        const cells = row.querySelectorAll(':scope > td, :scope > th');
        const tableCells: any[] = [];

        cells.forEach(cell => {
          const cellText = cell.textContent?.trim() || '';
          tableCells.push(
            new docx.TableCell({
              children: [
                new docx.Paragraph({
                  children: [new docx.TextRun({ text: cellText, size: 22, bold: isHeader })],
                }),
              ],
              width: { size: 100 / cells.length, type: docx.WidthType.PERCENTAGE },
              shading: isHeader ? { type: docx.ShadingType.CLEAR, fill: 'F3F4F6' } : undefined,
              borders: {
                top: { style: docx.BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                bottom: { style: docx.BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                left: { style: docx.BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                right: { style: docx.BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
              },
            }),
          );
        });

        tableRows.push(new docx.TableRow({ children: tableCells }));
        isHeader = false;
      });

      if (tableRows.length > 0) {
        children.push(
          new docx.Table({
            rows: tableRows,
            width: { size: 100, type: docx.WidthType.PERCENTAGE },
          }),
        );
        // spacing after table
        children.push(new docx.Paragraph({ children: [new docx.TextRun({ text: '', size: 12 })] }));
      }
      break;
    }

    case 'img': {
      createImageParagraph(el, children, docx);
      break;
    }

    case 'br': {
      children.push(new docx.Paragraph({ children: [new docx.TextRun({ text: '', size: 12 })] }));
      break;
    }

    default: {
      // Generic container — process children
      if (el.children.length > 0) {
        for (let i = 0; i < el.children.length; i++) {
          processElement(el.children[i] as HTMLElement, children, docx);
        }
      } else {
        const text = el.textContent?.trim();
        if (text) {
          children.push(
            new docx.Paragraph({
              children: [new docx.TextRun({ text, size: 24 })],
              spacing: { after: 200 },
            }),
          );
        }
      }
    }
  }
}

function createImageParagraph(el: HTMLElement, children: any[], docx: any): void {
  const src = el.getAttribute('src') || '';
  if (!src.startsWith('data:')) return;

  const imgData = dataUriToUint8Array(src);
  if (!imgData) return;

  const isPng = src.includes('image/png');
  const ext = isPng ? 'png' : 'jpg';
  const naturalW = parseInt(el.getAttribute('width') || '400', 10);
  const naturalH = parseInt(el.getAttribute('height') || '300', 10);
  const maxW = 500;
  let w = Math.min(naturalW, maxW);
  let h = Math.round(naturalH * (w / naturalW));

  try {
    children.push(
      new docx.Paragraph({
        children: [
          new docx.ImageRun({
            data: imgData,
            transformation: { width: w, height: h },
            type: ext,
            floating: {
              horizontalPosition: {
                align: docx.AlignmentType.CENTER,
                relative: docx.RelativeHorizontalPosition.MARGIN,
              },
              verticalPosition: {
                align: docx.VerticalPositionAlign.CENTER,
                relative: docx.VerticalPositionRelativeFrom.PARAGRAPH,
              },
            },
          }),
        ],
        alignment: docx.AlignmentType.CENTER,
        spacing: { before: 200, after: 200 },
      }),
    );
  } catch {
    // fallback: non-floating image
    try {
      children.push(
        new docx.Paragraph({
          children: [new docx.ImageRun({ data: imgData, transformation: { width: w, height: h }, type: ext })],
          alignment: docx.AlignmentType.CENTER,
          spacing: { before: 200, after: 200 },
        }),
      );
    } catch {
      logDebug('export.docx', 'Failed to embed image', { src: src.slice(0, 50) });
    }
  }
}

// --- Inline text runs ---

function buildTextRuns(parent: HTMLElement, docx: any): any[] {
  const rawRuns: any[] = [];

  function walk(nodes: NodeList, bold = false, italic = false, strike = false, code = false, linkHref?: string) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (!text.trim() && rawRuns.length > 0) continue;
        rawRuns.push({
          text,
          bold,
          italics: italic,
          strike,
          font: code ? 'Consolas' : undefined,
          size: code ? 20 : 24,
          ...(linkHref ? { link: linkHref } : {}),
        });
        continue;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      switch (tag) {
        case 'strong': case 'b':
          walk(el.childNodes, true, italic, strike, code, linkHref);
          break;
        case 'em': case 'i':
          walk(el.childNodes, bold, true, strike, code, linkHref);
          break;
        case 's': case 'del': case 'strike':
          walk(el.childNodes, bold, italic, true, code, linkHref);
          break;
        case 'code':
          walk(el.childNodes, bold, italic, strike, true, linkHref);
          break;
        case 'a':
          walk(el.childNodes, bold, italic, strike, code, el.getAttribute('href') || undefined);
          break;
        case 'br':
          rawRuns.push({ text: '\n', size: 12 });
          break;
        case 'span': {
          const style = el.getAttribute('style') || '';
          const isCode = style.includes('Consolas') || style.includes('monospace');
          walk(el.childNodes, bold, italic, strike, code || isCode, linkHref);
          break;
        }
        default:
          walk(el.childNodes, bold, italic, strike, code, linkHref);
      }
    }
  }

  walk(parent.childNodes);
  return rawRuns.map(r => new docx.TextRun(r));
}

function getAlignment(el: HTMLElement, docx: any): number | undefined {
  const style = el.getAttribute('style') || '';
  const m = style.match(/text-align\s*:\s*(\w+)/);
  if (!m) return undefined;
  switch (m[1]) {
    case 'center': return docx.AlignmentType.CENTER;
    case 'right': return docx.AlignmentType.RIGHT;
    case 'justify': return docx.AlignmentType.JUSTIFIED;
    default: return undefined;
  }
}

function dataUriToUint8Array(dataUri: string): Uint8Array | null {
  const m = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  try {
    const binary = atob(m[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}
