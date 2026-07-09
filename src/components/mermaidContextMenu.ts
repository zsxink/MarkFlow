import { saveMermaidPngExport, saveMermaidSvgExport } from '../lib/storage';
import { validatePngCanvasSize } from './mermaidContextMenu.helpers';
import { showToast } from './toast';
import { showContextMenuStatic } from './ui/contextMenu';
import type { ContextMenuItem } from './ui/contextMenu';

interface MermaidContextMenuState {
  svg: string;
  defaultName: string;
}

export function showMermaidContextMenu(x: number, y: number, state: MermaidContextMenuState) {
  const menuItems: ContextMenuItem[] = [
    {
      label: '图片另存为 SVG',
      onClick: () => { saveSvg(state).catch(e => showToast(`操作失败: ${e}`)); },
    },
    {
      label: '图片另存为 PNG',
      onClick: () => { savePng(state).catch(e => showToast(`操作失败: ${e}`)); },
    },
    {
      label: '复制 SVG',
      onClick: () => { copySvg(state.svg).then(() => showToast('SVG 已复制')).catch(e => showToast(e instanceof Error ? e.message : String(e))); },
    },
    {
      label: '复制 PNG',
      onClick: () => { copyPng(state.svg).then(() => showToast('PNG 已复制')).catch(e => showToast(e instanceof Error ? e.message : String(e))); },
    },
  ];

  showContextMenuStatic(menuItems, { x, y }, { className: 'mermaid-context-menu' });
}

export function hideMermaidContextMenu() {
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

