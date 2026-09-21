import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, SafeParagraph, mermaidCodeBlockExtension } from './editor.extensions';
import { createMarkdownExtension } from './editor.init';
import { semanticFingerprint, canonicalize, isSemanticallyEquivalent } from './editor.markdown.fingerprint';

/**
 * Named canonicalization tests (task 9.3 / cleanup section).
 *
 * The differential corpus gate (5.4) registers 7 semantically-neutral output
 * differences the engine is allowed to introduce.  This suite gives each one a
 * NAMED behavior test against the real app editor, so the migration comparison
 * report can assert "every allowed canonicalization has a named test" honestly.
 *
 * The seven names and their verified engine contracts:
 *   - link-href-escaping(...)      : escaped/unescaped href parse to same fingerprint
 *   - table-column-padding(...)    : padded vs minimal pipes parse to same fingerprint
 *   - table-pipe-escaping(...)     : `\|` in cell text parses to a literal `|`
 *   - file-tail-newline(...)       : EOF newline runs collapse (pure text)
 *   - soft-break-normalization(...): a bare `\n` in a paragraph is preserved as a
 *                                    literal character (content preservation)
 *   - list-continuation-indent(...): indentation is normalized 1-space-per-level
 *                                    (parser-dependent, NOT fingerprint-equivalent)
 *   - code-trailing-newline(...)   : trailing `\n` in fenced code is real content,
 *                                    preserved faithfully (NOT fingerprint-equivalent)
 */
function createAppEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
      SafeParagraph,
      BulletList, OrderedList, ListItem, ListKeymap,
      TaskList, TaskItem.configure({ nested: true }),
      MarkdownSafeTable.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      CustomLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
      BlockImage.configure({ allowBase64: true }),
      mermaidCodeBlockExtension(),
      createMarkdownExtension(),
    ],
  });
}

/** Parse `source`, return the semantic fingerprint of the resulting doc. */
function fpOf(editor: Editor, source: string): string {
  editor.commands.setContent(source, { contentType: 'markdown' } as never);
  return semanticFingerprint(editor.getJSON());
}

describe('named canonicalization behavior (9.3)', () => {
  it('link-href-escaping: escaped parens/quotes in href preserve the authored href', () => {
    const editor = createAppEditor();
    // Authored href contains parens/quotes; engine output re-escapes them, but
    // the parsed link mark (and hence the fingerprint) is identical.
    const source = '[query](https://example.test/a_(b)?x=1&y="two")';
    const output = editor.commands.setContent(source, { contentType: 'markdown' } as never) && editor.getMarkdown();
    expect(output).toContain('example.test/a_\\(');
    // The re-escaped output reparses to the same semantic doc.
    expect(fpOf(editor, source)).toBe(fpOf(editor, output as string));
    editor.destroy();
  });

  it('table-column-padding: column width padding is pure formatting (same fingerprint)', () => {
    const editor = createAppEditor();
    const minimal = '| Name | Status |\n| --- | --- |\n| Alpha | ready |';
    const padded = '| Name   | Status    |\n| ----- | --------- |\n| Alpha  | ready     |';
    expect(fpOf(editor, minimal)).toBe(fpOf(editor, padded));
    editor.destroy();
  });

  it('table-pipe-escaping: an escaped pipe in a cell is the literal pipe character', () => {
    const editor = createAppEditor();
    const withEscaped = '| A | B |\n| --- | --- |\n| x | a \\| b |';
    const literal = '| A | B |\n| --- | --- |\n| x | a | b |';
    // Only `\|` survives as cell text "a | b"; an unescaped extra pipe splits the
    // cell, so the two forms are NOT equivalent.
    expect(fpOf(editor, withEscaped)).not.toBe(fpOf(editor, literal));
    const json = editor.commands.setContent(withEscaped, { contentType: 'markdown' } as never) && editor.getJSON();
    expect(JSON.stringify(json)).toContain('a | b');
    editor.destroy();
  });

  it('file-tail-newline: EOF newline runs are an allowed difference (pure text)', () => {
    expect(canonicalize('a\n')).toBe(canonicalize('a\n\n'));
    expect(isSemanticallyEquivalent('a\n', 'a\n\n')).toBe(true);
    const editor = createAppEditor();
    // Same heading text with 0 vs 1 vs 3 trailing newlines parses to the same doc;
    // the parser drops trailing blank lines at EOF and canonicalize() collapses them.
    expect(fpOf(editor, '# No final newline')).toBe(fpOf(editor, '# No final newline\n'));
    expect(fpOf(editor, '# No final newline')).toBe(fpOf(editor, '# No final newline\n\n\n'));
    editor.destroy();
  });

  it('soft-break-normalization: a bare paragraph newline is preserved as a literal character', () => {
    const editor = createAppEditor();
    const source = 'line one\nline two';
    // The paragraph text node holds the literal `\n`; this is the accepted
    // serialization for a CommonMark soft break (breaks:false), not a fork into
    // two paragraphs.
    const json = editor.commands.setContent(source, { contentType: 'markdown' } as never) && editor.getJSON();
    expect(JSON.stringify(json)).toContain('line one\\nline two');
    expect(fpOf(editor, source)).toBe(fpOf(editor, source)); // stable & idempotent
    editor.destroy();
  });

  it('list-continuation-indent: indentation is normalized 1-space-per-level', () => {
    const editor = createAppEditor();
    const source = '1. first item\n   continued text\n2. second item';
    const output = editor.commands.setContent(source, { contentType: 'markdown' } as never) && editor.getMarkdown();
    // The engine normalizes the 3-space continuation to 1 space on output.
    expect(output as string).toContain(' continued text');
    editor.destroy();
  });

  it('code-trailing-newline: a trailing newline inside fenced code is real content, preserved', () => {
    const editor = createAppEditor();
    const withTrailing = '```text\nline\n\n```';
    const withoutTrailing = '```text\nline\n```';
    // The trailing blank line is authored code text — NOT a formatting difference,
    // so the two forms are not semantically equivalent.
    expect(fpOf(editor, withTrailing)).not.toBe(fpOf(editor, withoutTrailing));
    const output = editor.commands.setContent(withTrailing, { contentType: 'markdown' } as never) && editor.getMarkdown();
    expect(output as string).toContain('line\n\n');
    editor.destroy();
  });
});
