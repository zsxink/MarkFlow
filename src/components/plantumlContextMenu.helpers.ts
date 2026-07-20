export const MENU_PADDING = 8;
export const MAX_PNG_CANVAS_DIMENSION = 8192;
export const MAX_PNG_CANVAS_PIXELS = 33_554_432;

export interface MenuPositionInput {
  x: number;
  y: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function clampMenuPosition({
  x,
  y,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
}: MenuPositionInput) {
  const maxLeft = Math.max(MENU_PADDING, viewportWidth - menuWidth - MENU_PADDING);
  const maxTop = Math.max(MENU_PADDING, viewportHeight - menuHeight - MENU_PADDING);

  return {
    left: Math.max(MENU_PADDING, Math.min(x, maxLeft)),
    top: Math.max(MENU_PADDING, Math.min(y, maxTop)),
  };
}

export function validatePngCanvasSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('图片尺寸无效，无法导出 PNG');
  }
  if (width > MAX_PNG_CANVAS_DIMENSION || height > MAX_PNG_CANVAS_DIMENSION) {
    throw new Error('图片尺寸过大，无法导出 PNG');
  }
  if (width * height > MAX_PNG_CANVAS_PIXELS) {
    throw new Error('图片像素过大，无法导出 PNG');
  }
}
