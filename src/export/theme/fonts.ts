// ── Font inlining for self-contained HTML exports ─────────────────────────

/** Font file descriptors for inline @font-face generation */
const FONT_FILES: Array<{
  family: string;
  weight: number;
  style: string;
  url: string; // relative to app root, e.g. '/assets/fonts/SourceSerif4-Regular.ttf.woff2'
}> = [
  // Source Serif 4 (Latin serif)
  { family: 'Source Serif 4', weight: 400, style: 'normal', url: '/assets/fonts/SourceSerif4-Regular.ttf.woff2' },
  { family: 'Source Serif 4', weight: 400, style: 'italic', url: '/assets/fonts/SourceSerif4SmText-It.ttf.woff2' },
  { family: 'Source Serif 4', weight: 700, style: 'normal', url: '/assets/fonts/SourceSerif4-Bold.ttf.woff2' },
  { family: 'Source Serif 4', weight: 700, style: 'italic', url: '/assets/fonts/SourceSerif4-BoldIt.ttf.woff2' },
  // MarkFlow Serif SC (GB2312 Level 1 subset of Source Han Serif SC, common subset)
  { family: 'MarkFlow Serif SC', weight: 400, style: 'normal', url: '/assets/fonts/SourceHanSerifSC-Regular-common.woff2' },
  { family: 'MarkFlow Serif SC', weight: 700, style: 'normal', url: '/assets/fonts/SourceHanSerifSC-Bold-common.woff2' },
];

/**
 * Generate @font-face CSS rules with base64-inline data URIs.
 * Fetches each font file from the app's served assets and converts to data URI.
 * Falls back to external URL references if fetch fails.
 */
export async function generateInlineFontCss(): Promise<string> {
  const lines: string[] = [];

  for (const font of FONT_FILES) {
    try {
      const response = await fetch(font.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const base64 = await blobToBase64(blob);
      const dataUri = `data:font/woff2;base64,${base64}`;
      lines.push(buildFontFaceRule(font.family, font.weight, font.style, dataUri));
    } catch {
      // Fallback: reference the font URL directly (will work in app context but not offline)
      lines.push(buildFontFaceRule(font.family, font.weight, font.style, font.url));
    }
  }

  return lines.join('\n');
}

function buildFontFaceRule(
  family: string,
  weight: number,
  style: string,
  src: string,
): string {
  return `@font-face {
  font-family: '${family}';
  src: url('${src}') format('woff2');
  font-weight: ${weight};
  font-style: ${style};
  font-display: block;
}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Extract just the base64 part (after "data:font/woff2;base64,")
      const base64 = dataUrl.split(',')[1];
      if (base64) {
        resolve(base64);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
