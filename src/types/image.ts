// ── Image Settings (new enum-based model) ───────────────────────────────

export type ImageStorageMode = 'custom' | 'document-dir' | 'document-named-dir';

export type ImageReferenceStyle = 'relative' | 'absolute';

export interface ImageSettings {
  storageMode: ImageStorageMode;
  customPath: string;
  applyToLocal: boolean;
  applyToNetwork: boolean;
  referenceStyle: ImageReferenceStyle;
  clipboardNameTemplate: string;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  storageMode: 'custom',
  customPath: './images',
  applyToLocal: true,
  applyToNetwork: true,
  referenceStyle: 'relative',
  clipboardNameTemplate: 'img-${date:yyyyMMdd}${time:HHmmss}',
};
