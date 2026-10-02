import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, SafeParagraph, mermaidCodeBlockExtension } from './editor.extensions';
import { createMarkdownExtension } from './editor.init';
import { OpaqueNode } from './editor.markdown.opaque.extension';
import { semanticFingerprint } from './editor.markdown.fingerprint';
import { decideAdmission } from './editor.markdown.admission';
import { endOpaqueSession, getOpaqueRegistry } from './editor.markdown.opaque.session';
import { reconcileSave } from './editor.markdown.opaque.integration';
import { parseTipTapMarkdownToDoc } from './editor.markdown.adapter';

function createEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
      SafeParagraph, BulletList, OrderedList, ListItem, ListKeymap,
      TaskList, TaskItem.configure({ nested: true }),
      MarkdownSafeTable.configure({ resizable: true }), TableRow, TableCell, TableHeader,
      CustomLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
      BlockImage.configure({ allowBase64: true }), mermaidCodeBlockExtension(), OpaqueNode,
      createMarkdownExtension(),
    ],
  });
}

afterEach(endOpaqueSession);

describe('lossless inline code Markdown serialization', () => {
  it.each([
    'Use `` Ctrl+` `` here.',
    'Use ``a`b`` here.',
    '**``Ctrl+` ``**',
    '**`# `**',
    'A **bold `code` and text** end.',
    '[``Ctrl+` ``](https://example.test)',
    'Use `&amp; <T> [x] *text*` here.',
    'Use ```a``b``` here.',
    'Use `# ` here.',
    'Use ` leading` here.',
    'Use `  two spaces  ` here.',
    'Use `   ` here.',
    '| Shortcut | Action |\n| --- | --- |\n| `` Ctrl+` `` | Inline code |',
  ])('keeps code characters and code marks: %s', source => {
    const editor = createEditor();
    try {
      editor.commands.setContent(source, { contentType: 'markdown', emitUpdate: false });
      const fingerprint = semanticFingerprint(editor.getJSON());
      const serialized = editor.getMarkdown();
      const reparsed = parseTipTapMarkdownToDoc(editor, serialized);
      expect(reparsed.ok).toBe(true);
      if (reparsed.ok) expect(semanticFingerprint(reparsed.doc)).toBe(fingerprint);
    } finally { editor.destroy(); }
  });

  it('admits the actual English README and saves a real WYSIWYG edit', () => {
    const editor = createEditor();
    try {
      const source = readFileSync('README.en.md', 'utf8');
      const admission = decideAdmission(editor, source, { sourceRevision: 1, userRevisionAtAdmission: 0 });
      expect(admission.mode).toBe('reconcile');
      expect(admission.session).toBeDefined();
      if (!admission.session) return;
      const codeText: string[] = [];
      editor.state.doc.descendants(node => {
        if (node.isText && node.marks.some(mark => mark.type.name === 'code')) codeText.push(node.text!);
      });
      expect(codeText).toContain('Ctrl+`');
      editor.commands.insertContentAt(1, 'Edited ');
      const saved = reconcileSave(editor, {
        session: admission.session,
        registry: getOpaqueRegistry(),
        currentSourceRevision: 1,
        currentUserRevision: 1,
      });
      expect(saved.outcome.verdict).toBe('safe-edit');
      if (saved.outcome.verdict === 'safe-edit') expect(saved.outcome.markdown).toContain('Edited MarkFlow');
    } finally { editor.destroy(); }
  });
});
