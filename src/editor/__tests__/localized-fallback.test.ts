import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, SafeHardBreak, SafeParagraph, mermaidCodeBlockExtension } from '../extensions';
import { createMarkdownExtension } from '../init';
import { RawMarkdown, verifyRawMarkdownSplice } from '../markdown/fallback';
import { OpaqueNode } from '../markdown/opaque/extension';
import { getOpaqueRegistry, endOpaqueSession } from '../markdown/opaque/session';
import { decideAdmission } from '../markdown/admission';
import { reconcileSave } from '../markdown/opaque/integration';
import { semanticFingerprint } from '../markdown/fingerprint';

/**
 * The localized fallback session proves a save candidate by semantics. That
 * proof is only worth anything if it is taken over the very bytes that get
 * written: reopening the saved Markdown MUST reproduce the editor state the
 * user was looking at. A raw literal block whose authored separator was
 * collapsed (or inflated) on the way out silently rewrites authored whitespace,
 * which is exactly what the reconcile boundary exists to prevent.
 */
describe('localized fallback save proof (issue #291)', () => {
  afterEach(() => {
    endOpaqueSession();
  });

  function makeEditor() {
    return new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ paragraph: false, codeBlock: false, hardBreak: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
        SafeHardBreak, SafeParagraph, BulletList, OrderedList, ListItem, ListKeymap,
        TaskList, TaskItem.configure({ nested: true }),
        MarkdownSafeTable.configure({ resizable: true }), TableRow, TableCell, TableHeader,
        CustomLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
        BlockImage.configure({ allowBase64: true }), mermaidCodeBlockExtension(), OpaqueNode,
        RawMarkdown, createMarkdownExtension(),
      ],
    });
  }

  function collectRaw(doc: { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }): string[] {
    const out: string[] = [];
    if (doc.type === 'markflowRawMarkdown' && doc.attrs) out.push(String(doc.attrs.source));
    for (const child of (doc.content ?? []) as typeof doc[]) out.push(...collectRaw(child));
    return out;
  }

  /** Admit, edit, save, then reopen the written bytes on a fresh editor. */
  function saveAndReopen(source: string) {
    const editor = makeEditor();
    const admission = decideAdmission(editor, source, { sourceRevision: 1, userRevisionAtAdmission: 0 });
    expect(admission.session).not.toBeNull();
    if (!admission.session) return null;

    editor.commands.insertContentAt(editor.state.doc.content.size - 1, 'X');
    const saved = reconcileSave(editor, {
      session: admission.session,
      registry: getOpaqueRegistry(),
      currentSourceRevision: 1,
      currentUserRevision: 1,
    });
    expect(saved.outcome.verdict).toBe('safe-edit');
    if (saved.outcome.verdict !== 'safe-edit') return null;

    const fresh = makeEditor();
    decideAdmission(fresh, saved.outcome.markdown, { sourceRevision: 1, userRevisionAtAdmission: 0 });
    const result = {
      markdown: saved.outcome.markdown,
      reopenedFingerprint: semanticFingerprint(fresh.getJSON()),
      editorFingerprint: saved.editorFingerprint,
      reopenedRaw: collectRaw(fresh.getJSON()),
    };
    fresh.destroy();
    editor.destroy();
    return result;
  }

  it('reopening the saved bytes reproduces a raw block with a single authored newline', () => {
    const result = saveAndReopen('[ref]: /u\n- a\n');
    if (!result) return;
    // The literal block kept exactly the one newline the author wrote.
    expect(result.reopenedRaw).toEqual(['[ref]: /u\n']);
    expect(result.reopenedFingerprint).toBe(result.editorFingerprint);
  });

  it('reopening the saved bytes reproduces a raw block in the middle of the document', () => {
    const result = saveAndReopen('p one\n\n[ref]: /u\np two\n');
    if (!result) return;
    expect(result.reopenedRaw).toContain('[ref]: /u\n');
    expect(result.reopenedFingerprint).toBe(result.editorFingerprint);
  });

  it('reopening the saved bytes reproduces two adjacent raw blocks', () => {
    const result = saveAndReopen('[a]: /1\n[b]: /2\n\n\npara\n');
    if (!result) return;
    expect(result.reopenedFingerprint).toBe(result.editorFingerprint);
  });

  it('soft-break paragraphs around a raw literal reopen byte-identically (#404)', () => {
    // The fallback lexer (breaks: false) only looks at block boundaries, so
    // soft newlines must not disturb where the raw literal is located or how
    // many bytes it keeps.
    const result = saveAndReopen('第一行\n第二行\n\n[ref]: /u\n\n第三行\n第四行\n');
    if (!result) return;
    expect(result.reopenedRaw).toEqual(['[ref]: /u\n\n']);
    expect(result.reopenedFingerprint).toBe(result.editorFingerprint);
    // The soft-break spelling survives the save round-trip: bare newlines,
    // never upgraded to two-space hard breaks.
    expect(result.markdown).toContain('第一行\n第二行');
    expect(result.markdown).not.toContain('  \n');
  });

  // The boundary the guard measures, stated on bytes alone. Any future change
  // to the splice arithmetic that leaves a renderer separator behind after a
  // payload has to stop the write, not corrupt it.
  it('rejects a candidate that leaves a separator newline after a payload', () => {
    expect(verifyRawMarkdownSplice('[ref]: /u\n- a\n', ['[ref]: /u\n'])).toBe(true);
    expect(verifyRawMarkdownSplice('[ref]: /u\n\n- a\n', ['[ref]: /u\n'])).toBe(false);
    // A payload with no trailing newline needs the separator to stay a block.
    expect(verifyRawMarkdownSplice('<!-- a -->\n# H\n', ['<!-- a -->'])).toBe(true);
    // A missing payload is never a candidate.
    expect(verifyRawMarkdownSplice('# H\n', ['[ref]: /u\n'])).toBe(false);
  });
});
