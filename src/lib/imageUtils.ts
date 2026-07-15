import type { ImageSettings } from '../types/editor';
import { resolveImagePath, computeRelativePath, getParentDir, getImageMimeType } from './pathUtils';
import { writeFileFromBase64, downloadImage, getWorkspace, readFileAsBase64, loadSettings, readSingleDir, copyFile } from './storage';
import { convertFileSrc } from '@tauri-apps/api/core';

// ── Image settings helpers ─────────────────────────────────────────────

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  storageMode: 'workspace-assets',
  customPath: '',
  preferRelative: true,
  autoCopyLocal: true,
  downloadNetwork: false,
  namingStrategy: 'timestamp',
};

export async function getImageSettings(): Promise<ImageSettings> {
  try {
    const s = await loadSettings();
    return {
      storageMode: s.imageStorageMode || DEFAULT_IMAGE_SETTINGS.storageMode,
      customPath: s.imageCustomPath || DEFAULT_IMAGE_SETTINGS.customPath,
      preferRelative: s.imagePreferRelative !== false,
      autoCopyLocal: s.imageAutoCopyLocal !== false,
      downloadNetwork: s.imageDownloadNetwork === true,
      namingStrategy: s.imageNamingStrategy || DEFAULT_IMAGE_SETTINGS.namingStrategy,
    };
  } catch {
    return DEFAULT_IMAGE_SETTINGS;
  }
}

export function isImageUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://');
}

function filePathToSrc(filePath: string): string {
  return convertFileSrc(filePath);
}

export function imagePathToSrc(imagePath: string, docPath: string | null): string {
  if (isImageUrl(imagePath)) return imagePath;
  const absolutePath = docPath ? resolveImagePath(imagePath, docPath) : imagePath;
  return convertFileSrc(absolutePath);
}

export async function generateImageName(
  originalName: string,
  strategy: string,
  existingNames?: string[]
): Promise<string> {
  if (strategy === 'original' && originalName) {
    return originalName;
  }
  const now = new Date();
  const ts = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const ext = originalName ? getExtension(originalName) : 'png';

  if (strategy === 'timestamp') {
    const baseName = originalName ? stripExtension(originalName) : 'image';
    const base = `${baseName}-${ts}`;
    if (!existingNames) return `${base}.${ext}`;
    let n = 1;
    while (existingNames.includes(`${base}-${n}.${ext}`)) n++;
    return `${base}-${n}.${ext}`;
  }

  if (strategy === 'sequence' || !originalName) {
    const base = `image-${ts}`;
    if (!existingNames) return `${base}.${ext}`;
    let n = 1;
    while (existingNames.includes(`${base}-${n}.${ext}`)) n++;
    return `${base}-${n}.${ext}`;
  }
  return originalName || `image-${ts}.png`;
}

export async function getStoragePath(settings: ImageSettings, docPath: string | null): Promise<string> {
  const workspace = await getWorkspace();
  if (!workspace) throw new Error('No workspace set');
  switch (settings.storageMode) {
    case 'doc-assets': {
      if (!docPath) return `${workspace}/assets`;
      return `${getParentDir(docPath)}/assets`;
    }
    case 'custom': {
      const p = settings.customPath;
      if (!p) return `${workspace}/assets`;
      if (p.startsWith('./') || p.startsWith('../')) {
        if (!docPath) return `${workspace}/${p}`;
        return resolveImagePath(p, docPath);
      }
      return p;
    }
    case 'none':
      return '';
    default: // workspace-assets
      return `${workspace}/assets`;
  }
}

export async function copyImageToStorage(
  base64Data: string,
  originalName: string,
  docPath: string | null,
  settings: ImageSettings
): Promise<string> {
  const storageDir = await getStoragePath(settings, docPath);
  if (!storageDir) {
    const mime = getImageMimeType(originalName);
    return `data:${mime};base64,${base64Data}`;
  }
  const names: string[] = [];
  try {
    const entries = await readSingleDir(storageDir);
    names.push(...entries.filter(e => !e.isDir).map(e => e.name));
  } catch { /* dir may not exist yet */ }
  const name = await generateImageName(originalName, settings.namingStrategy, names);
  const destPath = `${storageDir}/${name}`;
  await writeFileFromBase64(destPath, base64Data);
  if (settings.preferRelative && docPath) {
    return computeRelativePath(docPath, destPath);
  }
  return destPath.replace(/\\/g, '/');
}

export async function copyLocalFileToStorage(
  filePath: string,
  docPath: string | null,
  settings: ImageSettings
): Promise<string> {
  if (settings.storageMode === 'none') {
    return filePathToSrc(filePath);
  }
  const storageDir = await getStoragePath(settings, docPath);
  if (!storageDir) {
    // Fallback to Base64 if no storage dir configured
    const base64 = await readFileAsBase64(filePath);
    const mime = getImageMimeType(filePath);
    return `data:${mime};base64,${base64}`;
  }
  const names: string[] = [];
  try {
    const entries = await readSingleDir(storageDir);
    names.push(...entries.filter(e => !e.isDir).map(e => e.name));
  } catch { /* dir may not exist yet */ }
  const name = await generateImageName(filePath.replace(/^.*[/\\]/, ''), settings.namingStrategy, names);
  const destPath = `${storageDir}/${name}`;
  // Use Rust fs::copy to avoid Base64 IPC round-trip
  await copyFile(filePath, destPath);
  if (settings.preferRelative && docPath) {
    return computeRelativePath(docPath, destPath);
  }
  return destPath.replace(/\\/g, '/');
}

export async function pasteImageFile(
  file: File,
  docPath: string | null,
  settings: ImageSettings
): Promise<string> {
  const base64 = await readFileAsDataUrl(file);
  const raw = base64.substring(base64.indexOf(',') + 1);
  return copyImageToStorage(raw, file.name || '', docPath, settings);
}

function validateRemoteImageUrl(url: string): string {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Unsupported image URL protocol');
  }
  return parsed.toString();
}

export async function handleNetworkImage(
  url: string,
  docPath: string | null,
  settings: ImageSettings
): Promise<string> {
  const normalizedUrl = validateRemoteImageUrl(url);
  if (settings.downloadNetwork) {
    const storageDir = await getStoragePath(settings, docPath);
    if (storageDir) {
      const name = await generateImageName(`download.${getExtension(url) || 'png'}`, settings.namingStrategy);
      const destPath = `${storageDir}/${name}`;
      await downloadImage(normalizedUrl, destPath);
      if (settings.preferRelative && docPath) {
        return computeRelativePath(docPath, destPath);
      }
      return destPath.replace(/\\/g, '/');
    }
  }
  return normalizedUrl;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.substring(dot + 1).toLowerCase() : 'png';
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.substring(0, dot) : name;
}
