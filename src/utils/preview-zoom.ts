// ── 图片预览缩放纯函数 ─────────────────────────────────────────────────
// 步进/夹紧/适配比例计算（issue #441）。不依赖 DOM，供 image-preview.ts
// 消费与单元测试直测。

export const ZOOM_STEP = 1.25;
export const ZOOM_MIN = 0.1; // 10%
export const ZOOM_MAX = 8; // 800%

/** 夹紧到 [10%, 800%]；边界返回常量本身，避免浮点漂移泄漏到读数。 */
export function clampZoom(scale: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

/** 步进缩放：direction 1 放大（×1.25）/ -1 缩小（÷1.25），结果夹紧。 */
export function stepZoom(base: number, direction: 1 | -1): number {
  return clampZoom(direction === 1 ? base * ZOOM_STEP : base / ZOOM_STEP);
}

/**
 * 适配比例：min((视口−padding)/自然宽, (视口−padding)/自然高)。上限取 1，
 * 因为 fit 视图的 CSS（max-width/max-height）只缩不放，小图实际仍按 100%
 * 渲染——读数与「从 fit 起步」的步进基数都必须对齐真实渲染。非正尺寸
 * 入参（图片未加载、视口未布局）退化为 1。
 */
export function fitScale(
  viewportW: number,
  viewportH: number,
  naturalW: number,
  naturalH: number,
  padding = 48,
): number {
  if (viewportW <= 0 || viewportH <= 0 || naturalW <= 0 || naturalH <= 0) return 1;
  return Math.min(
    1,
    (viewportW - padding) / naturalW,
    (viewportH - padding) / naturalH,
  );
}
