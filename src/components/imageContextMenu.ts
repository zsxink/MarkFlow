import { open } from '@tauri-apps/plugin-shell';
import { getImageMimeType, getFileName, getParentDir, resolveImagePath } from '../lib/pathUtils';
import { fetchRemoteImageAsBase64, readFileAsBase64, saveImageExport } from '../lib/storage';
import { clampMenuPosition } from './mermaidContextMenu.helpers';
import { showToast } from './toast';

interface ImageContextMenuState {
  src: string;
  originalSrc: string;
  docPath: string | null;
}

type ImageContextMenuAction = 'copy-image' | 'save-image' | 'copy-path' | 'open-folder';

let currentState: ImageContextMenuState | null = null;
let globalListenersBound = false;

function getMenuMarkup() {
  return [
    '<button class="context-menu-item" data-action="copy-image">复制到剪切板</button>',
    '<button class="context-menu-item" data-action="save-image">另存为</button>',
    '<button class="context-menu-item" data-action="copy-path">复制路径</button>',
    '<button class="context-menu-item" data-action="open-folder">打开文件所在</button>',
  ].join('');
}

function bindGlobalListeners() {
  if (globalListenersBound) return;
  globalListenersBound = true;

  document.addEventListener('mousedown', (event) => {
    const menu = document.getElementById('image-context-menu');
    if (!menu || menu.hidden) return;
    const target = event.target;
    if (target instanceof Node && menu.contains(target)) return;
    hideImageContextMenu();
  });

  document.addEventListener('scroll', () => {
    if (currentState) hideImageContextMenu();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && currentState) {
      hideImageContextMenu();
    }
  });
}

function getMenu() {
  let menu = document.getElementById('image-context-menu') as HTMLDivElement | null;
  if (menu) return menu;

  bindGlobalListeners();

  menu = document.createElement('div');
  menu.id = 'image-context-menu';
  menu.className = 'context-menu image-context-menu';
  menu.innerHTML = getMenuMarkup();
  menu.hidden = true;
  menu.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLButtonElement>('[data-action]');
    if (!button || !currentState) return;

    event.stopPropagation();
    const action = button.dataset.action as ImageContextMenuAction;
    const state = currentState;
    hideImageContextMenu();
    await handleAction(action, state);
  });
  document.body.appendChild(menu);
  return menu;
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

export function showImageContextMenu(x: number, y: number, state: ImageContextMenuState) {
  currentState = state;
  const menu = getMenu();
  menu.hidden = false;
  menu.style.visibility = 'hidden';
  menu.style.left = '0px';
  menu.style.top = '0px';

  const rect = menu.getBoundingClientRect();
  const position = clampMenuPosition({
    x,
    y,
    menuWidth: rect.width,
    menuHeight: rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });

  menu.style.left = `${position.left}px`;
  menu.style.top = `${position.top}px`;
  menu.style.visibility = '';
}

export function hideImageContextMenu() {
  const menu = document.getElementById('image-context-menu');
  if (menu) {
    menu.hidden = true;
    menu.style.visibility = '';
  }
  currentState = null;
}

async function handleAction(action: ImageContextMenuAction, state: ImageContextMenuState) {
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
    const message = error instanceof Error ? error.message : String(error);
    showToast(message || '操作失败');
  }
}
