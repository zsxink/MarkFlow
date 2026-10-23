/**
 * Unified export theme — type definitions shared by the token builder, the CSS
 * generator and the DOCX style generator. See `theme/index.ts` for the barrel.
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
