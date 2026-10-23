// Barrel for the unified export theme. `types.ts`, `base.ts`, `css.ts`,
// `docx.ts` and `fonts.ts` are internal implementation files.
export type {
  ThemeColors,
  HeadingStyle,
  CodeBlockStyle,
  InlineCodeStyle,
  BlockquoteStyle,
  ListStyle,
  TableStyle,
  ImageStyle,
  PageStyle,
  BodyStyle,
  FontStack,
  ExportTheme,
} from './types';
export { buildExportTheme } from './base';
export { exportThemeToCss, type ExportCssOptions } from './css';
export { exportThemeToDocxStyles } from './docx';
export { generateInlineFontCss } from './fonts';
