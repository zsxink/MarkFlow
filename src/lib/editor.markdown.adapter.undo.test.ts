import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, SafeParagraph, mermaidCodeBlockExtension } from './editor.extensions';
import { createMarkdownExtension } from './editor.init';
import { OpaqueNode } from './editor.markdown.opaque.extension';
import { tablePlugin } from './editor.table';
import { TableHandleView } from './editor.table-handles';
import { parseTipTapMarkdown } from './editor.markdown.adapter';

function childTypes(ed: Editor): string[] {
  return (ed.getJSON().content as Array<{ type: string }>).map((c) => c.type);
}

/** The EXACT extension set initEditor uses (minus async plugins), to mirror production. */
function appEditor(): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
      SafeParagraph,
      Placeholder.configure({ placeholder: '开始写作 — 输入即所得' }),
      BulletList, OrderedList, ListItem, ListKeymap,
      TaskList, TaskItem.configure({ nested: true }),
      MarkdownSafeTable.configure({ resizable: true, View: TableHandleView }),
      TableRow, TableCell, TableHeader,
      CustomLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
      BlockImage.configure({ allowBase64: true }),
      mermaidCodeBlockExtension(),
      OpaqueNode,
      createMarkdownExtension(),
      tablePlugin(),
    ],
  });
}

describe('load does not enter undo history (production stack)', () => {
  it('a single undo after parseTipTapMarkdown load keeps the document intact', () => {
    const e = appEditor();
    const r = parseTipTapMarkdown(e, '# Title\n\nbody\n\n');
    expect(r.ok).toBe(true);
    expect(childTypes(e)).toEqual(['heading', 'paragraph', 'paragraph']);
    // The user opens a file (no edit) and presses Cmd+Z once. The load must
    // not be undoable, so the document stays intact.
    e.commands.undo();
    expect(childTypes(e)).toEqual(['heading', 'paragraph', 'paragraph']);
    expect((e as unknown as { getMarkdown(): string }).getMarkdown()).toBe('# Title\n\nbody\n\n');
    e.destroy();
  });

  it('a real edit stays undoable without reverting past the load', () => {
    const e = appEditor();
    void parseTipTapMarkdown(e, '# Title\n\nbody\n\n');

    // Real user edit: append a char to the "body" paragraph.
    let bodyEnd = -1;
    e.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === 'body' && bodyEnd === -1) {
        bodyEnd = pos + node.nodeSize - 1;
      }
      return true;
    });
    e.commands.insertContentAt(bodyEnd, 'X');
    expect((e as unknown as { getMarkdown(): string }).getMarkdown()).toBe('# Title\n\nbodyX\n\n');

    // One undo must revert ONLY the edit, not the load: the document still
    // holds the loaded content (undoing the load is exactly the reported bug).
    e.commands.undo();
    expect(childTypes(e)).toEqual(['heading', 'paragraph', 'paragraph']);
    expect((e as unknown as { getMarkdown(): string }).getMarkdown()).toBe('# Title\n\nbody\n\n');
    e.destroy();
  });
});