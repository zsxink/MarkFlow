import { describe, expect, it, vi } from 'vitest';

// document-tabs 顶层 import 了 session 协调器（再往下是 Tauri/editor 全家桶），
// 纯函数测试只需要几何计算，mock 掉模块边界即可保持无 DOM/无 Tauri 依赖。
vi.mock('../documents/session', () => ({
  MAX_DOCUMENT_TABS: 20,
  activateDocumentTab: () => {},
  closeAllDocumentTabs: () => {},
  closeDocumentTab: () => {},
  getActiveTabId: () => null,
  getDocumentTabs: () => [],
  newDocumentTab: () => {},
  onDocumentTabsChanged: () => () => {},
}));

import { computeActiveTabScrollLeft } from '../document-tabs';

describe('computeActiveTabScrollLeft', () => {
  it('左越界时左对齐到标签左边缘', () => {
    // 可视区 [300, 500]，标签 [120, 260] 整体在左侧之外。
    expect(computeActiveTabScrollLeft({
      tabOffsetLeft: 120, tabOffsetWidth: 140, scrollLeft: 300, clientWidth: 200,
    })).toBe(120);
  });

  it('右越界时右对齐到标签右边缘', () => {
    // 可视区 [0, 200]，标签 [150, 320] 右端之外。
    expect(computeActiveTabScrollLeft({
      tabOffsetLeft: 150, tabOffsetWidth: 170, scrollLeft: 0, clientWidth: 200,
    })).toBe(120);
  });

  it('恰好完整可见时保持原 scrollLeft', () => {
    // 两端正好齐平可视区边界 [100, 300]。
    expect(computeActiveTabScrollLeft({
      tabOffsetLeft: 100, tabOffsetWidth: 200, scrollLeft: 100, clientWidth: 200,
    })).toBe(100);
  });

  it('越界 1px 时只滚动最小量 1px', () => {
    // 右端超出 1px：[50, 201] vs 可视区 [0, 200]。
    expect(computeActiveTabScrollLeft({
      tabOffsetLeft: 50, tabOffsetWidth: 151, scrollLeft: 0, clientWidth: 200,
    })).toBe(1);
    // 左端超出 1px：[99, 199] vs scrollLeft 100。
    expect(computeActiveTabScrollLeft({
      tabOffsetLeft: 99, tabOffsetWidth: 100, scrollLeft: 100, clientWidth: 200,
    })).toBe(99);
  });

  it('活动标签宽于容器时对齐更近的一端', () => {
    // 标签 [100, 400]（宽 300）永远装不进 200 宽的可视区。
    // 左边缘被裁（可视区 [150, 350]）→ 左对齐看到标签开头。
    expect(computeActiveTabScrollLeft({
      tabOffsetLeft: 100, tabOffsetWidth: 300, scrollLeft: 150, clientWidth: 200,
    })).toBe(100);
    // 左边缘可见、右边缘被裁（可视区 [0, 200]）→ 右对齐看到标签结尾。
    expect(computeActiveTabScrollLeft({
      tabOffsetLeft: 100, tabOffsetWidth: 300, scrollLeft: 0, clientWidth: 200,
    })).toBe(200);
  });
});
