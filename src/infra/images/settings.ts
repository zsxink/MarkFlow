// ── Image settings resolution ─────────────────────────────────────────
// Reads the persisted image settings and resolves the storage directory that a
// document's images belong to. No draft state, no writes.

import { DEFAULT_IMAGE_SETTINGS as IMAGE_DEFAULTS, type ImageSettings } from '../../types/image';
import {
  getDocumentNamedImageDir,
  getParentDir,
  isAbsolutePath,
  normalizeImageStoragePath,
  normalizePathSegments,
} from '../../utils/paths';
import { loadSettings } from '../storage';

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = IMAGE_DEFAULTS;

export async function getImageSettings(): Promise<ImageSettings> {
  try {
    const s = await loadSettings();
    return {
      storageMode: isOneOf(s.imageStorageMode, ['custom', 'document-dir', 'document-named-dir'])
        ? s.imageStorageMode
        : DEFAULT_IMAGE_SETTINGS.storageMode,
      customPath: typeof s.imageCustomPath === 'string' && s.imageCustomPath.trim()
        ? s.imageCustomPath
        : DEFAULT_IMAGE_SETTINGS.customPath,
      applyToLocal: typeof s.imageApplyToLocal === 'boolean'
        ? s.imageApplyToLocal
        : DEFAULT_IMAGE_SETTINGS.applyToLocal,
      applyToNetwork: typeof s.imageApplyToNetwork === 'boolean'
        ? s.imageApplyToNetwork
        : DEFAULT_IMAGE_SETTINGS.applyToNetwork,
      referenceStyle: isOneOf(s.imageReferenceStyle, ['relative', 'absolute'])
        ? s.imageReferenceStyle
        : DEFAULT_IMAGE_SETTINGS.referenceStyle,
      clipboardNameTemplate: typeof s.imageClipboardNameTemplate === 'string'
        && s.imageClipboardNameTemplate.trim()
        ? s.imageClipboardNameTemplate
        : DEFAULT_IMAGE_SETTINGS.clipboardNameTemplate,
    };
  } catch {
    return DEFAULT_IMAGE_SETTINGS;
  }
}

/**
 * The storage directory usable before a document has a path. Returns null when
 * the configured mode requires a saved document, so callers stage the image in
 * the pending area instead.
 */
export function getImmediatelyAvailableStorageDir(
  settings: ImageSettings,
  docPath: string | null,
): string | null {
  if (docPath) {
    switch (settings.storageMode) {
      case 'document-dir': return normalizePathSegments(getParentDir(docPath));
      case 'document-named-dir': return getDocumentNamedImageDir(docPath);
      case 'custom': return normalizeImageStoragePath(
        settings.customPath.trim() || DEFAULT_IMAGE_SETTINGS.customPath,
        docPath,
      );
    }
  }
  if (settings.storageMode !== 'custom') return null;
  const customPath = settings.customPath.trim() || DEFAULT_IMAGE_SETTINGS.customPath;
  return isAbsolutePath(customPath) ? normalizeImageStoragePath(customPath, '.') : null;
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}
