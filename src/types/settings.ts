import type { ImageReferenceStyle, ImageStorageMode } from './image';

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
  lastSidebarTab?: string;
  largeFileThreshold?: number;
  hugeFileThreshold?: number;
  largeFileLineThreshold?: number;
  hugeFileLineThreshold?: number;
  fileTreeIgnorePatterns?: string[];
  fileTreePageSize?: number;
  fileTreeAutoLoadDepth?: number;
  recentFiles: string[];
  recentFolders: string[];
  lastWindowWidth: number;
  lastWindowHeight: number;
  lastWindowX: number;
  lastWindowY: number;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 3,
  theme: 'light',
  fontSize: 18,
  lineHeight: 1.7,
  autosave: true,
  autosaveInterval: 10000,
  spellcheck: true,
  softWrap: true,
  codeHighlight: true,
  plantumlServerUrl: '',
  showSidebar: true,
  showTooltips: true,
  followSystemTheme: false,
  lastWorkspace: null,
  imageStorageMode: 'custom',
  imageCustomPath: './images',
  imageApplyToLocal: true,
  imageApplyToNetwork: true,
  imageClipboardNameTemplate: 'img-${date:yyyyMMdd}${time:HHmmss}',
  imageReferenceStyle: 'relative',
  codeLineNumbers: false,
  codeWordWrap: true,
  largeFileThreshold: 1048576,    // 1MB
  hugeFileThreshold: 10485760,    // 10MB
  largeFileLineThreshold: 5000,
  hugeFileLineThreshold: 50000,
  fileTreeIgnorePatterns: ['.git', 'node_modules', 'target', 'dist'],
  fileTreePageSize: 500,
  fileTreeAutoLoadDepth: 8,
  recentFiles: [],
  recentFolders: [],
  lastWindowWidth: 1200,
  lastWindowHeight: 800,
  lastWindowX: 0,
  lastWindowY: 0,
};
