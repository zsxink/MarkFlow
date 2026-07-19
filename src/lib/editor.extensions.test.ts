import { describe, expect, it, vi } from 'vitest';

const { renderMermaid, renderPlantUml, getCachedSettings, store } = vi.hoisted(() => ({
  renderMermaid: vi.fn(), renderPlantUml: vi.fn(), getCachedSettings: vi.fn(), store: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('./mermaid', () => ({ renderMermaid })); vi.mock('./plantuml', () => ({ renderPlantUml })); vi.mock('./plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) })); vi.mock('./storage', () => ({ getCachedSettings })); vi.mock('./store', () => ({ store })); vi.mock('../components/mermaidContextMenu', () => ({ showMermaidContextMenu: vi.fn() })); vi.mock('./editor.state', () => ({ getMermaidExportBaseName: vi.fn() }));
import { BlockImage, CustomLink, mermaidCodeBlockExtension } from './editor.extensions';

describe('editor extensions', () => {
  it('creates an image node view and displays an inline error on image failure', () => {
    const create = BlockImage.config.addNodeView!.call({} as never) as (args: any) => any;
    const view = create({ node: { attrs: { src: '/bad.png', alt: 'broken' } }, HTMLAttributes: { title: 'image' } });
    const image = view.dom.querySelector('img') as HTMLImageElement;
    expect(image.src).toContain('/bad.png'); expect(image.alt).toBe('broken');
    image.dispatchEvent(new Event('error'));
    expect(view.dom.querySelector('.image-error-label')?.textContent).toBe('图片加载失败');
    expect(view.stopEvent({ type: 'mousedown', target: view.dom.querySelector('.image-error-label'), preventDefault: vi.fn() } as unknown as Event)).toBe(true);
  });

  it('serializes links as explicit Markdown links and disables paste autolinks', () => {
    expect(CustomLink.config.addPasteRules!.call({} as never)).toEqual([]);
    const close = (CustomLink.config.addStorage!.call({} as never) as any).markdown.serialize.close;
    expect(close(null, { attrs: { href: 'https://a.test/(x)', title: 'A "title"' } })).toBe('](https://a.test/\\(x\\) "A \\"title\\"")');
    expect(CustomLink.config.addInputRules!.call({} as never)).toHaveLength(1);
  });

  it('creates, updates and destroys Mermaid diagram node views', async () => {
    getCachedSettings.mockReturnValue({ plantumlServerUrl: '' }); renderMermaid.mockResolvedValue('<svg></svg>');
    const extension = mermaidCodeBlockExtension();
    const create = extension.config.addNodeView!.call({} as never) as (args: any) => any;
    const node = { type: { name: 'codeBlock' }, attrs: { language: 'mermaid' }, textContent: 'graph TD', nodeSize: 10 };
    const view = create({ node, editor: { view: { state: { tr: {} }, dispatch: vi.fn() } }, getPos: () => 1 });
    await Promise.resolve();
    expect(view.dom.className).toBe('mermaid-block');
    expect(view.dom.querySelector('.mermaid-preview')?.innerHTML).toContain('svg');
    expect(view.update({ ...node, textContent: 'graph LR' })).toBe(true);
    view.destroy();
    expect(store.off).toHaveBeenCalledWith('settings:changed', expect.any(Function));
  });
});
