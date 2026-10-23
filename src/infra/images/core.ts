// ── Image pipeline orchestration ──────────────────────────────────────
// Owns the "where does this image go" decision (storage dir vs pending draft),
// the save/migration barrier, and the display helpers. Pure naming lives in
// `naming.ts`, settings resolution in `settings.ts`, draft state in `draft.ts`.

import { convertFileSrc } from '@tauri-apps/api/core';
import type { ImageSettings } from '../../types/image';
import { getFileName, resolveImagePath } from '../../utils/paths';
import {
  cleanupPendingImages,
  copyImageToPending,
  copyImageToStorageFile,
  downloadImageToStorage,
  downloadImageToPending,
  migratePendingImages,
  readSingleDir,
  writeImageToStorage,
  writePendingImage,
} from '../storage';
import {
  beginPendingImagesSave,
  createEmptyDraft,
  getActiveImageDraft,
  getPendingWriteQueue,
  releasePendingImagesSave,
  replaceActiveImageDraft,
  stagePendingOperation,
  trackImageOperation,
} from './draft';
import {
  generateClipboardImageName,
  generateSourceImageName,
  getUrlExtension,
  getUrlFileName,
  toImageReference,
} from './naming';
import {
  DEFAULT_IMAGE_SETTINGS,
  getImageSettings,
  getImmediatelyAvailableStorageDir,
} from './settings';

export { DEFAULT_IMAGE_SETTINGS, getImageSettings };
// Draft lifecycle is re-exported so callers keep one import surface for the
// whole pipeline; the state itself lives in `draft.ts`.
export {
  attachImageDraft,
  detachImageDraft,
  discardActiveImageDraft,
  getActiveImageDraftId,
  releaseImageDraft,
  resetActiveImageDraftState,
  settleImageOperations,
  type ImageDraftContext,
} from './draft';

export function isImageUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://');
}

export function imagePathToSrc(imagePath: string, docPath: string | null): string {
  if (isImageUrl(imagePath)) return imagePath;
  const absolutePath = docPath ? resolveImagePath(imagePath, docPath) : imagePath;
  return convertFileSrc(absolutePath);
}

export async function getStoragePath(
  settings: ImageSettings,
  docPath: string | null,
): Promise<string> {
  const dir = getImmediatelyAvailableStorageDir(settings, docPath);
  if (!dir) throw new Error('文档首次保存前，图片将暂存到 MarkFlow 用户数据目录');
  return dir;
}

async function copyImageToStorageInternal(
  base64Data: string,
  originalName: string,
  docPath: string | null,
  settings: ImageSettings,
  mimeType = '',
): Promise<string> {
  const storageDir = getImmediatelyAvailableStorageDir(settings, docPath);
  if (!storageDir) {
    const name = generateClipboardImageName(
      settings.clipboardNameTemplate,
      mimeType,
      docPath,
      [...getActiveImageDraft().pendingReferences].map(getFileName),
      new Date(),
      originalName,
    );
    return stagePendingImage(name, base64Data);
  }

  const name = generateClipboardImageName(
    settings.clipboardNameTemplate,
    mimeType,
    docPath,
    await listFileNames(storageDir),
    new Date(),
    originalName,
  );
  const destPath = `${storageDir}/${name}`;
  await writeImageToStorage(destPath, storageDir, base64Data, docPath);
  return referenceStoredImage(destPath, docPath, settings.referenceStyle);
}

async function copyLocalFileToStorageInternal(
  filePath: string,
  docPath: string | null,
  settings: ImageSettings,
): Promise<string> {
  if (!settings.applyToLocal) {
    return toImageReference(filePath, docPath, settings.referenceStyle);
  }

  const storageDir = getImmediatelyAvailableStorageDir(settings, docPath);
  if (!storageDir) {
    const name = generateSourceImageName(
      filePath,
      [...getActiveImageDraft().pendingReferences].map(getFileName),
    );
    return stagePendingOperation(draftId => copyImageToPending(name, filePath, draftId));
  }

  const name = generateSourceImageName(filePath, await listFileNames(storageDir));
  const destPath = `${storageDir}/${name}`;
  await copyImageToStorageFile(filePath, destPath, storageDir, docPath);
  return referenceStoredImage(destPath, docPath, settings.referenceStyle);
}

async function pasteImageFileInternal(
  file: File,
  docPath: string | null,
  settings: ImageSettings,
): Promise<string> {
  const base64 = await readFileAsDataUrl(file);
  const raw = base64.substring(base64.indexOf(',') + 1);
  return copyImageToStorage(raw, file.name || '', docPath, settings, file.type);
}

async function handleNetworkImageInternal(
  url: string,
  docPath: string | null,
  settings: ImageSettings,
): Promise<string> {
  const normalizedUrl = validateRemoteImageUrl(url);
  if (!settings.applyToNetwork) return normalizedUrl;

  const storageDir = getImmediatelyAvailableStorageDir(settings, docPath);
  const sourceName = getUrlFileName(normalizedUrl);
  if (!storageDir) {
    const name = generateSourceImageName(
      sourceName,
      [...getActiveImageDraft().pendingReferences].map(getFileName),
    );
    return stagePendingOperation(draftId => downloadImageToPending(name, normalizedUrl, draftId));
  }

  const parsedUrl = new URL(normalizedUrl);
  const urlExtension = getUrlExtension(normalizedUrl);
  const useMimeExtension = urlExtension === null || Boolean(parsedUrl.search || parsedUrl.hash);
  const name = generateSourceImageName(sourceName, await listFileNames(storageDir));
  const destPath = `${storageDir}/${name}`;
  const downloaded = await downloadImageToStorage(
    normalizedUrl,
    destPath,
    storageDir,
    useMimeExtension,
    docPath,
  );
  return referenceStoredImage(downloaded.path, docPath, settings.referenceStyle);
}

export interface PreparedImageMigration {
  markdown: string;
  draftId: string | null;
}

/**
 * Copy staged images and return Markdown with final references. This does not
 * clean the draft; the caller must do that only after the Markdown write wins.
 */
export async function preparePendingImagesForSave(
  markdown: string,
  documentPath: string,
  settings?: ImageSettings,
): Promise<PreparedImageMigration> {
  beginPendingImagesSave();
  // Capture the queue after locking. Writes scheduled before this save finish
  // normally; later writes capture the barrier and cannot reuse a draft that
  // is about to be migrated and cleaned.
  const writesBeforeSave = getPendingWriteQueue();
  // Capture the draft reference before the yield point. discardActiveImageDraft
  // may replace the active draft during the await; using the captured reference
  // prevents silent data loss (the save would otherwise see an empty draft and
  // skip migration while discard cleans up the images).
  const capturedDraft = getActiveImageDraft();
  try {
    await writesBeforeSave;
    if (!capturedDraft.draftId && capturedDraft.immediateAbsoluteReferences.size === 0) {
      releasePendingImagesSave();
      return { markdown, draftId: null };
    }
    const resolvedSettings = settings ?? await getImageSettings();
    let updated = rewriteImmediateAbsoluteReferences(markdown, documentPath, resolvedSettings);
    const draftId = capturedDraft.draftId;
    if (!draftId) return { markdown: updated, draftId: null };

    const migration = await migratePendingImages(draftId, documentPath);
    for (const mapping of migration.mappings) {
      const finalReference = toImageReference(
        mapping.to,
        documentPath,
        resolvedSettings.referenceStyle,
      );
      updated = replaceLiteral(updated, mapping.from, finalReference);
      updated = replaceLiteral(updated, mapping.from.replace(/\\/g, '/'), finalReference);
    }
    return { markdown: updated, draftId };
  } catch (error) {
    releasePendingImagesSave();
    throw error;
  }
}

/** Clean a migrated draft only after its Markdown file was written successfully. */
export async function completePendingImagesSave(draftId: string | null): Promise<void> {
  try {
    if (draftId) await cleanupPendingImages(draftId);
    if (!draftId || getActiveImageDraft().draftId === draftId) {
      replaceActiveImageDraft(createEmptyDraft());
    }
  } finally {
    releasePendingImagesSave();
  }
}

/** Release a prepared save after the Markdown write failed; keep its draft. */
export function abortPendingImagesSave(): void {
  releasePendingImagesSave();
}

function referenceStoredImage(destPath: string, docPath: string | null, style: string): string {
  const reference = toImageReference(destPath, docPath, style);
  if (!docPath) getActiveImageDraft().immediateAbsoluteReferences.add(reference);
  return reference;
}

function stagePendingImage(fileName: string, data: string): Promise<string> {
  return stagePendingOperation(draftId => writePendingImage(fileName, data, draftId));
}

function rewriteImmediateAbsoluteReferences(
  markdown: string,
  documentPath: string,
  settings: ImageSettings,
): string {
  let updated = markdown;
  for (const absolutePath of getActiveImageDraft().immediateAbsoluteReferences) {
    const reference = toImageReference(absolutePath, documentPath, settings.referenceStyle);
    updated = replaceLiteral(updated, absolutePath, reference);
  }
  return updated;
}

function validateRemoteImageUrl(url: string): string {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported image URL protocol');
  return parsed.toString();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function listFileNames(storageDir: string): Promise<string[]> {
  try {
    return (await readSingleDir(storageDir)).filter(entry => !entry.isDir).map(entry => entry.name);
  } catch {
    return [];
  }
}

function replaceLiteral(value: string, search: string, replacement: string): string {
  return search ? value.split(search).join(replacement) : value;
}

export function copyImageToStorage(
  ...args: Parameters<typeof copyImageToStorageInternal>
): Promise<string> {
  return trackImageOperation(() => copyImageToStorageInternal(...args));
}

export function copyLocalFileToStorage(
  ...args: Parameters<typeof copyLocalFileToStorageInternal>
): Promise<string> {
  return trackImageOperation(() => copyLocalFileToStorageInternal(...args));
}

export function pasteImageFile(...args: Parameters<typeof pasteImageFileInternal>): Promise<string> {
  return trackImageOperation(() => pasteImageFileInternal(...args));
}

export function handleNetworkImage(
  ...args: Parameters<typeof handleNetworkImageInternal>
): Promise<string> {
  return trackImageOperation(() => handleNetworkImageInternal(...args));
}
