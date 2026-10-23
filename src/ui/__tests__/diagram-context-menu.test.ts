import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showMermaidContextMenu } from '../mermaid-context-menu';
import { showPlantumlContextMenu } from '../plantuml-context-menu';

const mocks = vi.hoisted(() => ({
  menu: vi.fn(),
  showStatic: vi.fn(),
  mermaidSvg: vi.fn(), mermaidPng: vi.fn(),
  plantumlSvg: vi.fn(), plantumlPng: vi.fn(),
}));
vi.mock('../diagram-context-menu', () => ({ showDiagramContextMenu: mocks.menu }));
vi.mock('../../infra/storage', () => ({
  saveMermaidSvgExport: mocks.mermaidSvg,
  saveMermaidPngExport: mocks.mermaidPng,
  savePlantUmlSvgExport: mocks.plantumlSvg,
  savePlantUmlPngExport: mocks.plantumlPng,
}));
vi.mock('../context-menu', () => ({ showContextMenuStatic: mocks.showStatic }));
vi.mock('../toast', () => ({ showToast: vi.fn() }));

describe('diagram context menu adapters', () => {
  beforeEach(() => mocks.menu.mockClear());

  it('passes Mermaid-specific save callbacks and menu class', () => {
    const state = { svg: '<svg/>', defaultName: 'chart' };
    showMermaidContextMenu(1, 2, state);
    expect(mocks.menu).toHaveBeenCalledWith(1, 2, state, 'mermaid-context-menu', {
      saveSvg: mocks.mermaidSvg, savePng: mocks.mermaidPng,
    });
  });

  it('passes PlantUML-specific save callbacks and menu class', () => {
    const state = { svg: '<svg/>', defaultName: 'chart' };
    showPlantumlContextMenu(3, 4, state);
    expect(mocks.menu).toHaveBeenCalledWith(3, 4, state, 'plantuml-context-menu', {
      saveSvg: mocks.plantumlSvg, savePng: mocks.plantumlPng,
    });
  });
});

describe('shared diagram context menu', () => {
  it('retains the four established actions and diagram class', async () => {
    const { showDiagramContextMenu: renderMenu } = await vi.importActual<typeof import('../diagram-context-menu')>('../diagram-context-menu');
    const state = { svg: '<svg/>', defaultName: 'chart' };
    renderMenu(10, 20, state, 'mermaid-context-menu', { saveSvg: mocks.mermaidSvg, savePng: mocks.mermaidPng });
    const [items, position, options] = mocks.showStatic.mock.calls[mocks.showStatic.mock.calls.length - 1];
    expect(items.map((item: { label: string }) => item.label)).toEqual(['图片另存为 SVG', '图片另存为 PNG', '复制 SVG', '复制 PNG']);
    expect(position).toEqual({ x: 10, y: 20 });
    expect(options).toEqual({ className: 'mermaid-context-menu' });
  });
});
