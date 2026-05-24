import { saveMermaidPngExport, saveMermaidSvgExport } from '../lib/storage';
import {
  clampMenuPosition,
  validatePngCanvasSize,
} from './mermaidContextMenu.helpers';
import { showToast } from './toast';

interface MermaidContextMenuState {
  svg: string;
  defaultName: string;
}

type MermaidContextMenuAction = 'save-svg' | 'save-png' | 'copy-svg' | 'copy-png';

let currentState: MermaidContextMenuState | null = null;
let globalListenersBound = false;

function getMenuMarkup() {
  return [
    '<button class="context-menu-item" data-action="save-svg">图片另存为 SVG</button>',
    '<button class="context-menu-item" data-action="save-png">图片另存为 PNG</button>',
    '<button class="context-menu-item" data-action="copy-svg">复制 SVG</button>',
    '<button class="context-menu-item" data-action="copy-png">复制 PNG</button>',
  ].join('');
}

function bindGlobalListeners() {
  if (globalListenersBound) return;
  globalListenersBound = true;

  document.addEventListener('mousedown', (event) => {
    const menu = document.getElementById('mermaid-context-menu');
    if (!menu || menu.hidden) return;
    const target = event.target;
    if (target instanceof Node && menu.contains(target)) return;
    hideMermaidContextMenu();
  });

  document.addEventListener('scroll', () => {
    if (currentState) hideMermaidContextMenu();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && currentState) {
      hideMermaidContextMenu();
    }
  });
}

function getMenu() {
  let menu = document.getElementById('mermaid-context-menu') as HTMLDivElement | null;
  if (menu) return menu;

  bindGlobalListeners();

  menu = document.createElement('div');
  menu.id = 'mermaid-context-menu';
  menu.className = 'context-menu mermaid-context-menu';
  menu.innerHTML = getMenuMarkup();
  menu.hidden = true;
  menu.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLButtonElement>('[data-action]');
    if (!button || !currentState) return;

    event.stopPropagation();
    const action = button.dataset.action as MermaidContextMenuAction;
    const state = currentState;
    hideMermaidContextMenu();
    await handleAction(action, state);
  });
  document.body.appendChild(menu);
  return menu;
}

export function showMermaidContextMenu(x: number, y: number, state: MermaidContextMenuState) {
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

export function hideMermaidContextMenu() {
  const menu = document.getElementById('mermaid-context-menu');
  if (menu) {
    menu.hidden = true;
    menu.style.visibility = '';
  }
  currentState = null;
}

function parseSvgDimension(value: string | null) {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getValidViewBoxSize(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getSvgSize(svg: string) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const svgEl = doc.documentElement;
  const width = parseSvgDimension(svgEl.getAttribute('width'));
  const height = parseSvgDimension(svgEl.getAttribute('height'));
  const viewBox = svgEl.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number) || [];
  const viewBoxWidth = viewBox.length === 4 ? getValidViewBoxSize(viewBox[2]) : 0;
  const viewBoxHeight = viewBox.length === 4 ? getValidViewBoxSize(viewBox[3]) : 0;

  if (viewBoxWidth && viewBoxHeight) {
    return { width: viewBoxWidth, height: viewBoxHeight };
  }
  if (width && height) {
    return { width, height };
  }
  return { width: 0, height: 0 };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('PNG 转换失败'));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG 导出失败'));
    }, 'image/png');
  });
}

async function svgToPngBlob(svg: string) {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(svgUrl);
    const svgSize = getSvgSize(svg);
    const hasExplicitSize = svgSize.width > 0 && svgSize.height > 0;
    const width = Math.ceil(hasExplicitSize ? svgSize.width : (image.naturalWidth || 1));
    const height = Math.ceil(hasExplicitSize ? svgSize.height : (image.naturalHeight || 1));
    validatePngCanvasSize(width, height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建 PNG 画布');
    }
    context.drawImage(image, 0, 0, width, height);
    return await canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
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

async function copySvg(svg: string) {
  const ClipboardItemCtor = window.ClipboardItem;
  if (ClipboardItemCtor && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItemCtor({
        'image/svg+xml': new Blob([svg], { type: 'image/svg+xml' }),
        'text/plain': new Blob([svg], { type: 'text/plain' }),
      }),
    ]);
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(svg);
    return;
  }

  throw new Error('当前环境不支持复制 SVG');
}

async function copyPng(svg: string) {
  const ClipboardItemCtor = window.ClipboardItem;
  if (!ClipboardItemCtor || !navigator.clipboard?.write) {
    throw new Error('当前环境不支持复制 PNG');
  }

  const pngBlob = await svgToPngBlob(svg);
  await navigator.clipboard.write([
    new ClipboardItemCtor({
      'image/png': pngBlob,
    }),
  ]);
}

async function saveSvg(state: MermaidContextMenuState) {
  const saved = await saveMermaidSvgExport(state.svg, state.defaultName);
  if (saved) {
    showToast('SVG 已保存');
  }
}

async function savePng(state: MermaidContextMenuState) {
  const pngBlob = await svgToPngBlob(state.svg);
  const data = await blobToBase64(pngBlob);
  const saved = await saveMermaidPngExport(data, state.defaultName);
  if (saved) {
    showToast('PNG 已保存');
  }
}

async function handleAction(action: MermaidContextMenuAction, state: MermaidContextMenuState) {
  try {
    switch (action) {
      case 'save-svg':
        await saveSvg(state);
        break;
      case 'save-png':
        await savePng(state);
        break;
      case 'copy-svg':
        await copySvg(state.svg);
        showToast('SVG 已复制');
        break;
      case 'copy-png':
        await copyPng(state.svg);
        showToast('PNG 已复制');
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showToast(message || '操作失败');
  }
}
