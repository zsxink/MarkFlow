import { describe, expect, it } from 'vitest';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, clampZoom, fitScale, stepZoom } from '../preview-zoom';

describe('preview zoom math', () => {
  it('pins the spec band: ×1.25 step clamped to 10%–800%', () => {
    expect(ZOOM_STEP).toBe(1.25);
    expect(ZOOM_MIN).toBe(0.1);
    expect(ZOOM_MAX).toBe(8);
  });

  it('clamps into the band with float-drift safety', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.5)).toBe(0.5);
    // 夹紧边界返回常量本身，杜绝 8.000000000000002 / 0.09999999999999998 泄漏。
    expect(clampZoom(0.09999999999999999)).toBe(ZOOM_MIN);
    expect(clampZoom(0.05)).toBe(ZOOM_MIN);
    expect(clampZoom(8.000000000000002)).toBe(ZOOM_MAX);
    expect(clampZoom(12)).toBe(ZOOM_MAX);
  });

  it('steps ×1.25 up and ÷1.25 down from the base', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBeCloseTo(0.8, 12);
    // 规格场景：适配比例 68% 起步放大 → 85%。
    expect(stepZoom(0.68, 1)).toBeCloseTo(0.85, 12);
    // 步进往返存在浮点误差但必须收敛回基数。
    expect(stepZoom(stepZoom(0.68, 1), -1)).toBeCloseTo(0.68, 12);
  });

  it('clamps stepped zoom exactly at both band edges', () => {
    expect(stepZoom(7, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(0.11, -1)).toBe(ZOOM_MIN);
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });

  it('computes the contained fit ratio for landscape and portrait images', () => {
    // 横图：宽是约束边（可用区 = 视口 − 48 默认留白）。
    expect(fitScale(1048, 1048, 2000, 1000)).toBeCloseTo(0.5, 12);
    // 竖图：高是约束边。
    expect(fitScale(1048, 1048, 1000, 2000)).toBeCloseTo(0.5, 12);
    // 只有一轴受限时取更小者。
    expect(fitScale(548, 4048, 1000, 1000)).toBeCloseTo(0.5, 12);
  });

  it('honours a custom padding', () => {
    expect(fitScale(500, 500, 1000, 1000, 0)).toBeCloseTo(0.5, 12);
    expect(fitScale(540, 540, 1000, 1000, 20)).toBeCloseTo(0.52, 12);
  });

  it('fits exactly at 1 when the padded viewport matches the image', () => {
    expect(fitScale(1048, 1048, 1000, 1000)).toBe(1);
  });

  it('caps the fit ratio at 1 because the fit view never upscales small images', () => {
    expect(fitScale(1048, 1048, 100, 50)).toBe(1);
  });

  it('degrades to 1 for non-positive dimensions', () => {
    expect(fitScale(0, 500, 100, 100)).toBe(1);
    expect(fitScale(500, 0, 100, 100)).toBe(1);
    expect(fitScale(500, 500, 0, 100)).toBe(1);
    expect(fitScale(500, 500, 100, 0)).toBe(1);
    expect(fitScale(-10, 500, 100, 100)).toBe(1);
  });
});
