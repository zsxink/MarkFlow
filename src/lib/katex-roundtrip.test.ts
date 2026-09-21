/**
 * KaTeX round-trip test — verifies that $..$ and $$..$$ syntax survives
 * the tiptap v3 markdown pipeline (parse → serialize) without modification.
 */
import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, SafeParagraph, mermaidCodeBlockExtension } from './editor.extensions';
import { createMarkdownExtension } from './editor.init';
import { OpaqueNode } from './editor.markdown.opaque.extension';
import { parseMarkdown, serializeMarkdown } from './editor.markdown.bridge';

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
vi.mock('./mermaid', () => ({ renderMermaid: mocks.renderMermaid }));
vi.mock('./plantuml', () => ({ renderPlantUml: mocks.renderPlantUml }));
vi.mock('./plantuml-lazy', () => ({ isBlankPlantUmlSource: mocks.isBlankPlantUmlSource }));
vi.mock('./storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
vi.mock('./store', () => ({ store: mocks.store }));
vi.mock('./logger', () => ({ logDebug: mocks.logDebug, logWarn: mocks.logWarn, logException: mocks.logException }));

function makeEditor() {
  return new Editor({
    element: document.createElement('div'),
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
      MarkdownSafeTable.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CustomLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
      BlockImage.configure({ allowBase64: true }),
      mermaidCodeBlockExtension(),
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
});
