// ── 图片预览面 ────────────────────────────────────────────────────────
// 图片会话激活时挂载于 #editor-area 的预览容器；编辑器挂载点由
// #editor-area 的 preview-active class 让位（见 editor.css）。缩放只有
// 两态：fit（等比完整可见）与 original（1:1 像素 + 滚动），切换按钮
// 文案随之互换。加载失败时降级为「图片加载失败」占位，不弹窗不崩溃。

import { convertFileSrc } from '@tauri-apps/api/core';
import { getFileName } from '../../utils/paths';

const PREVIEW_ID = 'image-preview';

let container: HTMLElement | null = null;
let image: HTMLImageElement | null = null;
let error: HTMLElement | null = null;
let toggle: HTMLButtonElement | null = null;
let shownPath: string | null = null;
let originalSize = false;

function setFailed(failed: boolean): void {
  if (image) image.hidden = failed;
  if (error) error.hidden = !failed;
}

function applyScaleClass(): void {
  container?.classList.toggle('original-size', originalSize);
  if (toggle) toggle.textContent = originalSize ? '适应窗口' : '原始尺寸';
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
  const scaleToggle = document.createElement('button');
  scaleToggle.type = 'button';
  scaleToggle.className = 'btn-secondary image-preview-toggle';
  scaleToggle.textContent = '原始尺寸';
  scaleToggle.addEventListener('click', () => {
    originalSize = !originalSize;
    applyScaleClass();
  });
  toolbar.append(filename, scaleToggle);

  const viewport = document.createElement('div');
  viewport.className = 'image-preview-viewport';
  const img = document.createElement('img');
  img.className = 'image-preview-img';
  img.alt = getFileName(path);
  img.decoding = 'async';
  // 授权失败/文件被删/内容损坏都汇聚为同一个占位提示。
  img.addEventListener('error', () => setFailed(true));
  img.addEventListener('load', () => setFailed(false));
  const failure = document.createElement('div');
  failure.className = 'image-preview-error';
  failure.textContent = '图片加载失败';
  failure.hidden = true;
  viewport.append(img, failure);

  root.append(toolbar, viewport);
  image = img;
  error = failure;
  toggle = scaleToggle;
  return root;
}

/** Show (or refresh after a path rewrite) the preview for the active image tab. */
export function showImagePreview(path: string): void {
  const area = document.getElementById('editor-area');
  if (!area) return;
  if (!container) {
    container = build(path);
    area.append(container);
    applyScaleClass();
  }
  if (shownPath !== path) {
    const filename = container.querySelector('.image-preview-filename');
    if (filename) filename.textContent = getFileName(path);
    if (image) image.alt = getFileName(path);
    setFailed(false);
    // 换图后回到默认 fit 态，避免 original 缩放跨图片残留。
    originalSize = false;
    applyScaleClass();
    // 先重置 src 再赋值，确保同一路径被外部删除后重写也能再次触发 error。
    image?.removeAttribute('src');
    if (image) image.src = convertFileSrc(path);
  }
  shownPath = path;
}

/** Hide the preview surface; the editor mount becomes visible again via CSS. */
export function hideImagePreview(): void {
  container?.remove();
  container = null;
  image = null;
  error = null;
  toggle = null;
  shownPath = null;
  originalSize = false;
}
