// ── Image Settings (new enum-based model) ───────────────────────────────

export type ImageStorageMode = 'workspace-assets' | 'doc-assets' | 'custom';

export type ImageLocalFileBehavior = 'copy' | 'reference';

export type ImageNetworkBehavior = 'keep-url' | 'download';

export type ImageReferenceStyle = 'relative' | 'absolute';

export type ImageNamingStrategy = 'timestamp' | 'sequence';

export interface ImageSettings {
  storageMode: ImageStorageMode;
  customPath: string;
  localFileBehavior: ImageLocalFileBehavior;
  networkBehavior: ImageNetworkBehavior;
  referenceStyle: ImageReferenceStyle;
  namingStrategy: ImageNamingStrategy;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  storageMode: 'workspace-assets',
  customPath: '',
  localFileBehavior: 'copy',
  networkBehavior: 'keep-url',
  referenceStyle: 'relative',
  namingStrategy: 'timestamp',
};
