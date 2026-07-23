/**
 * Unified export theme — single source of truth for HTML / PDF / DOCX styles.
 *
 * `buildExportTheme()` reads the live editor CSS variables and `data-theme`
 * attribute so the exported document matches the editor's current look.
 *
 * `exportThemeToCss()` generates inline CSS (with optional `@page` rules for print).
 * `exportThemeToDocxStyles()` generates `docx` IStylesOptions.
 */

// ── Interfaces ────────────────────────────────────────────────────────────

export interface ThemeColors {
  fg: string;
  bg: string;
  muted: string;
  border: string;
  accent: string;
  codeBg: string;
}

export interface HeadingStyle {
  fontSize: string;   // e.g. "2.2em"
  fontWeight: number;
  borderBottom?: string; // e.g. "1px solid var(--border)"
  color?: string;
}

export interface CodeBlockStyle {
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  background: string;
  border: string;
  borderRadius: string;
  padding: string;
}

export interface InlineCodeStyle {
  fontFamily: string;
  fontSize: string;   // relative, e.g. "0.875em"
  background: string;
  color: string;
  padding: string;
  borderRadius: string;
}

export interface BlockquoteStyle {
  borderLeft: string;
  paddingLeft: string;
  marginLeft: string;
  color: string;
  fontStyle: string;
}

export interface ListStyle {
  paddingLeft: string;
  markerColor: string;
}

export interface TableStyle {
  borderCollapse: string;
  borderColor: string;
  headerBg: string;
  cellPadding: string;
}

export interface ImageStyle {
  display: string;
  maxWidth: string;
  borderRadius: string;
  margin: string;
}

export interface PageStyle {
  width: string;   // e.g. "210mm" for A4
  height: string;  // e.g. "297mm"
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
}

export interface BodyStyle {
  fontFamily: string;
  fontSize: string;   // e.g. "18px"
  lineHeight: number; // e.g. 1.7
  maxWidth: string;
}

export interface FontStack {
  latin: string;
  eastAsia: string;
  code: string;
}

export interface ExportTheme {
  page: PageStyle;
  body: BodyStyle;
  fonts: FontStack;
  colors: ThemeColors;
  headings: Record<number, HeadingStyle>; // 1-6
  codeBlock: CodeBlockStyle;
  inlineCode: InlineCodeStyle;
  blockquote: BlockquoteStyle;
  list: ListStyle;
  table: TableStyle;
  image: ImageStyle;
  hr: string; // border rule, e.g. "1px solid var(--border)"
}

// ── Build theme from editor CSS variables ─────────────────────────────────

/**
 * Default theme colors for each `data-theme` variant.
 * Falls back to light when `data-theme` is missing or unrecognized.
 */
const THEME_COLORS: Record<string, ThemeColors> = {
  light: {
    fg: '#1f2937',
    bg: '#ffffff',
    muted: '#6b7280',
    border: '#d1d5db',
    accent: '#b45309',
    codeBg: '#f3f4f6',
  },
  dark: {
    fg: '#e8e8e8',
    bg: '#1f1f23',
    muted: '#71717a',
    border: '#2e2e33',
    accent: '#e8715a',
    codeBg: '#27272a',
  },
  sepia: {
    fg: '#5c4b37',
    bg: '#faf6ed',
    muted: '#8b7355',
    border: '#e0d5c0',
    accent: '#8b5a2b',
    codeBg: '#ede5d0',
  },
};

export function buildExportTheme(
  theme: string | null,
  cssVars?: Record<string, string>,
): ExportTheme {
  const variant = theme && THEME_COLORS[theme] ? theme : 'light';
  const colors = { ...THEME_COLORS[variant] };

  // Override with explicit CSS variables when provided
  if (cssVars) {
    if (cssVars['--fg']) colors.fg = cssVars['--fg'];
    if (cssVars['--surface']) colors.bg = cssVars['--surface'];
    if (cssVars['--muted']) colors.muted = cssVars['--muted'];
    if (cssVars['--border']) colors.border = cssVars['--border'];
    if (cssVars['--accent']) colors.accent = cssVars['--accent'];
    if (cssVars['--code-bg']) colors.codeBg = cssVars['--code-bg'];
  }

  const bodyFont = cssVars?.['--font-body']
    ?? "'Source Serif 4', 'PingFang SC', 'Source Han Serif SC', 'Microsoft YaHei', serif";
  const codeFont = cssVars?.['--font-code']
    ?? "'SF Mono', 'Cascadia Code', ui-monospace, monospace";

  return {
    page: {
      width: '210mm',
      height: '297mm',
      marginTop: '25.4mm',
      marginRight: '25.4mm',
      marginBottom: '25.4mm',
      marginLeft: '25.4mm',
    },
    body: {
      fontFamily: bodyFont,
      fontSize: '18px',
      lineHeight: 1.7,
      maxWidth: '860px',
    },
    fonts: {
      latin: bodyFont,
      eastAsia: "'Source Han Serif SC', 'PingFang SC', 'Microsoft YaHei', serif",
      code: codeFont,
    },
    colors,
    headings: {
      1: { fontSize: '2.2em', fontWeight: 700, borderBottom: `1px solid ${colors.border}` },
      2: { fontSize: '1.7em', fontWeight: 600 },
      3: { fontSize: '1.35em', fontWeight: 600 },
      4: { fontSize: '1.15em', fontWeight: 600 },
      5: { fontSize: '1em', fontWeight: 600 },
      6: { fontSize: '0.95em', fontWeight: 600 },
    },
    codeBlock: {
      fontFamily: codeFont,
      fontSize: '13px',
      lineHeight: '1.65',
      background: colors.codeBg,
      border: `1px solid ${colors.border}`,
      borderRadius: '8px',
      padding: '16px',
    },
    inlineCode: {
      fontFamily: codeFont,
      fontSize: '0.875em',
      background: colors.codeBg,
      color: colors.accent,
      padding: '2px 4px',
      borderRadius: '3px',
    },
    blockquote: {
      borderLeft: `3px solid ${colors.accent}`,
      paddingLeft: '16px',
      marginLeft: '0',
      color: colors.muted,
      fontStyle: 'italic',
    },
    list: {
      paddingLeft: '24px',
      markerColor: colors.accent,
    },
    table: {
      borderCollapse: 'collapse',
      borderColor: colors.border,
      headerBg: colors.codeBg,
      cellPadding: '8px 12px',
    },
    image: {
      display: 'block',
      maxWidth: '100%',
      borderRadius: '6px',
      margin: '1em 0',
    },
    hr: `1px solid ${colors.border}`,
  };
}

// ── ExportTheme → CSS ─────────────────────────────────────────────────────

export interface ExportCssOptions {
  print?: boolean;
}

export function exportThemeToCss(
  theme: ExportTheme,
  options?: ExportCssOptions,
): string {
  const { colors, body, fonts, headings, codeBlock, inlineCode, blockquote, list, table, image, hr } = theme;
  const lines: string[] = [];

  // CSS variables
  lines.push(`:root {`);
  lines.push(`  color-scheme: light;`);
  lines.push(`  --font-body: ${fonts.latin};`);
  lines.push(`  --font-code: ${fonts.code};`);
  lines.push(`  --font-size: ${body.fontSize};`);
  lines.push(`  --line-height: ${body.lineHeight};`);
  lines.push(`  --color-fg: ${colors.fg};`);
  lines.push(`  --color-bg: ${colors.bg};`);
  lines.push(`  --color-muted: ${colors.muted};`);
  lines.push(`  --color-border: ${colors.border};`);
  lines.push(`  --color-accent: ${colors.accent};`);
  lines.push(`  --color-code-bg: ${colors.codeBg};`);
  lines.push(`}`);

  lines.push('');

  // Body / ProseMirror root
  lines.push(`body {`);
  lines.push(`  max-width: ${body.maxWidth};`);
  lines.push(`  margin: 0 auto;`);
  lines.push(`  padding: 40px;`);
  lines.push(`  color: ${colors.fg};`);
  lines.push(`  font: ${body.fontSize}/${body.lineHeight} ${body.fontFamily};`);
  lines.push(`  background: ${colors.bg};`);
  lines.push(`}`);

  lines.push('');

  // ProseMirror content selectors
  lines.push(`.ProseMirror {`);
  lines.push(`  font-family: var(--font-body);`);
  lines.push(`  font-size: var(--font-size);`);
  lines.push(`  line-height: var(--line-height);`);
  lines.push(`  color: var(--color-fg);`);
  lines.push(`}`);

  lines.push('');

  // Headings
  for (let level = 1; level <= 6; level++) {
    const h = headings[level];
    if (!h) continue;
    const parts: string[] = [];
    parts.push(`font-size: ${h.fontSize}`);
    parts.push(`font-weight: ${h.fontWeight}`);
    if (h.borderBottom) parts.push(`border-bottom: ${h.borderBottom}`);
    if (h.color) parts.push(`color: ${h.color}`);
    lines.push(`.ProseMirror h${level} { ${parts.join('; ')} }`);
  }
  lines.push('');

  // Paragraph
  lines.push(`.ProseMirror p { margin-bottom: 0.75em; }`);
  lines.push('');

  // Inline code
  lines.push(`.ProseMirror code {`);
  lines.push(`  font-family: ${inlineCode.fontFamily};`);
  lines.push(`  font-size: ${inlineCode.fontSize};`);
  lines.push(`  background: ${inlineCode.background};`);
  lines.push(`  color: ${inlineCode.color};`);
  lines.push(`  padding: ${inlineCode.padding};`);
  lines.push(`  border-radius: ${inlineCode.borderRadius};`);
  lines.push(`}`);
  lines.push('');

  // Code block
  lines.push(`.ProseMirror pre {`);
  lines.push(`  background: ${codeBlock.background};`);
  lines.push(`  border: ${codeBlock.border};`);
  lines.push(`  border-radius: ${codeBlock.borderRadius};`);
  lines.push(`  padding: ${codeBlock.padding};`);
  lines.push(`  margin-bottom: 1em;`);
  lines.push(`  overflow-x: auto;`);
  lines.push(`}`);
  lines.push('');
  lines.push(`.ProseMirror pre code {`);
  lines.push(`  font-family: ${codeBlock.fontFamily};`);
  lines.push(`  font-size: ${codeBlock.fontSize};`);
  lines.push(`  line-height: ${codeBlock.lineHeight};`);
  lines.push(`  background: none;`);
  lines.push(`  color: ${colors.fg};`);
  lines.push(`  padding: 0;`);
  lines.push(`  border-radius: 0;`);
  lines.push(`}`);
  lines.push('');

  // Blockquote
  lines.push(`.ProseMirror blockquote {`);
  lines.push(`  border-left: ${blockquote.borderLeft};`);
  lines.push(`  padding-left: ${blockquote.paddingLeft};`);
  lines.push(`  margin-left: ${blockquote.marginLeft};`);
  lines.push(`  margin-bottom: 1em;`);
  lines.push(`  color: ${blockquote.color};`);
  lines.push(`  font-style: ${blockquote.fontStyle};`);
  lines.push(`}`);
  lines.push('');

  // Lists
  lines.push(`.ProseMirror ul, .ProseMirror ol {`);
  lines.push(`  margin-bottom: 1em;`);
  lines.push(`  padding-left: ${list.paddingLeft};`);
  lines.push(`}`);
  lines.push('');
  lines.push(`.ProseMirror li { margin-bottom: 0.25em; }`);
  lines.push('');
  lines.push(`.ProseMirror ul li::marker { color: ${list.markerColor}; }`);
  lines.push('');

  // Table
  lines.push(`.ProseMirror table {`);
  lines.push(`  border-collapse: ${table.borderCollapse};`);
  lines.push(`  width: 100%;`);
  lines.push(`  margin-bottom: 1em;`);
  lines.push(`}`);
  lines.push('');
  lines.push(`.ProseMirror th, .ProseMirror td {`);
  lines.push(`  border: 1px solid ${table.borderColor};`);
  lines.push(`  padding: ${table.cellPadding};`);
  lines.push(`  text-align: left;`);
  lines.push(`}`);
  lines.push('');
  lines.push(`.ProseMirror th {`);
  lines.push(`  background: ${table.headerBg};`);
  lines.push(`  font-weight: 600;`);
  lines.push(`}`);
  lines.push('');

  // Images
  lines.push(`.ProseMirror img {`);
  lines.push(`  display: ${image.display};`);
  lines.push(`  max-width: ${image.maxWidth};`);
  lines.push(`  border-radius: ${image.borderRadius};`);
  lines.push(`  margin: ${image.margin};`);
  lines.push(`}`);
  lines.push('');

  // HR
  lines.push(`.ProseMirror hr {`);
  lines.push(`  border: none;`);
  lines.push(`  border-top: ${hr};`);
  lines.push(`  margin: 1.5em 0;`);
  lines.push(`}`);
  lines.push('');

  // Links
  lines.push(`.ProseMirror a { color: ${colors.accent}; text-decoration: underline; }`);
  lines.push('');

  // Media
  lines.push(`img, svg, video { max-width: 100%; height: auto; }`);
  lines.push('');

  // Print styles
  if (options?.print) {
    lines.push(`@page {`);
    lines.push(`  size: ${theme.page.width} ${theme.page.height};`);
    lines.push(`  margin: ${theme.page.marginTop} ${theme.page.marginRight} ${theme.page.marginBottom} ${theme.page.marginLeft};`);
    lines.push(`}`);
    lines.push('');
    lines.push(`@media print {`);
    lines.push(`  body { max-width: none; padding: 0; }`);
    lines.push(`  .ProseMirror { print-color-adjust: exact; -webkit-print-color-adjust: exact; }`);
    lines.push(`  .ProseMirror h1, .ProseMirror h2, .ProseMirror h3 { break-after: avoid; }`);
    lines.push(`  .ProseMirror pre, .ProseMirror table, .ProseMirror img { break-inside: avoid; }`);
    lines.push(`  .ProseMirror blockquote { break-inside: avoid; }`);
    lines.push(`}`);
  }

  return lines.join('\n');
}

// ── ExportTheme → DOCX styles ─────────────────────────────────────────────

/**
 * Convert an ExportTheme to `docx` library IStylesOptions.
 * The `docx` package is lazy-imported so this is a pure data function.
 */
export function exportThemeToDocxStyles(theme: ExportTheme): Record<string, unknown> {
  const { body, fonts, colors, headings, codeBlock, inlineCode, blockquote, table } = theme;

  // Helper: convert px to half-points (docx unit for font size)
  const pxToHalfPt = (px: string): number => {
    const num = parseFloat(px);
    // px → pt = px * 0.75, pt → half-pt = pt * 2
    return Math.round(num * 0.75 * 2);
  };

  // Helper: hex color without #
  const hex = (c: string): string => c.replace(/^#/, '');

  // Build heading styles
  const headingStyles: Record<string, unknown> = {};
  for (let level = 1; level <= 6; level++) {
    const h = headings[level];
    if (!h) continue;
    headingStyles[`heading${level}`] = {
      run: {
        font: fonts.latin,
        size: pxToHalfPt(h.fontSize),
        bold: h.fontWeight >= 600,
        color: h.color ? hex(h.color) : hex(colors.fg),
      },
      paragraph: {
        spacing: { before: 360, after: 200 },
      },
    };
  }

  return {
    default: {
      document: {
        run: {
          font: fonts.latin,
          size: pxToHalfPt(body.fontSize),
          color: hex(colors.fg),
        },
        paragraph: {
          spacing: { after: 200, line: Math.round(body.lineHeight * 240) },
        },
      },
      ...headingStyles,
    },
    paragraphStyles: [
      // Normal style for body text
      {
        id: 'Normal',
        name: 'Normal',
        run: {
          font: fonts.latin,
          size: pxToHalfPt(body.fontSize),
          color: hex(colors.fg),
        },
        paragraph: {
          spacing: { after: 200, line: Math.round(body.lineHeight * 240) },
        },
      },
      // Blockquote style
      {
        id: 'Quote',
        name: 'Quote',
        run: {
          font: fonts.latin,
          size: pxToHalfPt(body.fontSize),
          color: hex(blockquote.color || colors.muted),
          italics: blockquote.fontStyle === 'italic',
        },
        paragraph: {
          spacing: { before: 200, after: 200 },
          indent: { left: 360 }, // ~0.5 inch in twips
        },
      },
      // Code block style
      {
        id: 'CodeBlock',
        name: 'Code Block',
        run: {
          font: fonts.code,
          size: pxToHalfPt(codeBlock.fontSize),
          color: hex(colors.fg),
        },
        paragraph: {
          spacing: { before: 120, after: 120 },
          indent: { left: 216 }, // ~0.3 inch
        },
      },
    ],
    characterStyles: [
      // Inline code
      {
        id: 'InlineCode',
        name: 'Inline Code',
        run: {
          font: fonts.code,
          size: pxToHalfPt(inlineCode.fontSize),
          color: hex(inlineCode.color || colors.accent),
        },
      },
    ],
    tableStyles: [
      {
        id: 'TableGrid',
        name: 'Table Grid',
        table: {
          border: {
            style: 'single' as const,
            size: 1,
            color: hex(table.borderColor),
          },
        },
      },
    ],
  };
}

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
  // Source Han Serif SC (CJK serif, common subset)
  { family: 'Source Han Serif SC', weight: 400, style: 'normal', url: '/assets/fonts/SourceHanSerifSC-Regular-common.woff2' },
  { family: 'Source Han Serif SC', weight: 700, style: 'normal', url: '/assets/fonts/SourceHanSerifSC-Bold-common.woff2' },
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
