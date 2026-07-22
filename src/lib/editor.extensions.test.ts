import { describe, expect, it, vi } from 'vitest';

const { renderMermaid, renderPlantUml, getCachedSettings, store } = vi.hoisted(() => ({
  renderMermaid: vi.fn(), renderPlantUml: vi.fn(), getCachedSettings: vi.fn(), store: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('./mermaid', () => ({ renderMermaid })); vi.mock('./plantuml', () => ({ renderPlantUml })); vi.mock('./plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) })); vi.mock('./storage', () => ({ getCachedSettings })); vi.mock('./store', () => ({ store })); vi.mock('../components/mermaidContextMenu', () => ({ showMermaidContextMenu: vi.fn() })); vi.mock('./editor.state', () => ({ getMermaidExportBaseName: vi.fn() }));
import { BlockImage, CustomLink, mermaidCodeBlockExtension } from './editor.extensions';
import { MarkdownSerializerState, defaultMarkdownParser } from 'prosemirror-markdown';

/**
 * Helper to create a minimal codeBlock-like node for serializer tests.
 */
function codeBlockNode(textContent: string, language = 'bash') {
  return {
    type: { name: 'codeBlock' },
    attrs: { language },
    textContent,
  };
}

/**
 * Run the custom codeBlock serialize function and return its output.
 */
function serializeCodeBlock(textContent: string, language?: string): string {
  // @internal — constructor and out are stripped from .d.ts but available at runtime
  const state = new (MarkdownSerializerState as any)({}, {}, { tightLists: false });
  const serialize = (mermaidCodeBlockExtension().config.addStorage!.call({} as any) as any).markdown.serialize;
  serialize(state, codeBlockNode(textContent, language));
  return (state as any).out;
}

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

  describe('codeBlock serialize trailing newline preservation', () => {
    it('serializes code block without trailing newline correctly', () => {
      const result = serializeCodeBlock('sudo apt update');
      expect(result).toBe('```bash\nsudo apt update\n```');
    });

    it('preserves one trailing newline in code block content', () => {
      const result = serializeCodeBlock('sudo apt update\n');
      expect(result).toBe('```bash\nsudo apt update\n\n```');
    });

    it('preserves two trailing newlines in code block content', () => {
      const result = serializeCodeBlock('sudo apt update\n\n');
      expect(result).toBe('```bash\nsudo apt update\n\n\n```');
    });

    it('handles code block with no language set', () => {
      const result = serializeCodeBlock('plain code', '');
      expect(result).toBe('```\nplain code\n```');
    });

    it('handles code block with trailing newline and no language', () => {
      const result = serializeCodeBlock('plain code\n', '');
      expect(result).toBe('```\nplain code\n\n```');
    });

    it('round-trips code block trailing newlines through serialize → parse', () => {
      // Serialize with custom serializer, then parse back with standard parser
      const markdown = serializeCodeBlock('sudo apt update\n');
      const doc = defaultMarkdownParser.parse(markdown);
      expect(doc).not.toBeNull();
      const codeBlock = doc!.firstChild;
      expect(codeBlock?.type.name).toBe('code_block');
      expect(codeBlock?.textContent).toBe('sudo apt update\n');
    });

    it('round-trips code block with no trailing newline (no phantom newline)', () => {
      const markdown = serializeCodeBlock('sudo apt update');
      const doc = defaultMarkdownParser.parse(markdown);
      expect(doc).not.toBeNull();
      const codeBlock = doc!.firstChild;
      expect(codeBlock?.type.name).toBe('code_block');
      expect(codeBlock?.textContent).toBe('sudo apt update');
    });
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
