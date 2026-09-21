import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, ListItem, ListKeymap, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';

const { renderMermaid, renderPlantUml, isBlankPlantUmlSource, getCachedSettings, store } = vi.hoisted(() => ({
  renderMermaid: vi.fn(), renderPlantUml: vi.fn(), isBlankPlantUmlSource: vi.fn(() => false), getCachedSettings: vi.fn(), store: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('./mermaid', () => ({ renderMermaid })); vi.mock('./plantuml', () => ({ renderPlantUml })); vi.mock('./plantuml-lazy', () => ({ isBlankPlantUmlSource })); vi.mock('./storage', () => ({ getCachedSettings })); vi.mock('./store', () => ({ store })); vi.mock('../components/mermaidContextMenu', () => ({ showMermaidContextMenu: vi.fn() })); vi.mock('./editor.state', () => ({ getMermaidExportBaseName: vi.fn() }));
import { BlockImage, CustomLink, MarkdownSafeTable, SafeParagraph, escapeParagraphMarkdown, mermaidCodeBlockExtension, renderFencedCodeBlock } from './editor.extensions';
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
        paragraph: false,
        codeBlock: false,
        link: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
      }),
      SafeParagraph,
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
    for (const name of ['paragraph', 'link', 'bulletList', 'orderedList', 'listItem', 'listKeymap', 'taskList', 'taskItem', 'codeBlock']) {
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

  it('renders PlantUML for both the plantuml and puml language aliases', async () => {
    getCachedSettings.mockReturnValue({ plantumlServerUrl: 'https://www.plantuml.com/plantuml' });
    renderPlantUml.mockResolvedValue('<svg data-plantuml></svg>');
    const extension = mermaidCodeBlockExtension();
    const create = extension.config.addNodeView!.call({} as never) as (args: any) => any;
    const editor = { view: { state: { tr: {} }, dispatch: vi.fn() } };
    for (const language of ['plantuml', 'puml']) {
      const node = { type: { name: 'codeBlock' }, attrs: { language }, textContent: '@startuml\nAlice -> Bob\n@enduml', nodeSize: 20 };
      const view = create({ node, editor, getPos: () => 1 });
      await Promise.resolve();
      expect(view.dom.className).toBe('mermaid-block');
      expect(view.dom.querySelector('.mermaid-preview')?.innerHTML).toContain('data-plantuml');
      view.destroy();
    }
    expect(renderPlantUml).toHaveBeenCalledTimes(2);
  });

  it('recreates a PlantUML NodeView when enabling or disabling its service changes contentDOM mode', () => {
    const make = (url: string) => {
      const registrations = vi.fn();
      store.on.mockImplementation(registrations);
      getCachedSettings.mockReturnValue({ plantumlServerUrl: url });
      const create = mermaidCodeBlockExtension().config.addNodeView!.call({} as never) as (args: any) => any;
      const dispatch = vi.fn();
      const node = { type: { name: 'codeBlock' }, attrs: { language: 'puml' }, textContent: '@startuml\nA->B\n@enduml', nodeSize: 20 };
      const view = create({ node, editor: { view: { state: { tr: {} }, dispatch } }, getPos: () => 1 });
      const listener = registrations.mock.calls.find(([event]) => event === 'settings:changed')?.[1] as (event: any) => void;
      return { view, node, dispatch, listener };
    };

    const disabled = make('');
    disabled.listener({ settings: { plantumlServerUrl: 'https://plantuml.test' } });
    expect(disabled.dispatch).toHaveBeenCalledOnce();
    expect(disabled.view.update(disabled.node)).toBe(false);
    disabled.view.destroy();

    const enabled = make('https://plantuml.test');
    enabled.listener({ settings: { plantumlServerUrl: '' } });
    expect(enabled.dispatch).toHaveBeenCalledOnce();
    expect(enabled.view.update(enabled.node)).toBe(false);
    enabled.view.destroy();
  });

  it('keeps blank configured PlantUML editable and recreates when source crosses preview boundary', () => {
    getCachedSettings.mockReturnValue({ plantumlServerUrl: 'https://plantuml.test' });
    isBlankPlantUmlSource.mockImplementation(((source: string) => source.trim().length === 0) as never);
    const create = mermaidCodeBlockExtension().config.addNodeView!.call({} as never) as (args: any) => any;
    const editor = { view: { state: { tr: {} }, dispatch: vi.fn() } };
    const blank = { type: { name: 'codeBlock' }, attrs: { language: 'plantuml' }, textContent: '', nodeSize: 2 };
    const nonBlank = { ...blank, textContent: '@startuml\nA->B\n@enduml', nodeSize: 20 };

    const blankView = create({ node: blank, editor, getPos: () => 1 });
    expect(blankView.contentDOM).toBeDefined();
    expect(blankView.dom.className).toBe('code-block-view');
    expect(blankView.update(nonBlank)).toBe(false);
    blankView.destroy();

    const previewView = create({ node: nonBlank, editor, getPos: () => 1 });
    expect(previewView.contentDOM).toBeUndefined();
    expect(previewView.update(blank)).toBe(false);
    previewView.destroy();
  });

  describe('escapeParagraphMarkdown (issue #286)', () => {
    it('escapes line-leading block prefixes only on the first line', () => {
      expect(escapeParagraphMarkdown('6. 正文')).toBe('6\\. 正文');
      expect(escapeParagraphMarkdown('1. 另一段')).toBe('1\\. 另一段');
      expect(escapeParagraphMarkdown('10. 第三段')).toBe('10\\. 第三段');
      expect(escapeParagraphMarkdown('999999999. x')).toBe('999999999\\. x');
      expect(escapeParagraphMarkdown('5) 正文')).toBe('5\\) 正文');
      expect(escapeParagraphMarkdown('- foo')).toBe('\\- foo');
      expect(escapeParagraphMarkdown('+ foo')).toBe('\\+ foo');
      expect(escapeParagraphMarkdown('# foo')).toBe('\\# foo');
      expect(escapeParagraphMarkdown('### foo')).toBe('\\### foo');
      expect(escapeParagraphMarkdown('---')).toBe('\\---');
      expect(escapeParagraphMarkdown('***')).toBe('\\***');
      expect(escapeParagraphMarkdown('___')).toBe('\\___');
      // HR-only lines allow trailing whitespace; the leading marker is escaped
      // (trailing whitespace is trimmed with the match).
      expect(escapeParagraphMarkdown('---  ')).toBe('\\---');
      expect(escapeParagraphMarkdown('___ \t')).toBe('\\___');
    });

    it('escapes only the first line — later lines are left untouched', () => {
      expect(escapeParagraphMarkdown('6. first\n- second\n# third')).toBe('6\\. first\n- second\n# third');
    });

    it('keeps ordinary leading text and non-ambiguous prefixes untouched', () => {
      expect(escapeParagraphMarkdown('6.x')).toBe('6.x');
      expect(escapeParagraphMarkdown('-foo')).toBe('-foo');
      expect(escapeParagraphMarkdown('a 6. x')).toBe('a 6. x');
      expect(escapeParagraphMarkdown('6. 正文 6\\. later')).toBe('6\\. 正文 6\\. later');
      expect(escapeParagraphMarkdown('hello **world**')).toBe('hello **world**');
      expect(escapeParagraphMarkdown('')).toBe('');
      expect(escapeParagraphMarkdown('plain text')).toBe('plain text');
    });
  });
});
