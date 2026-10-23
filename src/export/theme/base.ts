import type { ExportTheme, ThemeColors } from './types';

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
    ?? "'Source Serif 4', 'PingFang SC', 'MarkFlow Serif SC', 'Microsoft YaHei', serif";
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
      eastAsia: "'MarkFlow Serif SC', 'Source Han Serif SC', 'PingFang SC', 'Microsoft YaHei', serif",
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
