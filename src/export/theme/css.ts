import type { ExportTheme } from './types';

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
