import { describe, expect, it } from 'vitest';
import {
  MENU_PADDING,
  MAX_PNG_CANVAS_DIMENSION,
  clampMenuPosition,
  validatePngCanvasSize,
} from './plantumlContextMenu.helpers';

describe('clampMenuPosition', () => {
  it('keeps the menu inside the viewport near bottom-right edges', () => {
    expect(clampMenuPosition({
      x: 780,
      y: 580,
      menuWidth: 200,
      menuHeight: 120,
      viewportWidth: 800,
      viewportHeight: 600,
    })).toEqual({
      left: 592,
      top: 472,
    });
  });

  it('clamps to padding in very small viewports', () => {
    expect(clampMenuPosition({
      x: -50,
      y: -40,
      menuWidth: 240,
      menuHeight: 160,
      viewportWidth: 120,
      viewportHeight: 100,
    })).toEqual({
      left: MENU_PADDING,
      top: MENU_PADDING,
    });
  });
});

describe('validatePngCanvasSize', () => {
  it('accepts reasonable dimensions', () => {
    expect(() => validatePngCanvasSize(1200, 800)).not.toThrow();
  });

  it('rejects invalid dimensions', () => {
    expect(() => validatePngCanvasSize(0, 100)).toThrow('图片尺寸无效，无法导出 PNG');
    expect(() => validatePngCanvasSize(Number.NaN, 100)).toThrow('图片尺寸无效，无法导出 PNG');
  });

  it('rejects over-limit single dimensions', () => {
    expect(() => validatePngCanvasSize(MAX_PNG_CANVAS_DIMENSION + 1, 100)).toThrow('图片尺寸过大，无法导出 PNG');
  });

  it('rejects oversized pixel counts', () => {
    expect(() => validatePngCanvasSize(8192, 5000)).toThrow('图片像素过大，无法导出 PNG');
  });
});
