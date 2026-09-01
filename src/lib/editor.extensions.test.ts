import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, ListItem, ListKeymap, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';

const { renderMermaid, renderPlantUml, getCachedSettings, store } = vi.hoisted(() => ({
  renderMermaid: vi.fn(), renderPlantUml: vi.fn(), getCachedSettings: vi.fn(), store: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('./mermaid', () => ({ renderMermaid })); vi.mock('./plantuml', () => ({ renderPlantUml })); vi.mock('./plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) })); vi.mock('./storage', () => ({ getCachedSettings })); vi.mock('./store', () => ({ store })); vi.mock('../components/mermaidContextMenu', () => ({ showMermaidContextMenu: vi.fn() })); vi.mock('./editor.state', () => ({ getMermaidExportBaseName: vi.fn() }));
import { BlockImage, CustomLink, MarkdownSafeTable, mermaidCodeBlockExtension, renderFencedCodeBlock } from './editor.extensions';
import { createMarkdownExtension, markflowMarked } from './editor.init';

/**
 * Run the custom codeBlock serialize function and return its output.
 */
function serializeCodeBlock(textContent: string, language?: string): string {
  return renderFencedCodeBlock(language ?? 'bash', textContent);
}

function createV3MarkdownEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
      }),
      BulletList,
      OrderedList,
      ListItem,
      ListKeymap,
      TaskList,
      TaskItem.configure({ nested: true }),
      MarkdownSafeTable,
      TableRow,
      TableCell,
      TableHeader,
      CustomLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
      mermaidCodeBlockExtension(),
      createMarkdownExtension(),
    ],
  });
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
    const render = CustomLink.config.renderMarkdown!;
    expect(render(
      { attrs: { href: 'https://a.test/(x)', title: 'A "title"' } },
      { renderChildren: () => 'link text' } as never,
      {} as never,
    )).toBe('[link text](https://a.test/\\(x\\) "A \\"title\\"")');
    const parse = CustomLink.config.parseMarkdown!;
    expect(parse(
      { href: 'https://a.test', title: 'title', tokens: [{ type: 'text', text: 'link text' }] },
      {
        parseInline: () => [{ type: 'text', text: 'link text' }],
        applyMark: (mark: string, content: unknown[], attrs?: unknown) => ({ mark, content, attrs }),
      } as never,
    )).toEqual({
      mark: 'link',
      content: [{ type: 'text', text: 'link text' }],
      attrs: { href: 'https://a.test', title: 'title' },
    });
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

    it('parses serialized code blocks through the v3 Markdown content type', () => {
      getCachedSettings.mockReturnValue({ plantumlServerUrl: '' });
      const editor = createV3MarkdownEditor();
      const markdown = serializeCodeBlock('sudo apt update\n');
      editor.commands.setContent(markdown, { contentType: 'markdown' });
      expect(editor.state.doc.firstChild?.type.name).toBe('codeBlock');
      expect(editor.state.doc.firstChild?.textContent).toBe('sudo apt update\n');
      expect(editor.getMarkdown()).toContain(markdown);
      editor.destroy();
    });

    it('uses a longer fence when code content contains a closing fence candidate', () => {
      expect(renderFencedCodeBlock('text', 'a\n```\nb')).toBe('````text\na\n```\nb\n````');
    });
  });

  it('registers every customized v3 capability exactly once', () => {
    const editor = createV3MarkdownEditor();
    const names = editor.extensionManager.extensions.map(extension => extension.name);
    for (const name of ['link', 'bulletList', 'orderedList', 'listItem', 'listKeymap', 'taskList', 'taskItem', 'codeBlock']) {
      expect(names.filter(extensionName => extensionName === name)).toHaveLength(1);
    }
    editor.destroy();
  });

  it('uses the application-owned isolated Marked instance', () => {
    const editor = createV3MarkdownEditor();
    expect(editor.markdown?.instance).toBe(markflowMarked);
    editor.destroy();
  });

  it('escapes literal pipes in table cells across repeated Markdown round trips', () => {
    const editor = createV3MarkdownEditor();
    const source = '| A | B | C |\n| :--- | ---: | :---: |\n|  | a \\| b |  |';
    editor.commands.setContent(source, { contentType: 'markdown' });
    const first = editor.getJSON();
    const markdown = editor.getMarkdown();
    expect(markdown).toContain('a \\| b');
    editor.commands.setContent(markdown, { contentType: 'markdown' });
    expect(editor.getJSON()).toEqual(first);
    editor.destroy();
  });

  it('runs CustomLink v3 hooks through a real Markdown editor', () => {
    const editor = createV3MarkdownEditor();
    const markdown = '[link text](https://a.test/\\(x\\) "A \\"title\\"")';
    editor.commands.setContent(markdown, { contentType: 'markdown' });

    const link = editor.state.doc.firstChild?.firstChild?.marks.find(mark => mark.type.name === 'link');
    expect(link?.attrs).toMatchObject({ href: 'https://a.test/(x)', title: 'A "title"' });
    expect(editor.getMarkdown()).toContain(markdown);
    editor.destroy();
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
