import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, ListItem, ListKeymap, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';

const { renderMermaid, renderPlantUml, isBlankPlantUmlSource, getCachedSettings, store } = vi.hoisted(() => ({
  renderMermaid: vi.fn(), renderPlantUml: vi.fn(), isBlankPlantUmlSource: vi.fn(() => false), getCachedSettings: vi.fn(), store: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('../../../render/mermaid', () => ({ renderMermaid })); vi.mock('../../../render/plantuml', () => ({ renderPlantUml })); vi.mock('../../../render/plantuml-lazy', () => ({ isBlankPlantUmlSource })); vi.mock('../../../infra/storage', () => ({ getCachedSettings })); vi.mock('../../../infra/store', () => ({ store })); vi.mock('../../../ui/mermaid-context-menu', () => ({ showMermaidContextMenu: vi.fn() })); vi.mock('../../state', () => ({ getMermaidExportBaseName: vi.fn(), getActiveDocPath: vi.fn(() => null), assetToOriginalMap: new Map() }));
import { BlockImage, CustomLink, MarkdownSafeTable, SafeHardBreak, SafeParagraph, escapeParagraphMarkdown, MathBlock, mermaidCodeBlockExtension, renderFencedCodeBlock } from '..';
import { createMarkdownExtension, markflowMarked } from '../../init';

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
        hardBreak: false,
        link: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
      }),
      SafeParagraph,
      SafeHardBreak,
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
      MathBlock,
      createMarkdownExtension(),    ],
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

  it('maps soft and hard br tokens to distinct hardBreak representations', () => {
    const parse = SafeHardBreak.config.parseMarkdown!;
    expect(parse({ type: 'br', raw: '\n' } as never, {} as never)).toEqual({ type: 'hardBreak', attrs: { soft: true } });
    expect(parse({ type: 'br', raw: '  \n' } as never, {} as never)).toEqual({ type: 'hardBreak' });
    expect(parse({ type: 'br', raw: '\\\n' } as never, {} as never)).toEqual({ type: 'hardBreak' });
    expect(parse({ type: 'br', raw: '\n\n' } as never, {} as never)).toEqual({ type: 'hardBreak' });

    const render = SafeHardBreak.config.renderMarkdown!;
    expect(render({ attrs: { soft: true } } as never, {} as never, {} as never)).toBe('\n');
    expect(render({ attrs: {} } as never, {} as never, {} as never)).toBe('  \n');
    expect(render({ attrs: { soft: null } } as never, {} as never, {} as never)).toBe('  \n');
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
    it('escapes line-leading block prefixes on single-line paragraphs', () => {
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

    // #417: `$$` lines that stay paragraph text (mid-line formula, or an empty
    // `$$` pair the mathBlock tokenizer handed back) must not gain escapes.
    it('leaves $$ formula lines untouched', () => {
      expect(escapeParagraphMarkdown('$$\n\\begin{align}\n  a &= b \\\\\n\\end{align}\n$$'))
        .toBe('$$\n\\begin{align}\n  a &= b \\\\\n\\end{align}\n$$');
      expect(escapeParagraphMarkdown('text $$a$$ tail')).toBe('text $$a$$ tail');
      expect(escapeParagraphMarkdown('$$\n$$')).toBe('$$\n$$');
    });

    it('escapes block prefixes on every line — continuation lines included (#404)', () => {
      expect(escapeParagraphMarkdown('6. first\n- second\n# third')).toBe('6\\. first\n\\- second\n\\# third');
      // Soft-break continuation lines typed as block prefixes must survive
      // re-parse as paragraph text, not become list/heading/HR blocks.
      expect(escapeParagraphMarkdown('正文\n1. x')).toBe('正文\n1\\. x');
      expect(escapeParagraphMarkdown('正文\n# x')).toBe('正文\n\\# x');
      expect(escapeParagraphMarkdown('正文\n- x')).toBe('正文\n\\- x');
      expect(escapeParagraphMarkdown('正文\n---')).toBe('正文\n\\---');
      // Hard-break (`  \n`) continuation lines share the same gap and fix.
      expect(escapeParagraphMarkdown('正文  \n1. x')).toBe('正文  \n1\\. x');
      // Non-triggering continuation lines stay intact.
      expect(escapeParagraphMarkdown('正文\nplain')).toBe('正文\nplain');
      expect(escapeParagraphMarkdown('正文\n6.x')).toBe('正文\n6.x');
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

  // issue #421: blockquote markers, fence openers, Setext `===` underlines and
  // HTML block openers can also interrupt a paragraph's lazy continuation, so
  // their line-leading spellings must be escaped like the #286 prefixes above.
  describe('escapeParagraphMarkdown — quote/fence/setext/html prefixes (issue #421)', () => {
    it('escapes line-leading blockquote markers including the spaceless form', () => {
      expect(escapeParagraphMarkdown('> 引用')).toBe('\\> 引用');
      expect(escapeParagraphMarkdown('>foo')).toBe('\\>foo');
      expect(escapeParagraphMarkdown('正文\n> 引用')).toBe('正文\n\\> 引用');
      // Mid-line '>' is prose, not a blockquote marker.
      expect(escapeParagraphMarkdown('a > b')).toBe('a > b');
    });

    it('escapes fence openers (3+ backticks or tildes) but not shorter runs', () => {
      expect(escapeParagraphMarkdown('```')).toBe('\\```');
      expect(escapeParagraphMarkdown('```js')).toBe('\\```js');
      expect(escapeParagraphMarkdown('~~~')).toBe('\\~~~');
      expect(escapeParagraphMarkdown('正文\n``` x')).toBe('正文\n\\``` x');
      expect(escapeParagraphMarkdown('正文\n~~~')).toBe('正文\n\\~~~');
      // Two backticks open no fence and stay literal.
      expect(escapeParagraphMarkdown('``code``')).toBe('``code``');
      expect(escapeParagraphMarkdown('正文\n`` x')).toBe('正文\n`` x');
    });

    it('escapes a Setext underline line only on continuation lines', () => {
      // A non-first full-line `===` underlines the preceding paragraph line.
      expect(escapeParagraphMarkdown('正文\n===')).toBe('正文\n\\===');
      expect(escapeParagraphMarkdown('正文\n======')).toBe('正文\n\\======');
      // A first line has nothing to underline: `===` is plain text.
      expect(escapeParagraphMarkdown('===')).toBe('===');
      expect(escapeParagraphMarkdown('==')).toBe('==');
      // `=` runs followed by content are not an underline.
      expect(escapeParagraphMarkdown('正文\n== x')).toBe('正文\n== x');
    });

    it('escapes HTML block opener forms but leaves prose angle brackets alone', () => {
      expect(escapeParagraphMarkdown('<div> x')).toBe('\\<div> x');
      expect(escapeParagraphMarkdown('正文\n<div>看起来像 HTML')).toBe('正文\n\\<div>看起来像 HTML');
      expect(escapeParagraphMarkdown('正文\n<!-- c -->')).toBe('正文\n\\<!-- c -->');
      expect(escapeParagraphMarkdown('正文\n<script>x')).toBe('正文\n\\<script>x');
      // Closing tags are type-6 openers too.
      expect(escapeParagraphMarkdown('正文\n</div> x')).toBe('正文\n\\</div> x');
      // Digits and processing instructions open no interrupting HTML block.
      expect(escapeParagraphMarkdown('a < b')).toBe('a < b');
      expect(escapeParagraphMarkdown('正文\n<3')).toBe('正文\n<3');
      expect(escapeParagraphMarkdown('正文\n<?php echo;')).toBe('正文\n<?php echo;');
    });

    it('escapes every new prefix in one multi-line paragraph', () => {
      expect(escapeParagraphMarkdown('正文\n1. x\n> y\n```\n===\n<div> z'))
        .toBe('正文\n1\\. x\n\\> y\n\\```\n\\===\n\\<div> z');
    });

    it('leaves already-escaped spellings untouched (no double escape)', () => {
      expect(escapeParagraphMarkdown('\\> foo')).toBe('\\> foo');
      expect(escapeParagraphMarkdown('\\===')).toBe('\\===');
      expect(escapeParagraphMarkdown('\\<div> x')).toBe('\\<div> x');
      expect(escapeParagraphMarkdown('\\``` foo')).toBe('\\``` foo');
    });
  });

  // issue #436: the Setext H2 underline ('-'/'--' whole line) and the
  // space-separated thematic break ('* * *' / '_ _ _' / '- - -') are two more
  // continuation shapes that re-parse into different blocks, and the bullet
  // rule must cover CommonMark's third marker character '*'. Same escape
  // guarantee as the #286/#421 prefixes above.
  describe('escapeParagraphMarkdown — setext-h2/spaced-hr/bullet-* prefixes (issue #436)', () => {
    it('escapes a Setext H2 underline line only on continuation lines', () => {
      // A non-first full-line '-'/'--' underlines the preceding line as an H2.
      expect(escapeParagraphMarkdown('正文\n--')).toBe('正文\n\\--');
      expect(escapeParagraphMarkdown('正文\n-')).toBe('正文\n\\-');
      // Trailing whitespace still forms an underline; '-' + space hits the
      // bullet rule first, which keeps the trailing spaces.
      expect(escapeParagraphMarkdown('正文\n-  ')).toBe('正文\n\\-  ');
      // Longer '-' runs are underlines too ('---' itself is pinned by the HR
      // rule above — same '\---' spelling either way).
      expect(escapeParagraphMarkdown('正文\n------')).toBe('正文\n\\------');
      // Hard-break continuation lines share the fix.
      expect(escapeParagraphMarkdown('正文  \n--')).toBe('正文  \n\\--');
      // A first line has nothing to underline: '-'/'--' stay plain text.
      expect(escapeParagraphMarkdown('--')).toBe('--');
      expect(escapeParagraphMarkdown('-')).toBe('-');
      // Mixed '=-' runs are not an underline (the alternation keeps runs
      // same-character); '=' runs followed by content stay untouched (#421).
      expect(escapeParagraphMarkdown('正文\n=-=')).toBe('正文\n=-=');
      expect(escapeParagraphMarkdown('正文\n== x')).toBe('正文\n== x');
    });

    it('escapes space-separated thematic break forms (first char only)', () => {
      // The same char repeated 3+ times, separated by 1-3 spaces, forms a
      // thematic break even though it is not a contiguous run.
      expect(escapeParagraphMarkdown('* * *')).toBe('\\* * *');
      expect(escapeParagraphMarkdown('_ _ _')).toBe('\\_ _ _');
      expect(escapeParagraphMarkdown('正文\n*  *  *')).toBe('正文\n\\*  *  *');
      // Trailing whitespace is part of the marker line; the rule's replacement
      // consumes it (same as the contiguous HR rule).
      expect(escapeParagraphMarkdown('正文\n_ _ _  ')).toBe('正文\n\\_ _ _');
      // First line also applies: the whole line IS the block marker.
      expect(escapeParagraphMarkdown('_ _ _')).toBe('\\_ _ _');
      // The '-'-led form is pinned by the bullet rule, which runs first.
      expect(escapeParagraphMarkdown('正文\n- - -')).toBe('正文\n\\- - -');
      // Mixed-character and two-char runs are not thematic breaks: '_' forms
      // stay literal (no rule hits them); '*' forms are list markers under
      // CommonMark and take the bullet escape instead.
      expect(escapeParagraphMarkdown('_ - _')).toBe('_ - _');
      expect(escapeParagraphMarkdown('_ _')).toBe('_ _');
      expect(escapeParagraphMarkdown('_ _ x')).toBe('_ _ x');
      expect(escapeParagraphMarkdown('* - *')).toBe('\\* - *');
      expect(escapeParagraphMarkdown('* *')).toBe('\\* *');
      expect(escapeParagraphMarkdown('* * x')).toBe('\\* * x');
    });

    it('escapes the CommonMark third bullet character (*) like - and +', () => {
      expect(escapeParagraphMarkdown('* foo')).toBe('\\* foo');
      expect(escapeParagraphMarkdown('正文\n* x')).toBe('正文\n\\* x');
      // No space after '*' — '*foo' is plain text, not a bullet.
      expect(escapeParagraphMarkdown('*foo')).toBe('*foo');
      expect(escapeParagraphMarkdown('正文\n*foo')).toBe('正文\n*foo');
    });

    it('escapes every #436 prefix in one multi-line paragraph', () => {
      expect(escapeParagraphMarkdown('正文\n--\n* * *\n_ _ _\n* foo'))
        .toBe('正文\n\\--\n\\* * *\n\\_ _ _\n\\* foo');
    });

    it('leaves already-escaped spellings untouched (no double escape)', () => {
      expect(escapeParagraphMarkdown('\\--')).toBe('\\--');
      expect(escapeParagraphMarkdown('正文\n\\-')).toBe('正文\n\\-');
      expect(escapeParagraphMarkdown('\\* * *')).toBe('\\* * *');
      expect(escapeParagraphMarkdown('\\_ _ _')).toBe('\\_ _ _');
      expect(escapeParagraphMarkdown('\\- - -')).toBe('\\- - -');
    });
  });

  // issue #438: 1-3 leading spaces do not defuse a block prefix (CommonMark
  // keeps the block start effective), so the escape must land AFTER the
  // indent — between the preserved indent bytes and the prefix. 4+ spaces or
  // a tab make the line a lazy continuation (no block start) and stay unescaped.
  describe('escapeParagraphMarkdown — indented block prefixes (issue #438)', () => {
    it('escapes indented prefixes after the indent, keeping the indent bytes', () => {
      expect(escapeParagraphMarkdown('正文\n  ---')).toBe('正文\n  \\---');
      expect(escapeParagraphMarkdown('正文\n   ===')).toBe('正文\n   \\===');
      expect(escapeParagraphMarkdown('正文\n  --')).toBe('正文\n  \\--');
      expect(escapeParagraphMarkdown('正文\n  - foo')).toBe('正文\n  \\- foo');
      expect(escapeParagraphMarkdown('正文\n  1. x')).toBe('正文\n  1\\. x');
      expect(escapeParagraphMarkdown('正文\n  # x')).toBe('正文\n  \\# x');
      expect(escapeParagraphMarkdown('正文\n > x')).toBe('正文\n \\> x');
      expect(escapeParagraphMarkdown('正文\n  <div> x')).toBe('正文\n  \\<div> x');
      expect(escapeParagraphMarkdown('正文\n  ``` x')).toBe('正文\n  \\``` x');
      expect(escapeParagraphMarkdown('正文\n  ~~~')).toBe('正文\n  \\~~~');
      // Rule order is unchanged by the indent: '*' rides the bullet rule first,
      // '_' rides the space-separated HR rule (same as the column-0 forms).
      expect(escapeParagraphMarkdown('正文\n  * * *')).toBe('正文\n  \\* * *');
      expect(escapeParagraphMarkdown('正文\n  _ _ _')).toBe('正文\n  \\_ _ _');
      // First lines take the prefix escapes too — the indent just rides along.
      expect(escapeParagraphMarkdown('  - foo')).toBe('  \\- foo');
      expect(escapeParagraphMarkdown('  ---')).toBe('  \\---');
      // Hard-break continuation lines share the fix.
      expect(escapeParagraphMarkdown('正文  \n  ---')).toBe('正文  \n  \\---');
    });

    it('leaves first-line indented setext underlines unescaped', () => {
      // A first line has no preceding line to underline — same rule as the
      // column-0 '--'/'===' first-line forms.
      expect(escapeParagraphMarkdown('  --')).toBe('  --');
      expect(escapeParagraphMarkdown('  ===')).toBe('  ===');
    });

    it('does not touch 4+ space or tab indents (lazy continuation)', () => {
      // 4+ spaces / a tab make the body start with whitespace: no rule hits,
      // and such lines must stay unescaped for authored byte-stability.
      expect(escapeParagraphMarkdown('正文\n    - foo')).toBe('正文\n    - foo');
      expect(escapeParagraphMarkdown('正文\n     # x')).toBe('正文\n     # x');
      expect(escapeParagraphMarkdown('正文\n\t- foo')).toBe('正文\n\t- foo');
    });

    it('does not double-escape already-escaped indented prefixes', () => {
      expect(escapeParagraphMarkdown('正文\n  \\- foo')).toBe('正文\n  \\- foo');
      expect(escapeParagraphMarkdown('正文\n  \\---')).toBe('正文\n  \\---');
    });

    it('leaves all-space and plain indented lines untouched', () => {
      expect(escapeParagraphMarkdown('正文\n  ')).toBe('正文\n  ');
      expect(escapeParagraphMarkdown('正文\n   ')).toBe('正文\n   ');
      expect(escapeParagraphMarkdown('正文\n    ')).toBe('正文\n    ');
      expect(escapeParagraphMarkdown('正文\n  bar')).toBe('正文\n  bar');
    });

    it('escapes every indented prefix line in one multi-line paragraph', () => {
      expect(escapeParagraphMarkdown('正文\n  ---\n  - foo\n   # x\n > 引用'))
        .toBe('正文\n  \\---\n  \\- foo\n   \\# x\n \\> 引用');
    });
  });
});
