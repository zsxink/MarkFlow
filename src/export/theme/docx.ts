import type { ExportTheme } from './types';

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
