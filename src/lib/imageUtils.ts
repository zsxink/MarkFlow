// ── Image utilities ───────────────────────────────────────────────────

import { convertFileSrc } from '@tauri-apps/api/core';
import { DEFAULT_IMAGE_SETTINGS as IMAGE_DEFAULTS, type ImageSettings } from '../types/image';
import {
  computeRelativePath,
  getDocumentBaseName,
  getDocumentNamedImageDir,
  getFileName,
  getParentDir,
  isAbsolutePath,
  normalizeImageStoragePath,
  normalizePathSegments,
  resolveImagePath,
} from './pathUtils';
import {
  cleanupPendingImages,
  copyImageToPending,
  copyImageToStorageFile,
  downloadImageToStorage,
  downloadImageToPending,
  loadSettings,
  migratePendingImages,
  readSingleDir,
  writeImageToStorage,
  writePendingImage,
} from './storage';

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = IMAGE_DEFAULTS;

const SUPPORTED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);
const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
};

interface ActiveImageDraft {
  draftId: string | null;
  pendingReferences: Set<string>;
  immediateAbsoluteReferences: Set<string>;
}

let activeImageDraft: ActiveImageDraft = createEmptyDraft();
let pendingWriteQueue: Promise<void> = Promise.resolve();
let pendingSaveBarrier: Promise<void> | null = null;
let releasePendingSaveBarrier: (() => void) | null = null;

function createEmptyDraft(): ActiveImageDraft {
  return {
    draftId: null,
    pendingReferences: new Set(),
    immediateAbsoluteReferences: new Set(),
  };
}

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

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

export function isImageUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://');
}

export function imagePathToSrc(imagePath: string, docPath: string | null): string {
  if (isImageUrl(imagePath)) return imagePath;
  const absolutePath = docPath ? resolveImagePath(imagePath, docPath) : imagePath;
  return convertFileSrc(absolutePath);
}

export async function getStoragePath(settings: ImageSettings, docPath: string | null): Promise<string> {
  switch (settings.storageMode) {
    case 'document-dir':
      if (!docPath) throw new Error('文档首次保存前，图片将暂存到 MarkFlow 用户数据目录');
      return normalizePathSegments(getParentDir(docPath));
    case 'document-named-dir':
      if (!docPath) throw new Error('文档首次保存前，图片将暂存到 MarkFlow 用户数据目录');
      return getDocumentNamedImageDir(docPath);
    case 'custom': {
      const customPath = settings.customPath.trim() || DEFAULT_IMAGE_SETTINGS.customPath;
      if (isAbsolutePath(customPath)) return normalizeImageStoragePath(customPath, docPath ?? '.');
      if (!docPath) throw new Error('文档首次保存前，相对路径图片将暂存到 MarkFlow 用户数据目录');
      return normalizeImageStoragePath(customPath, docPath);
    }
  }
}

export function renderClipboardNameTemplate(
  template: string,
  docPath: string | null,
  now: Date = new Date(),
): string {
  const documentName = docPath ? getDocumentBaseName(docPath) || 'untitled' : 'untitled';
  const rendered = (template.trim() || DEFAULT_IMAGE_SETTINGS.clipboardNameTemplate)
    .replace(/\$\{filename\}/g, documentName)
    .replace(/\$\{date:([^{}]+)\}/g, (_match, format: string) => formatDateTime(now, format))
    .replace(/\$\{time:([^{}]+)\}/g, (_match, format: string) => formatDateTime(now, format))
    .replace(/\$\{[^{}]*\}/g, '');
  return sanitizeBaseName(removeImageExtension(rendered), 'img');
}

export function getImageExtension(mimeType: string, fallbackName = ''): string {
  const normalizedMime = mimeType.split(';', 1)[0].trim().toLowerCase();
  const fromMime = MIME_EXTENSIONS[normalizedMime];
  if (fromMime) return fromMime;
  const fromName = getExtension(fallbackName);
  return SUPPORTED_EXTENSIONS.has(fromName) ? fromName : 'png';
}

export function generateClipboardImageName(
  template: string,
  mimeType: string,
  docPath: string | null,
  existingNames: readonly string[] = [],
  now: Date = new Date(),
  fallbackName = '',
): string {
  const base = renderClipboardNameTemplate(template, docPath, now);
  return pickAvailableName(`${base}.${getImageExtension(mimeType, fallbackName)}`, existingNames);
}

/** Preserve a local/network source name and add an index only on collision. */
export function generateSourceImageName(
  sourceName: string,
  existingNames: readonly string[] = [],
  mimeType = '',
): string {
  const fileName = decodeFileName(getFileName(sourceName)) || 'image';
  const rawExtension = getRawExtension(fileName);
  const extension = mimeType
    ? getImageExtension(mimeType, fileName)
    : (SUPPORTED_EXTENSIONS.has(rawExtension.toLowerCase()) ? rawExtension : 'png');
  const base = sanitizeBaseName(stripExtension(fileName), 'image');
  return pickAvailableName(`${base}.${extension}`, existingNames);
}

/** @deprecated Compatibility alias for callers using the former strategy API. */
export async function generateImageName(
  originalName: string,
  _strategy: string,
  existingNames: string[] = [],
): Promise<string> {
  return generateSourceImageName(originalName, existingNames);
}

export async function copyImageToStorage(
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
      [...activeImageDraft.pendingReferences].map(getFileName),
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

export async function copyLocalFileToStorage(
  filePath: string,
  docPath: string | null,
  settings: ImageSettings,
): Promise<string> {
  if (!settings.applyToLocal) return getReferencePath(filePath, docPath, settings.referenceStyle);

  const storageDir = getImmediatelyAvailableStorageDir(settings, docPath);
  if (!storageDir) {
    const name = generateSourceImageName(filePath, [...activeImageDraft.pendingReferences].map(getFileName));
    return stagePendingOperation(draftId => copyImageToPending(name, filePath, draftId));
  }

  const name = generateSourceImageName(filePath, await listFileNames(storageDir));
  const destPath = `${storageDir}/${name}`;
  await copyImageToStorageFile(filePath, destPath, storageDir, docPath);
  return referenceStoredImage(destPath, docPath, settings.referenceStyle);
}

export async function pasteImageFile(
  file: File,
  docPath: string | null,
  settings: ImageSettings,
): Promise<string> {
  const base64 = await readFileAsDataUrl(file);
  const raw = base64.substring(base64.indexOf(',') + 1);
  return copyImageToStorage(raw, file.name || '', docPath, settings, file.type);
}

export async function handleNetworkImage(
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
      [...activeImageDraft.pendingReferences].map(getFileName),
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
  const writesBeforeSave = pendingWriteQueue;
  // Capture the draft reference before the yield point. discardActiveImageDraft
  // may replace activeImageDraft during the await; using the captured reference
  // prevents silent data loss (the save would otherwise see an empty draft and
  // skip migration while discard cleans up the images).
  const capturedDraft = activeImageDraft;
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
      const finalReference = getReferencePath(mapping.to, documentPath, resolvedSettings.referenceStyle);
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
    if (!draftId || activeImageDraft.draftId === draftId) activeImageDraft = createEmptyDraft();
  } finally {
    releasePendingImagesSave();
  }
}

/** Release a prepared save after the Markdown write failed; keep its draft. */
export function abortPendingImagesSave(): void {
  releasePendingImagesSave();
}

/** Best-effort cleanup used when the active unsaved document is discarded.
 *  Skips cleanup if a save is in progress — the save will handle it, or the
 *  7-day expiry on startup will collect any leftovers. */
export async function discardActiveImageDraft(): Promise<void> {
  if (pendingSaveBarrier) return;
  const discardedDraft = activeImageDraft;
  const pendingWrites = pendingWriteQueue;
  activeImageDraft = createEmptyDraft();
  await pendingWrites;
  const draftId = discardedDraft.draftId;
  if (draftId) await cleanupPendingImages(draftId);
}

export function getActiveImageDraftId(): string | null {
  return activeImageDraft.draftId;
}

/** Test/lifecycle helper; callers should normally use discardActiveImageDraft. */
export function resetActiveImageDraftState(): void {
  activeImageDraft = createEmptyDraft();
  pendingWriteQueue = Promise.resolve();
  releasePendingImagesSave();
}

function getImmediatelyAvailableStorageDir(settings: ImageSettings, docPath: string | null): string | null {
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

function referenceStoredImage(destPath: string, docPath: string | null, style: string): string {
  const reference = getReferencePath(destPath, docPath, style);
  if (!docPath) activeImageDraft.immediateAbsoluteReferences.add(reference);
  return reference;
}

function stagePendingImage(fileName: string, data: string): Promise<string> {
  return stagePendingOperation(draftId => writePendingImage(fileName, data, draftId));
}

function stagePendingOperation(
  write: (draftId: string | null) => Promise<{ draftId: string; path: string }>,
): Promise<string> {
  const saveBarrier = pendingSaveBarrier;
  const queued = pendingWriteQueue.then(async () => {
    if (saveBarrier) await saveBarrier;
    const draft = activeImageDraft;
    const pending = await write(draft.draftId);
    if (draft.draftId && draft.draftId !== pending.draftId) {
      throw new Error('图片暂存草稿标识不一致');
    }
    draft.draftId = pending.draftId;
    draft.pendingReferences.add(pending.path);
    return pending.path;
  });
  pendingWriteQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

function beginPendingImagesSave(): void {
  if (pendingSaveBarrier) throw new Error('图片保存操作正在进行中');
  pendingSaveBarrier = new Promise<void>(resolve => {
    releasePendingSaveBarrier = resolve;
  });
}

function releasePendingImagesSave(): void {
  const release = releasePendingSaveBarrier;
  releasePendingSaveBarrier = null;
  pendingSaveBarrier = null;
  release?.();
}

function rewriteImmediateAbsoluteReferences(
  markdown: string,
  documentPath: string,
  settings: ImageSettings,
): string {
  let updated = markdown;
  for (const absolutePath of activeImageDraft.immediateAbsoluteReferences) {
    const reference = getReferencePath(absolutePath, documentPath, settings.referenceStyle);
    updated = replaceLiteral(updated, absolutePath, reference);
  }
  return updated;
}

function getReferencePath(destPath: string, docPath: string | null, style: string): string {
  const normalized = destPath.replace(/\\/g, '/');
  if (style === 'absolute' || !docPath) return normalized;
  return computeRelativePath(docPath, normalized);
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

function formatDateTime(date: Date, format: string): string {
  const tokens: Record<string, string> = {
    yyyy: String(date.getFullYear()).padStart(4, '0'),
    yy: String(date.getFullYear()).slice(-2),
    MM: String(date.getMonth() + 1).padStart(2, '0'),
    M: String(date.getMonth() + 1),
    dd: String(date.getDate()).padStart(2, '0'),
    d: String(date.getDate()),
    HH: String(date.getHours()).padStart(2, '0'),
    H: String(date.getHours()),
    mm: String(date.getMinutes()).padStart(2, '0'),
    m: String(date.getMinutes()),
    ss: String(date.getSeconds()).padStart(2, '0'),
    s: String(date.getSeconds()),
  };
  return format.replace(/yyyy|yy|MM|M|dd|d|HH|H|mm|m|ss|s/g, token => tokens[token]);
}

function sanitizeBaseName(name: string, fallback: string): string {
  let sanitized = name
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
    .replace(/[. ]+$/g, '')
    .replace(/^[. -]+/g, '')
    .trim();
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sanitized)) sanitized = `img-${sanitized}`;
  return sanitized || fallback;
}

function removeImageExtension(name: string): string {
  const extension = getExtension(name);
  return SUPPORTED_EXTENSIONS.has(extension) ? stripExtension(name) : name;
}

function getExtension(name: string): string {
  return getRawExtension(name).toLowerCase();
}

function getRawExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : '';
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function pickAvailableName(candidate: string, existingNames: readonly string[]): string {
  const occupied = new Set(existingNames.map(name => name.toLocaleLowerCase()));
  if (!occupied.has(candidate.toLocaleLowerCase())) return candidate;
  const dot = candidate.lastIndexOf('.');
  const base = dot >= 0 ? candidate.slice(0, dot) : candidate;
  const extension = dot >= 0 ? candidate.slice(dot) : '';
  let index = 1;
  while (occupied.has(`${base}-${index}${extension}`.toLocaleLowerCase())) index++;
  return `${base}-${index}${extension}`;
}

async function listFileNames(storageDir: string): Promise<string[]> {
  try {
    return (await readSingleDir(storageDir)).filter(entry => !entry.isDir).map(entry => entry.name);
  } catch {
    return [];
  }
}

function decodeFileName(name: string): string {
  try { return decodeURIComponent(name); } catch { return name; }
}

function getUrlFileName(url: string): string {
  const fileName = new URL(url).pathname.split('/').pop() || 'image';
  return decodeFileName(fileName);
}

function getUrlExtension(url: string): string | null {
  const extension = getExtension(getUrlFileName(url));
  return SUPPORTED_EXTENSIONS.has(extension) ? extension : null;
}

function replaceLiteral(value: string, search: string, replacement: string): string {
  return search ? value.split(search).join(replacement) : value;
}
