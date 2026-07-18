import { open } from '@tauri-apps/plugin-shell';
import { getImageMimeType, getFileName, getParentDir, resolveImagePath } from '../lib/pathUtils';
import { fetchRemoteImageAsBase64, readFileAsBase64, saveImageExport } from '../lib/storage';
import { showToast } from './toast';
import { reportUserActionError } from '../lib/error';
import { showContextMenuStatic } from './ui/contextMenu';
import type { ContextMenuItem } from './ui/contextMenu';

interface ImageContextMenuState {
  src: string;
  originalSrc: string;
  docPath: string | null;
}

export function showImageContextMenu(x: number, y: number, state: ImageContextMenuState) {
  const menuItems: ContextMenuItem[] = [
    {
      label: '复制到剪切板',
      onClick: () => { handleAction('copy-image', state).catch(e => reportUserActionError('image-menu.copy-image', e)); },
    },
    {
      label: '另存为',
      onClick: () => { handleAction('save-image', state).catch(e => reportUserActionError('image-menu.save-image', e)); },
    },
    {
      label: '复制路径',
      onClick: () => { handleAction('copy-path', state).catch(e => reportUserActionError('image-menu.copy-path', e)); },
    },
    {
      label: '打开文件所在',
      onClick: () => { handleAction('open-folder', state).catch(e => reportUserActionError('image-menu.open-folder', e)); },
    },
  ];

  showContextMenuStatic(menuItems, { x, y }, { className: 'image-context-menu' });
}

export function hideImageContextMenu() {
}

function stripQueryAndHash(value: string) {
  return value.split('#')[0].split('?')[0];
}

function isRemoteUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://');
}

function isDataUrl(value: string) {
  return value.startsWith('data:');
}

function isAbsolutePath(value: string) {
  return /^[a-zA-Z]:/.test(value) || value.startsWith('/');
}

function decodeAssetPath(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'asset:' && parsed.hostname !== 'asset.localhost') {
      return null;
    }
    const decodedPath = decodeURIComponent(parsed.pathname);
    return /^\/[a-zA-Z]:/.test(decodedPath) ? decodedPath.slice(1) : decodedPath;
  } catch {
    return null;
  }
}

function getLocalImagePath(state: ImageContextMenuState) {
  for (const source of [state.originalSrc, state.src]) {
    if (!source || isRemoteUrl(source) || isDataUrl(source)) continue;
    const assetPath = decodeAssetPath(source);
    if (assetPath) return assetPath;
    if (isAbsolutePath(source)) return source;
    if (state.docPath) return resolveImagePath(source, state.docPath);
  }
  return null;
}

function getFileExtension(fileName: string) {
  const cleanName = stripQueryAndHash(fileName);
  const dotIndex = cleanName.lastIndexOf('.');
  return dotIndex >= 0 ? cleanName.slice(dotIndex + 1).toLowerCase() : '';
}

function getExtensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/gif': return 'gif';
    case 'image/webp': return 'webp';
    case 'image/svg+xml': return 'svg';
    case 'image/bmp': return 'bmp';
    default: return 'png';
  }
}

function getDefaultFileName(state: ImageContextMenuState, mimeType: string) {
  const source = stripQueryAndHash(getLocalImagePath(state) || state.originalSrc || state.src);
  const sourceName = source ? getFileName(source) : '';
  if (sourceName && getFileExtension(sourceName)) {
    return sourceName;
  }
  return `image.${getExtensionFromMimeType(mimeType)}`;
}

function base64ToBlob(data: string, mimeType: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function dataUrlToBlob(url: string) {
  const match = url.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/);
  if (!match) {
    throw new Error('图片数据无效');
  }
  const mimeType = match[1] || 'application/octet-stream';
  const payload = match[2] || '';
  return base64ToBlob(payload, mimeType);
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function fetchBlob(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`图片读取失败: ${response.status}`);
  }
  return response.blob();
}

async function fetchRemoteImageBlob(url: string) {
  const { data, mimeType } = await fetchRemoteImageAsBase64(url);
  return base64ToBlob(data, mimeType || getImageMimeType(url));
}

async function resolveImageBlob(state: ImageContextMenuState) {
  const localPath = getLocalImagePath(state);
  if (localPath) {
    const data = await readFileAsBase64(localPath);
    return base64ToBlob(data, getImageMimeType(localPath));
  }
  if (isDataUrl(state.originalSrc)) {
    return dataUrlToBlob(state.originalSrc);
  }
  if (isDataUrl(state.src)) {
    return dataUrlToBlob(state.src);
  }
  if (isRemoteUrl(state.originalSrc)) {
    return fetchRemoteImageBlob(state.originalSrc);
  }
  if (isRemoteUrl(state.src)) {
    return fetchRemoteImageBlob(state.src);
  }
  return fetchBlob(state.src);
}

async function copyImage(state: ImageContextMenuState) {
  const ClipboardItemCtor = window.ClipboardItem;
  if (!ClipboardItemCtor || !navigator.clipboard?.write) {
    throw new Error('当前环境不支持复制图片');
  }

  const blob = await resolveImageBlob(state);
  const mimeType = blob.type || getImageMimeType(state.originalSrc || state.src);
  await navigator.clipboard.write([
    new ClipboardItemCtor({
      [mimeType]: blob,
    }),
  ]);
}

async function saveImage(state: ImageContextMenuState) {
  const blob = await resolveImageBlob(state);
  const mimeType = blob.type || getImageMimeType(state.originalSrc || state.src);
  const fileName = getDefaultFileName(state, mimeType);
  const extension = getFileExtension(fileName) || getExtensionFromMimeType(mimeType);
  const data = await blobToBase64(blob);
  const saved = await saveImageExport(data, fileName, extension);
  if (saved) {
    showToast('图片已保存');
  }
}

async function copyPath(state: ImageContextMenuState) {
  await navigator.clipboard.writeText(getLocalImagePath(state) || state.originalSrc || state.src);
  showToast('图片路径已复制');
}

async function openContainingFolder(state: ImageContextMenuState) {
  const localPath = getLocalImagePath(state);
  if (!localPath) {
    throw new Error('当前图片没有本地路径');
  }
  await open(getParentDir(localPath));
  showToast('已打开图片所在位置');
}

async function handleAction(action: string, state: ImageContextMenuState) {
  try {
    switch (action) {
      case 'copy-image':
        await copyImage(state);
        showToast('图片已复制到剪切板');
        break;
      case 'save-image':
        await saveImage(state);
        break;
      case 'copy-path':
        await copyPath(state);
        break;
      case 'open-folder':
        await openContainingFolder(state);
        break;
    }
  } catch (error) {
    // Surface the error to the caller's reportUserActionError wrapper so it
    // is classified and logged with context rather than silently swallowed.
    throw error;
  }
}
