import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Fragment, Slice } from '@tiptap/pm/model';
import type { Slice as SliceType } from '@tiptap/pm/model';
import { SafeHardBreak, SafeParagraph, mermaidCodeBlockExtension } from '../extensions';
import { createMarkdownExtension } from '../init';
import { softBreakPasteKey, softBreakPastePlugin } from '../paste-softbreak';

/**
 * Issue #404 task 3.2 — pasted multi-line plain text must enter the document
 * the same way the markdown parse path represents it: `hardBreak{soft:true}`
 * nodes, not `\n` embedded in text nodes (which collapse visually on render).
 */
describe('softBreakPastePlugin (#404)', () => {
  function makeEditor() {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ paragraph: false, codeBlock: false, hardBreak: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
        SafeHardBreak, SafeParagraph,
        mermaidCodeBlockExtension(),
        softBreakPastePlugin(),
        createMarkdownExtension(),
      ],
    });
    const plugin = softBreakPasteKey.get(editor.state);
    if (!plugin) throw new Error('softBreakPastePlugin not registered');
    const transformPasted = plugin.props.transformPasted!;
    const transform = (slice: SliceType) => transformPasted.call(plugin, slice, editor.view, true);
    return { editor, transform };
  }

  it('splits pasted plain-text newlines into soft hardBreak nodes and serializes back to bare \\n', () => {
    const { editor, transform } = makeEditor();
    const { schema } = editor.state;
    // What ProseMirror's plain-text clipboard parser produces: one paragraph
    // with the newlines embedded in a single text node.
    const pasted = new Slice(
      Fragment.from(schema.node('paragraph', null, schema.text('第一行\n第二行\n第三行'))),
      1,
      1,
    );
    const transformed = transform(pasted);
    const para = transformed.content.firstChild!;
    expect(para.childCount).toBe(5);
    expect(para.child(0).text).toBe('第一行');
    expect(para.child(1).type.name).toBe('hardBreak');
    expect(para.child(1).attrs.soft).toBe(true);
    expect(para.child(3).attrs.soft).toBe(true);
    // Inserting the normalized slice keeps the bare-newline spelling on save.
    editor.view.dispatch(editor.state.tr.replaceSelection(transformed));
    expect(editor.getMarkdown()).toBe('第一行\n第二行\n第三行');
    editor.destroy();
  });

  it('is idempotent — already-normalized content passes through untouched', () => {
    const { editor, transform } = makeEditor();
    const { schema } = editor.state;
    const normalized = new Slice(
      Fragment.from(schema.node('paragraph', null, [
        schema.text('a'),
        schema.nodes.hardBreak.create({ soft: true }),
        schema.text('b'),
      ])),
      1,
      1,
    );
    expect(transform(normalized)).toBe(normalized);
    editor.destroy();
  });

  it('keeps inline-code newlines literal (code spans are source text)', () => {
    const { editor, transform } = makeEditor();
    const { schema } = editor.state;
    const codeMark = schema.marks.code.create();
    const pasted = new Slice(
      Fragment.from(schema.node('paragraph', null, schema.text('a\nb', [codeMark]))),
      1,
      1,
    );
    expect(transform(pasted)).toBe(pasted);
    editor.destroy();
  });

  it('keeps code-block content untouched (raw source newlines)', () => {
    const { editor, transform } = makeEditor();
    const { schema } = editor.state;
    const pasted = new Slice(
      Fragment.from(schema.nodes.codeBlock.create(null, schema.text('let a\nlet b'))),
      0,
      0,
    );
    expect(transform(pasted)).toBe(pasted);
    editor.destroy();
  });

  it('preserves marks on the text runs around the inserted break', () => {
    const { editor, transform } = makeEditor();
    const { schema } = editor.state;
    const bold = schema.marks.bold.create();
    const pasted = new Slice(
      Fragment.from(schema.node('paragraph', null, schema.text('bold one\nbold two', [bold]))),
      1,
      1,
    );
    const para = transform(pasted).content.firstChild!;
    expect(para.child(0).text).toBe('bold one');
    expect(para.child(0).marks.map((m) => m.type.name)).toContain('bold');
    expect(para.child(1).type.name).toBe('hardBreak');
    expect(para.child(2).text).toBe('bold two');
    expect(para.child(2).marks.map((m) => m.type.name)).toContain('bold');
    editor.destroy();
  });
});
