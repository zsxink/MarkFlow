import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Marked } from 'marked';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import CodeBlock from '@tiptap/extension-code-block';
import HardBreak from '@tiptap/extension-hard-break';
import { BulletList, ListItem, ListKeymap, OrderedList } from '@tiptap/extension-list';
import { WYSIWYG_ROUNDTRIP_FIXTURES } from './wysiwyg-roundtrip.fixtures';
import { BlockImage, CustomLink, MarkdownSafeTable, mermaidCodeBlockExtension } from './editor.extensions';

/** Machine-readable corpus evidence, useful to CI/reporting consumers. */
export const TIPTAP_V3_CORPUS_RESULTS: Array<{
  id: string;
  category: string;
  status: 'supported' | 'invalid';
  roundTrip: 'pass' | 'fail' | 'classified';
  output?: string;
  errorCode?: string;
}> = [];

function createEditor(marked?: Marked) {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ codeBlock: false, hardBreak: false, link: false }),
      HardBreak,
      CodeBlock,
      TaskList,
      TaskItem,
      Table,
      TableRow,
      TableCell,
      TableHeader,
      Link,
      Image,
      Markdown.configure({ marked: marked as never, markedOptions: { gfm: true } }),
    ],
  });
}

function createAppLikeEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
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
      Markdown.configure({ markedOptions: { gfm: true, breaks: false } }),
    ],
  });
}

function canonicalizeDoc(doc: ReturnType<Editor['getJSON']>, category: string) {
  const copy = JSON.parse(JSON.stringify(doc));
  while (copy.content?.at(-1)?.type === 'paragraph' && !copy.content.at(-1).content) copy.content.pop();
  if (category === 'nested-list') {
    const normalize = (node: any) => {
      if (typeof node.text === 'string') node.text = node.text.replace(/\n[ \t]+/g, '\n');
      node.content?.forEach(normalize);
    };
    normalize(copy);
  }
  return copy;
}

describe('TipTap v3 Markdown migration spike', () => {
  it('uses an injected Marked instance and supports a custom tokenizer', () => {
    const marked = new Marked({ gfm: true });
    const customType = `spike-token-${Date.now()}`;
    marked.use({ extensions: [{ name: customType, level: 'block', start: () => 0, tokenizer(src: string) {
      const match = src.match(/^::spike\[(.*?)\]\n?/);
      return match ? { type: customType, raw: match[0], text: match[1] } : undefined;
    }, renderer(token: any) { return `<p>${token.text}</p>`; } }] });
    const editor = createEditor(marked);
    expect(editor.markdown?.instance).toBe(marked);
    expect(marked.parse('::spike[ok]')).toContain('ok');
    editor.destroy();
  });

  it.each([
    ['soft break', 'one\ntwo', 'one\ntwo'],
    ['hard break', 'one  \ntwo', 'one  \ntwo'],
    ['list continuation', '- one\n\n  continued', '- one\n\n  continued\n\n'],
    ['task list', '- [x] done\n- [ ] todo', '- [x] done\n- [ ] todo\n\n'],
    ['GFM table', '| A | B |\n| --- | --- |\n| 1 | 2 |', '\n| A   | B   |\n| --- | --- |\n| 1   | 2   |\n\n\n'],
  ] as const)('round-trips %s through the official parser/renderer', (_name, source, expected) => {
    const editor = createEditor();
    editor.commands.setContent(source, { contentType: 'markdown' });
    expect(editor.getMarkdown()).toBe(expected);
    editor.destroy();
  });

  it('parses and renders official Link, Image, and CodeBlock extensions', () => {
    const editor = createEditor();
    editor.commands.setContent('[link](https://example.com)\n\n![alt](image.png)\n\n```mermaid\ngraph TD\n```', { contentType: 'markdown' });
    const json = editor.getJSON();
    expect(JSON.stringify(json)).toContain('https://example.com');
    expect(JSON.stringify(json)).toContain('image.png');
    expect(JSON.stringify(json)).toContain('mermaid');
    expect(editor.getMarkdown()).toContain('[link](https://example.com)');
    expect(editor.getMarkdown()).toContain('![alt](image.png)');
    expect(editor.getMarkdown()).toContain('```mermaid');
    editor.destroy();
  });

  it('can register a custom code-block node view without affecting Markdown parsing', () => {
    const Diagram = CodeBlock.extend({ addNodeView() { return () => ({ dom: document.createElement('div') }); } });
    const editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit.configure({ codeBlock: false }), Diagram, Markdown] });
    editor.commands.setContent('```plantuml\n@startuml\nAlice -> Bob\n@enduml\n```', { contentType: 'markdown' });
    expect(editor.getJSON().content?.[0]?.type).toBe('codeBlock');
    expect(editor.getMarkdown()).toContain('```plantuml');
    editor.destroy();
  });

  it('does not allow StarterKit to register duplicate built-in extensions', () => {
    expect(() => createEditor()).not.toThrow();
    expect(() => new Editor({ element: document.createElement('div'), extensions: [StarterKit, StarterKit, Markdown] })).toThrow();
  });

  it('runs the complete app-like editor corpus and records normalized output', () => {
    TIPTAP_V3_CORPUS_RESULTS.length = 0;
    const knownV3Failures = new Set<string>();
    for (const fixture of WYSIWYG_ROUNDTRIP_FIXTURES) {
      const editor = createAppLikeEditor();
      let output: string | undefined;
      try {
        editor.commands.setContent(fixture.markdown, { contentType: 'markdown' });
        output = editor.getMarkdown();
        if (fixture.category === 'invalid') {
          TIPTAP_V3_CORPUS_RESULTS.push({ id: fixture.id, category: fixture.category, status: 'invalid', roundTrip: 'classified', output });
          continue;
        }
        const first = editor.getJSON();
        editor.commands.setContent(output, { contentType: 'markdown' });
        expect(canonicalizeDoc(editor.getJSON(), fixture.category)).toEqual(canonicalizeDoc(first, fixture.category));
        TIPTAP_V3_CORPUS_RESULTS.push({ id: fixture.id, category: fixture.category, status: 'supported', roundTrip: 'pass', output });
      } catch (error) {
        TIPTAP_V3_CORPUS_RESULTS.push({ id: fixture.id, category: fixture.category, status: fixture.category === 'invalid' ? 'invalid' : 'supported', roundTrip: fixture.category === 'invalid' ? 'classified' : 'fail', output, errorCode: error instanceof Error ? error.name : typeof error });
        if (fixture.category !== 'invalid' && !knownV3Failures.has(fixture.id)) throw error;
      } finally {
        editor.destroy();
      }
    }
    expect(TIPTAP_V3_CORPUS_RESULTS).toHaveLength(WYSIWYG_ROUNDTRIP_FIXTURES.length);
    expect(TIPTAP_V3_CORPUS_RESULTS.filter(result => result.roundTrip === 'fail').map(result => result.id)).toEqual([...knownV3Failures]);
    expect(TIPTAP_V3_CORPUS_RESULTS.filter(result => result.status === 'invalid')).toHaveLength(2);
  });
});
