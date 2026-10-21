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

export function inspectPdfWithAvailableTools(pdfPath, {
  execFile = execFileSync,
  warn = console.warn,
} = {}) {
  try {
    const info = execFile('pdfinfo', [pdfPath], { encoding: 'utf8' });
    const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
    expect(pages).toBeGreaterThan(1);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    warn('SKIPPED: pdfinfo is unavailable; PDF page-count assertion was not run.');
  }

  try {
    const text = execFile('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
    expect(text).toContain(END_MARKER);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    warn('SKIPPED: pdftotext is unavailable; PDF text completeness assertion was not run.');
  }
}

describe('macOS native PDF export regression', () => {
  it('warns for each unavailable Poppler tool without skipping the other check', () => {
    const warnings = [];
    const calls = [];
    const execFile = (command) => {
      calls.push(command);
      if (command === 'pdfinfo') {
        const error = new Error('missing');
        error.code = 'ENOENT';
        throw error;
      }
      return `${END_MARKER}`;
    };
    inspectPdfWithAvailableTools('/unused.pdf', { execFile, warn: (message) => warnings.push(message) });
    expect(calls).toEqual(['pdfinfo', 'pdftotext']);
    expect(warnings).toEqual([
      'SKIPPED: pdfinfo is unavailable; PDF page-count assertion was not run.',
    ]);

    warnings.length = 0;
    inspectPdfWithAvailableTools('/unused.pdf', {
      execFile: (command) => {
        if (command === 'pdfinfo') return 'Pages: 2';
        const error = new Error('missing');
        error.code = 'ENOENT';
        throw error;
      },
      warn: (message) => warnings.push(message),
    });
    expect(warnings).toEqual([
      'SKIPPED: pdftotext is unavailable; PDF text completeness assertion was not run.',
    ]);
  });

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
