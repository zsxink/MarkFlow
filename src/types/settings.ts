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
  /** "workspace-assets" (default) | "doc-assets" | "custom" */
  imageStorageMode: string;
  imageCustomPath?: string;
  /** @deprecated Use imageLocalFileBehavior instead */
  imageAutoCopyLocal?: boolean;
  /** @deprecated Use imageNetworkBehavior instead */
  imageDownloadNetwork?: boolean;
  /** @deprecated Use imageReferenceStyle instead */
  imagePreferRelative?: boolean;
  imageNamingStrategy?: string;
  /** "copy" (default) | "reference" */
  imageLocalFileBehavior: string;
  /** "keep-url" (default) | "download" */
  imageNetworkBehavior: string;
  /** "relative" (default) | "absolute" */
  imageReferenceStyle: string;
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
  version: 2,
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
  imageStorageMode: 'workspace-assets',
  imageCustomPath: '',
  imageNamingStrategy: 'timestamp',
  imageLocalFileBehavior: 'copy',
  imageNetworkBehavior: 'keep-url',
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
