import type { ImageReferenceStyle, ImageStorageMode } from './image';

/** Largest safe setInterval delay while autosave settings are stored in ms. */
export const MAX_AUTOSAVE_INTERVAL_MS = 2_147_483_000;
export const MAX_AUTOSAVE_INTERVAL_SECONDS = Math.floor(MAX_AUTOSAVE_INTERVAL_MS / 1000);

export interface Settings {
  version: number;
  theme: string;
  fontSize: number;
  lineHeight: number;
  autosave: boolean;
  autosaveInterval: number;
  spellcheck: boolean;
  softWrap: boolean;
  /** @deprecated No longer controls any behavior */
  livePreview?: boolean;
  codeHighlight: boolean;
  plantumlServerUrl: string;
  lineNumbers?: boolean;
  showSidebar: boolean;
  showTooltips: boolean;
  followSystemTheme: boolean;
  restoreWorkspace?: boolean;
  lastWorkspace?: string | null;
  imageStorageMode: ImageStorageMode;
  imageCustomPath: string;
  imageApplyToLocal: boolean;
  imageApplyToNetwork: boolean;
  imageClipboardNameTemplate: string;
  imageReferenceStyle: ImageReferenceStyle;
  /** @deprecated Migrated to imageApplyToLocal in settings version 3 */
  imageLocalFileBehavior?: string;
  /** @deprecated Migrated to imageApplyToNetwork in settings version 3 */
  imageNetworkBehavior?: string;
  /** @deprecated Replaced by imageClipboardNameTemplate in settings version 3 */
  imageNamingStrategy?: string;
  /** @deprecated Legacy version 1 setting */
  imageAutoCopyLocal?: boolean;
  /** @deprecated Legacy version 1 setting */
  imageDownloadNetwork?: boolean;
  /** @deprecated Legacy version 1 setting */
  imagePreferRelative?: boolean;
  codeLineNumbers?: boolean;
  codeWordWrap?: boolean;
  lastSidebarTab?: string | null;
  /** Documents larger than this (bytes) stay in Source / tier as Large. */
  wysiwygMaxBytes?: number;
  /** Documents larger than this (bytes) are tiered Huge (confirm dialog). */
  sourceMaxBytes?: number;
  /** Documents with more lines than this default to Source. */
  maxLines?: number;
  fileTreeIgnorePatterns?: string[];
  fileTreePageSize?: number;
  fileTreeAutoLoadDepth?: number;
  /** 文件浏览器是否列出不支持格式的文件（默认 false，仅 .md 与图片）。 */
  fileBrowserShowUnsupportedFiles?: boolean;
  recentFiles: string[];
  recentFolders: string[];
  lastWindowWidth: number;
  lastWindowHeight: number;
  lastWindowX: number;
  lastWindowY: number;
}

// `satisfies` (instead of `: Settings`) keeps present-optional fields readable
// as plain `number`, so downstream limit constants can derive from this single
// source of truth without null-handling or duplicated literals.
export const DEFAULT_SETTINGS = {
  version: 3,
  theme: 'light',
  fontSize: 18,
  lineHeight: 1.6,
  autosave: true,
  autosaveInterval: 30000,
  spellcheck: true,
  softWrap: true,
  codeHighlight: true,
  plantumlServerUrl: '',
  showSidebar: true,
  showTooltips: true,
  followSystemTheme: false,
  restoreWorkspace: true,
  lastWorkspace: null,
  lastSidebarTab: null,
  imageStorageMode: 'custom',
  imageCustomPath: './images',
  imageApplyToLocal: true,
  imageApplyToNetwork: true,
  imageClipboardNameTemplate: 'img-${date:yyyyMMdd}${time:HHmmss}',
  imageReferenceStyle: 'relative',
  codeLineNumbers: false,
  codeWordWrap: true,
  wysiwygMaxBytes: 1048576,          // 1MB
  sourceMaxBytes: 10485760,          // 10MB
  maxLines: 1000000,
  fileTreeIgnorePatterns: ['.git', 'node_modules', 'target', 'dist'],
  fileTreePageSize: 500,
  fileTreeAutoLoadDepth: 8,
  fileBrowserShowUnsupportedFiles: false,
  recentFiles: [],
  recentFolders: [],
  lastWindowWidth: 1200,
  lastWindowHeight: 800,
  lastWindowX: 0,
  lastWindowY: 0,
} satisfies Settings;
