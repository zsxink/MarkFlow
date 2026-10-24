import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, SafeParagraph, mermaidCodeBlockExtension } from '../../extensions';
import { createMarkdownExtension } from '../../init';
import { OpaqueNode } from '../opaque/extension';
import { RawMarkdown } from '../fallback';
import { verifySingleBlockUpgrade } from '../single-block-upgrade';

function makeEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
      SafeParagraph, BulletList, OrderedList, ListItem, ListKeymap,
      TaskList, TaskItem.configure({ nested: true }),
      MarkdownSafeTable.configure({ resizable: true }), TableRow, TableCell, TableHeader,
      CustomLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
      BlockImage.configure({ allowBase64: true }), mermaidCodeBlockExtension(), OpaqueNode,
      RawMarkdown, createMarkdownExtension(),
    ],
  });
}

describe('verifySingleBlockUpgrade', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('proves a repaired table upgradeable with table blocks', () => {
    const editor = makeEditor();
    const result = verifySingleBlockUpgrade(editor, '| A | B |\n| --- | --- |\n| 1 | 2 |\n');
    expect(result.upgradeable).toBe(true);
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.blocks.some((block) => block.type === 'table')).toBe(true);
    editor.destroy();
  });

  it('keeps a malformed table literal (not upgradeable)', () => {
    const editor = makeEditor();
    const result = verifySingleBlockUpgrade(editor, '| A | B |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n');
    expect(result.upgradeable).toBe(false);
    expect(result.blocks).toEqual([]);
    editor.destroy();
  });

  it('keeps reference definitions literal', () => {
    const editor = makeEditor();
    const result = verifySingleBlockUpgrade(editor, '[ref]: /u\n');
    expect(result.upgradeable).toBe(false);
    editor.destroy();
  });

  it('returns every parsed block when the source holds several', () => {
    const editor = makeEditor();
    const result = verifySingleBlockUpgrade(editor, '# Title\n\n| A | B |\n| --- | --- |\n');
    expect(result.upgradeable).toBe(true);
    expect(result.blocks.some((block) => block.type === 'heading')).toBe(true);
    expect(result.blocks.some((block) => block.type === 'table')).toBe(true);
    editor.destroy();
  });

  it('proves a plain paragraph upgradeable', () => {
    const editor = makeEditor();
    const result = verifySingleBlockUpgrade(editor, 'just text');
    expect(result.upgradeable).toBe(true);
    expect(result.blocks).toEqual([expect.objectContaining({ type: 'paragraph' })]);
    editor.destroy();
  });
});
