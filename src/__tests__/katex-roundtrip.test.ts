/**
 * KaTeX round-trip test — verifies that $..$ and $$..$$ syntax survives
 * the tiptap v3 markdown pipeline (parse → serialize) without modification.
 */
import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, SafeHardBreak, SafeParagraph, MathBlock, mermaidCodeBlockExtension } from '../editor/extensions';
import { createMarkdownExtension } from '../editor/init';
import { OpaqueNode } from '../editor/markdown/opaque/extension';
import { parseMarkdown, serializeMarkdown } from '../editor/markdown/bridge';

const mocks = vi.hoisted(() => ({
  renderMermaid: vi.fn(),
  renderPlantUml: vi.fn(),
  isBlankPlantUmlSource: vi.fn(() => false),
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  store: { on: vi.fn(), off: vi.fn(), setState: vi.fn(), emit: vi.fn() },
  logDebug: vi.fn(),
  logWarn: vi.fn(),
  logException: vi.fn(),
}));
vi.mock('../render/mermaid', () => ({ renderMermaid: mocks.renderMermaid }));
vi.mock('../render/plantuml', () => ({ renderPlantUml: mocks.renderPlantUml }));
vi.mock('../render/plantuml-lazy', () => ({ isBlankPlantUmlSource: mocks.isBlankPlantUmlSource }));
vi.mock('../infra/storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
vi.mock('../infra/store', () => ({ store: mocks.store }));
vi.mock('../infra/logger', () => ({ logDebug: mocks.logDebug, logWarn: mocks.logWarn, logException: mocks.logException }));

function makeEditor() {
  return new Editor({
    element: document.createElement('div'),
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
      MarkdownSafeTable.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CustomLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
      BlockImage.configure({ allowBase64: true }),
      mermaidCodeBlockExtension(),
      MathBlock,
      OpaqueNode,
      createMarkdownExtension(),
    ],
  });
}

describe('KaTeX markdown round-trip', () => {
  it('inline $E=mc^2$ survives parse → serialize', () => {
    const editor = makeEditor();
    const source = 'This is $E=mc^2$ inline math.';
    parseMarkdown(editor, source);
    const result = serializeMarkdown(editor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.markdown).toContain('$E=mc^2$');
      expect(result.markdown.trim()).toBe(source);
    }
    editor.destroy();
  });

  it('block $$\\frac{a}{b}$$ survives parse → serialize', () => {
    const editor = makeEditor();
    const source = '$$\\frac{a}{b}$$';
    parseMarkdown(editor, source);
    const result = serializeMarkdown(editor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The serializer may escape backslashes, so check the formula structure is intact
      expect(result.markdown).toContain('$$');
      expect(result.markdown).toContain('\\frac');
    }
    editor.destroy();
  });

  it('block formula with newlines survives', () => {
    const editor = makeEditor();
    const source = '$$\n\\frac{a}{b}\n$$';
    parseMarkdown(editor, source);
    const result = serializeMarkdown(editor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.markdown).toContain('\\frac{a}{b}');
    }
    editor.destroy();
  });

  it('mixed formulas in paragraph survive', () => {
    const editor = makeEditor();
    const source = 'Line with $a+b$ and $\\alpha$ and $$x^2$$ end.';
    parseMarkdown(editor, source);
    const result = serializeMarkdown(editor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Check formula delimiters are preserved
      expect(result.markdown).toContain('$a+b$');
      expect(result.markdown).toContain('$$x^2$$');
      // Alpha may have escaped backslash
      expect(result.markdown).toMatch(/\$.*alpha.*\$/);
    }
    editor.destroy();
  });

  it('currency $100 passes through unchanged', () => {
    const editor = makeEditor();
    const source = 'Price is $100';
    parseMarkdown(editor, source);
    const result = serializeMarkdown(editor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.markdown.trim()).toBe(source);
    }
    editor.destroy();
  });

  it('formulas mixed with markdown formatting survive', () => {
    const editor = makeEditor();
    const source = '**Bold $E=mc^2$** and _italic $x^2$_ and `code`.';
    parseMarkdown(editor, source);
    const result = serializeMarkdown(editor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.markdown).toContain('$E=mc^2$');
      expect(result.markdown).toContain('$x^2$');
    }
    editor.destroy();
  });

  it('keeps double-dollar math inline inside task list text across round-trip', () => {
    const editor = makeEditor();
    const source = '- [ ] 含 $$a=c$$ 数学公式\n';
    parseMarkdown(editor, source);
    const first = serializeMarkdown(editor);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.markdown).toContain('$$a=c$$');
      parseMarkdown(editor, first.markdown);
      const second = serializeMarkdown(editor);
      expect(second.ok).toBe(true);
      if (second.ok) expect(second.markdown).toBe(first.markdown);
    }
    editor.destroy();
  });
});

describe('cross-line block formula round-trip (#417)', () => {
  const ALIGN_LATEX = '\\begin{align}\n  a &= b + c \\\\\n  d &= e + f\n\\end{align}';
  const ALIGN_DOC = `$$\n${ALIGN_LATEX}\n$$`;

  it('parses a line-leading cross-line $$ block into a mathBlock node with verbatim latex', () => {
    const editor = makeEditor();
    const parsed = parseMarkdown(editor, ALIGN_DOC);
    expect(parsed.ok).toBe(true);
    const json = editor.getJSON();
    const block = (json.content ?? []).find((node) => node.type === 'mathBlock');
    expect(block).toBeDefined();
    // Byte-level: `\\` stays double, `&` stays bare, indent and newlines intact.
    expect(block?.attrs?.latex).toBe(ALIGN_LATEX);
    editor.destroy();
  });

  it('serializes byte-identically and is idempotent on a second parse', () => {
    const editor = makeEditor();
    parseMarkdown(editor, ALIGN_DOC);
    const first = serializeMarkdown(editor);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // The editor path appends the same trailing blank line every block node
    // gets (cf. '# hi\\n' → '# hi\\n\\n'); the latex itself is byte-exact.
    expect(first.markdown).toBe(`${ALIGN_DOC}\n\n`);
    parseMarkdown(editor, first.markdown);
    const second = serializeMarkdown(editor);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.markdown).toBe(`${ALIGN_DOC}\n\n`);
    editor.destroy();
  });

  it('keeps latex verbatim when unrelated neighbouring content is serialized', () => {
    const editor = makeEditor();
    const source = `${ALIGN_DOC}\n\n前文段落\n`;
    parseMarkdown(editor, source);
    const result = serializeMarkdown(editor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toBe(`${ALIGN_DOC}\n\n前文段落`);
    expect(result.markdown).not.toContain('&amp;');
    expect(result.markdown).not.toContain('\\\\begin');
    editor.destroy();
  });

  it('normalizes delimiter spelling once to the canonical form', () => {
    const editor = makeEditor();
    parseMarkdown(editor, '$$ x $$\n');
    const once = serializeMarkdown(editor);
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    expect(once.markdown).toBe('$$x$$\n\n');
    parseMarkdown(editor, once.markdown);
    const twice = serializeMarkdown(editor);
    expect(twice.ok && twice.markdown).toBe('$$x$$\n\n');
    editor.destroy();
  });
});
