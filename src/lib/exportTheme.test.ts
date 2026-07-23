import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildExportTheme,
  exportThemeToCss,
  exportThemeToDocxStyles,
  type ExportTheme,
} from './exportTheme';

describe('buildExportTheme', () => {
  it('returns light theme colors by default', () => {
    const theme = buildExportTheme(null);
    expect(theme.colors.fg).toBe('#1f2937');
    expect(theme.colors.bg).toBe('#ffffff');
  });

  it('returns dark theme colors when theme="dark"', () => {
    const theme = buildExportTheme('dark');
    expect(theme.colors.fg).toBe('#e8e8e8');
    expect(theme.colors.bg).toBe('#1f1f23');
  });

  it('returns sepia theme colors when theme="sepia"', () => {
    const theme = buildExportTheme('sepia');
    expect(theme.colors.fg).toBe('#5c4b37');
    expect(theme.colors.bg).toBe('#faf6ed');
  });

  it('falls back to light for unknown theme string', () => {
    const theme = buildExportTheme('unknown');
    expect(theme.colors.fg).toBe('#1f2937');
  });

  it('overrides colors from cssVars', () => {
    const theme = buildExportTheme('light', {
      '--fg': '#ff0000',
      '--accent': '#00ff00',
    });
    expect(theme.colors.fg).toBe('#ff0000');
    expect(theme.colors.accent).toBe('#00ff00');
  });

  it('includes all heading levels 1-6', () => {
    const theme = buildExportTheme('light');
    for (let i = 1; i <= 6; i++) {
      expect(theme.headings[i]).toBeDefined();
      expect(theme.headings[i].fontSize).toBeTruthy();
      expect(theme.headings[i].fontWeight).toBeGreaterThanOrEqual(600);
    }
  });

  it('page defaults to A4 dimensions', () => {
    const theme = buildExportTheme('light');
    expect(theme.page.width).toBe('210mm');
    expect(theme.page.height).toBe('297mm');
  });
});

describe('exportThemeToCss', () => {
  let theme: ExportTheme;

  beforeEach(() => {
    theme = buildExportTheme('light');
  });

  it('generates CSS variables declaration', () => {
    const css = exportThemeToCss(theme);
    expect(css).toContain(':root {');
    expect(css).toContain('--font-body:');
    expect(css).toContain('--color-fg:');
    expect(css).toContain('--color-bg:');
  });

  it('generates .ProseMirror content selector', () => {
    const css = exportThemeToCss(theme);
    expect(css).toContain('.ProseMirror {');
    expect(css).toContain('font-family: var(--font-body)');
  });

  it('generates heading selectors', () => {
    const css = exportThemeToCss(theme);
    expect(css).toContain('.ProseMirror h1');
    expect(css).toContain('.ProseMirror h2');
    expect(css).toContain('.ProseMirror h6');
  });

  it('includes dark theme colors when dark theme is used', () => {
    const darkTheme = buildExportTheme('dark');
    const css = exportThemeToCss(darkTheme);
    expect(css).toContain('--color-fg: #e8e8e8');
    expect(css).toContain('--color-bg: #1f1f23');
  });

  it('includes @page rules when print option is true', () => {
    const css = exportThemeToCss(theme, { print: true });
    expect(css).toContain('@page {');
    expect(css).toContain('210mm');
    expect(css).toContain('@media print {');
    expect(css).toContain('print-color-adjust: exact');
  });

  it('does not include @page rules when print option is false', () => {
    const css = exportThemeToCss(theme);
    expect(css).not.toContain('@page');
  });

  it('includes all content element selectors', () => {
    const css = exportThemeToCss(theme);
    expect(css).toContain('.ProseMirror pre {');
    expect(css).toContain('.ProseMirror pre code {');
    expect(css).toContain('.ProseMirror blockquote {');
    expect(css).toContain('.ProseMirror ul');
    expect(css).toContain('.ProseMirror table {');
    expect(css).toContain('.ProseMirror img {');
    expect(css).toContain('.ProseMirror hr {');
    expect(css).toContain('.ProseMirror a {');
  });

  it('body selector sets background color', () => {
    const css = exportThemeToCss(theme);
    expect(css).toContain('background: #ffffff');
  });
});

describe('exportThemeToDocxStyles', () => {
  let theme: ExportTheme;

  beforeEach(() => {
    theme = buildExportTheme('light');
  });

  it('returns an object with default and paragraphStyles', () => {
    const styles = exportThemeToDocxStyles(theme) as Record<string, unknown>;
    expect(styles.default).toBeDefined();
    expect(styles.paragraphStyles).toBeDefined();
    expect(Array.isArray(styles.paragraphStyles)).toBe(true);
  });

  it('includes Normal paragraph style', () => {
    const styles = exportThemeToDocxStyles(theme) as any;
    const normal = styles.paragraphStyles.find((s: any) => s.id === 'Normal');
    expect(normal).toBeDefined();
    expect(normal.run.font).toContain('Source Serif');
  });

  it('includes Quote paragraph style', () => {
    const styles = exportThemeToDocxStyles(theme) as any;
    const quote = styles.paragraphStyles.find((s: any) => s.id === 'Quote');
    expect(quote).toBeDefined();
    expect(quote.run.italics).toBe(true);
  });

  it('default document style uses theme font', () => {
    const styles = exportThemeToDocxStyles(theme) as any;
    expect(styles.default.document.run.font).toContain('Source Serif');
    expect(styles.default.document.run.color).toBe('1f2937'); // hex without #
  });

  it('converts dark theme colors correctly', () => {
    const darkTheme = buildExportTheme('dark');
    const styles = exportThemeToDocxStyles(darkTheme) as any;
    expect(styles.default.document.run.color).toBe('e8e8e8');
  });

  it('includes heading styles', () => {
    const styles = exportThemeToDocxStyles(theme) as any;
    expect(styles.default.heading1).toBeDefined();
    expect(styles.default.heading1.run.bold).toBe(true);
    expect(styles.default.heading2).toBeDefined();
  });
});
