import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { waitForAppReady } from '../../page-objects/app.mjs';

const END_MARKER = 'MARKFLOW_PDF_END_MARKER_183';

function buildLongPdfHtml() {
  const paragraphs = Array.from(
    { length: 140 },
    (_, index) => `<p>第 ${index + 1} 段：MarkFlow 原生 PDF 导出回归验证内容。</p>`,
  ).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: -apple-system, "PingFang SC", sans-serif; font-size: 16px; line-height: 1.7; }
    h1 { break-after: avoid; }
  </style>
</head>
<body>
  <div class="ProseMirror">
    <h1>MarkFlow PDF Export #183</h1>
    ${paragraphs}
    <p>${END_MARKER}</p>
  </div>
</body>
</html>`;
}

function inspectPdfWithAvailableTools(pdfPath) {
  try {
    const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
    const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
    expect(pages).toBeGreaterThan(1);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  try {
    const text = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
    expect(text).toContain(END_MARKER);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

describe('macOS native PDF export regression', () => {
  it('exports two valid, complete PDFs through the real Tauri backend', async function () {
    if (process.platform !== 'darwin') this.skip();
    await waitForAppReady();

    const htmlContent = buildLongPdfHtml();
    const outputPaths = [1, 2].map(index =>
      path.join(process.env.MARKFLOW_E2E_WORKSPACE, `native-export-${index}.pdf`),
    );

    try {
      for (const outputPath of outputPaths) {
        const result = await browser.tauri.execute(
          ({ core }, html, destination) =>
            core.invoke('create_pdf', { htmlContent: html, outputPath: destination }),
          htmlContent,
          outputPath,
        );

        const bytes = await readFile(outputPath);
        expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
        expect(bytes.length).toBeGreaterThan(1_000);
        expect(result.bytesWritten).toBe(bytes.length);
        inspectPdfWithAvailableTools(outputPath);
      }

      expect(await browser.getWindowHandles()).toHaveLength(1);
    } finally {
      await Promise.all(outputPaths.map(outputPath => rm(outputPath, { force: true })));
    }
  });
});
