// ── 图片预览面 ────────────────────────────────────────────────────────
// 图片会话激活时挂载于 #editor-area 的预览容器；编辑器挂载点由
// #editor-area 的 preview-active class 让位（见 editor.css）。缩放状态机
// 为 fit（等比完整可见，CSS 自适配）/ manual（显式比例：1:1 或 ×1.25
// 步进，夹紧 10%–800%），溢出视口时支持鼠标按住拖动平移（issue #441）。
// 加载失败由容器 .failed 状态类驱动「图片加载失败」占位，不弹窗不崩溃，
// 成功路径绝不显示占位。

import { convertFileSrc } from '@tauri-apps/api/core';
import { getFileName } from '../../utils/paths';
import { fitScale, stepZoom } from '../../utils/preview-zoom';

const PREVIEW_ID = 'image-preview';

// Lucide v1.17.0 路径内联（同 file-tree/header.ts 的同源模式），与已确认
// 原型图标一致；1:1 用文字字形而非路径图标。Stroke 1.75 + round caps/joins
// 镜像原型渲染。
const ICONS = {
  fitWindow: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  zoomIn: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>',
  oneToOne: '<text x="12" y="16" text-anchor="middle" font-size="10.5" font-weight="600" fill="currentColor" stroke="none">1:1</text>',
} as const;

let container: HTMLElement | null = null;
let image: HTMLImageElement | null = null;
let viewport: HTMLElement | null = null;
let pctReadout: HTMLElement | null = null;
let fitButton: HTMLButtonElement | null = null;
let actualButton: HTMLButtonElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let shownPath: string | null = null;
let mode: 'fit' | 'manual' = 'fit';
let scale = 1;
// 图片天然尺寸在 load 后缓存（换图清零）；fit 基数与 manual 内联宽度都依赖它。
let naturalW = 0;
let naturalH = 0;

function setFailed(failed: boolean): void {
  container?.classList.toggle('failed', failed);
}

function isPannable(): boolean {
  if (!viewport) return false;
  return viewport.scrollWidth > viewport.clientWidth
    || viewport.scrollHeight > viewport.clientHeight;
}

/** 缩放渲染单真相：尺寸类、内联宽度、按钮高亮、百分比读数、可拖类。 */
function renderZoom(): void {
  if (!image) return;
  const isFit = mode === 'fit';
  image.classList.toggle('fit', isFit);
  image.classList.toggle('manual', !isFit);
  if (isFit) image.style.removeProperty('width');
  else image.style.width = `${naturalW * scale}px`;
  fitButton?.setAttribute('aria-pressed', String(isFit));
  actualButton?.setAttribute('aria-pressed', String(!isFit && Math.abs(scale - 1) < 0.001));
  const effective = isFit && viewport
    ? fitScale(viewport.clientWidth, viewport.clientHeight, naturalW, naturalH)
    : scale;
  if (pctReadout) pctReadout.textContent = `${Math.round(effective * 100)}%`;
  viewport?.classList.toggle('can-pan', isPannable());
}

/** 步进缩放：从当前生效比例（fit 态取适配比例）为基数，切入 manual。 */
function stepPreviewZoom(direction: 1 | -1): void {
  const base = mode === 'fit' && viewport
    ? fitScale(viewport.clientWidth, viewport.clientHeight, naturalW, naturalH)
    : scale;
  scale = stepZoom(base, direction);
  mode = 'manual';
  renderZoom();
}

/** 换图/拆除时的缩放复位：回 fit 态并清空天然尺寸缓存。 */
function resetZoomState(): void {
  mode = 'fit';
  scale = 1;
  naturalW = 0;
  naturalH = 0;
  renderZoom();
}

/** 鼠标按住拖动平移：仅 mouse 左键且图片溢出时启动，位移取反映射到滚动
 *  偏移；pointerType 过滤保证触摸/触控板手势走原生滚动不受影响。 */
function attachPan(viewportEl: HTMLElement): void {
  let panning = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  viewportEl.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !isPannable()) return;
    panning = true;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = viewportEl.scrollLeft;
    startTop = viewportEl.scrollTop;
    viewportEl.classList.add('panning');
    viewportEl.setPointerCapture(event.pointerId);
  });
  viewportEl.addEventListener('pointermove', (event) => {
    if (!panning) return;
    viewportEl.scrollLeft = startLeft - (event.clientX - startX);
    viewportEl.scrollTop = startTop - (event.clientY - startY);
  });
  const endPan = (event: PointerEvent) => {
    if (!panning) return;
    panning = false;
    viewportEl.classList.remove('panning');
    if (viewportEl.hasPointerCapture(event.pointerId)) {
      viewportEl.releasePointerCapture(event.pointerId);
    }
  };
  viewportEl.addEventListener('pointerup', endPan);
  viewportEl.addEventListener('pointercancel', endPan);
}

function iconButton(label: string, icon: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'image-preview-btn';
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
  button.addEventListener('click', onClick);
  return button;
}

function build(path: string): HTMLElement {
  const root = document.createElement('div');
  root.id = PREVIEW_ID;
  root.className = 'image-preview';

  const toolbar = document.createElement('div');
  toolbar.className = 'image-preview-toolbar';
  const filename = document.createElement('span');
  filename.className = 'image-preview-filename';
  filename.textContent = getFileName(path);

  const controls = document.createElement('div');
  controls.className = 'image-preview-controls';
  const zoomGroup = document.createElement('div');
  zoomGroup.className = 'image-preview-zoom-group';
  const zoomOut = iconButton('缩小', ICONS.zoomOut, () => stepPreviewZoom(-1));
  const pct = document.createElement('span');
  pct.className = 'image-preview-pct';
  const zoomIn = iconButton('放大', ICONS.zoomIn, () => stepPreviewZoom(1));
  zoomGroup.append(zoomOut, pct, zoomIn);
  const fit = iconButton('适应窗口', ICONS.fitWindow, () => {
    mode = 'fit';
    renderZoom();
  });
  const actual = iconButton('原始尺寸 (1:1)', ICONS.oneToOne, () => {
    mode = 'manual';
    scale = 1;
    renderZoom();
  });
  controls.append(zoomGroup, fit, actual);
  toolbar.append(filename, controls);

  const viewportEl = document.createElement('div');
  viewportEl.className = 'image-preview-viewport';
  const img = document.createElement('img');
  img.className = 'image-preview-img fit';
  img.alt = getFileName(path);
  img.decoding = 'async';
  // 原生图片拖拽会吃掉平移手势（拖拽幽灵图像），禁掉并兜底 preventDefault。
  img.draggable = false;
  img.addEventListener('dragstart', (event) => event.preventDefault());
  img.addEventListener('load', () => {
    // 授权失败/文件被删/内容损坏都汇聚为同一个占位提示；加载成功即解除。
    setFailed(false);
    naturalW = img.naturalWidth;
    naturalH = img.naturalHeight;
    renderZoom();
  });
  img.addEventListener('error', () => setFailed(true));
  const failure = document.createElement('div');
  failure.className = 'image-preview-error';
  failure.textContent = '图片加载失败';
  viewportEl.append(img, failure);
  attachPan(viewportEl);

  root.append(toolbar, viewportEl);
  image = img;
  viewport = viewportEl;
  pctReadout = pct;
  fitButton = fit;
  actualButton = actual;
  // fit 态尺寸由 CSS 自动重适配，resize 只需刷新读数与 .can-pan 判定。
  resizeObserver = new ResizeObserver(() => renderZoom());
  resizeObserver.observe(viewportEl);
  return root;
}

/** Show (or refresh after a path rewrite) the preview for the active image tab. */
export function showImagePreview(path: string): void {
  const area = document.getElementById('editor-area');
  if (!area) return;
  if (!container) {
    container = build(path);
    area.append(container);
    renderZoom();
  }
  if (shownPath !== path) {
    const filename = container.querySelector('.image-preview-filename');
    if (filename) filename.textContent = getFileName(path);
    if (image) image.alt = getFileName(path);
    setFailed(false);
    // 换图后回到默认 fit 态，避免缩放与天然尺寸缓存跨图片残留。
    resetZoomState();
    // 先重置 src 再赋值，确保同一路径被外部删除后重写也能再次触发 error。
    image?.removeAttribute('src');
    if (image) image.src = convertFileSrc(path);
  }
  shownPath = path;
}

/** Hide the preview surface; the editor mount becomes visible again via CSS. */
export function hideImagePreview(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
  container?.remove();
  container = null;
  image = null;
  viewport = null;
  pctReadout = null;
  fitButton = null;
  actualButton = null;
  shownPath = null;
  resetZoomState();
}
