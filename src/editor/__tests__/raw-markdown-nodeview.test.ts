import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, SafeParagraph, mermaidCodeBlockExtension } from '../extensions';
import { createMarkdownExtension } from '../init';
import { RawMarkdown } from '../markdown/fallback';
import { OpaqueNode } from '../markdown/opaque/extension';
import { getOpaqueRegistry, endOpaqueSession } from '../markdown/opaque/session';
import { decideAdmission } from '../markdown/admission';
import { reconcileSave } from '../markdown/opaque/integration';
import { semanticFingerprint } from '../markdown/fingerprint';

const MALFORMED_TABLE = '| A | B |\n| --- | --- | --- |\n| 1 | 2 | 3 |';
const REPAIRED_TABLE = '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |';

/**
 * The raw fragment's NodeView is its editing surface: one always-live textarea
 * (source-mode look, single-click focus) whose paused input re-proves the block
 * and swaps it for real nodes in ONE transaction (issue #394).
 */
describe('raw markdown nodeview direct edit + upgrade', () => {
  afterEach(() => {
    vi.useRealTimers();
    endOpaqueSession();
  });

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

  function admitRaw(editor: Editor, source = MALFORMED_TABLE) {
    const admission = decideAdmission(editor, `before\n\n${source}\n\nafter\n`, { sourceRevision: 1, userRevisionAtAdmission: 0 });
    expect(admission.mode).toBe('reconcile');
    return admission;
  }

  function rawTextarea(editor: Editor): HTMLTextAreaElement {
    const input = editor.view.dom.querySelector('textarea.markflow-raw-markdown-input');
    expect(input).not.toBeNull();
    return input as HTMLTextAreaElement;
  }

  function rawSources(editor: Editor): string[] {
    const out: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'markflowRawMarkdown') out.push(String(node.attrs.source));
      return true;
    });
    return out;
  }

  function type(input: HTMLTextAreaElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('renders the fragment as an always-live textarea carrying the source', () => {
    const editor = makeEditor();
    admitRaw(editor);
    const input = rawTextarea(editor);
    expect(input.hidden).toBe(false);
    expect(input.value).toBe(MALFORMED_TABLE);
    expect(input.readOnly).toBe(false);
    // No code-frame <pre> node view any more; the serialized form keeps `pre`.
    expect(editor.view.dom.querySelector('pre[data-markflow-raw]')).toBeNull();
    editor.destroy();
  });

  it('syncs edits into the node source', () => {
    const editor = makeEditor();
    admitRaw(editor);
    const input = rawTextarea(editor);
    type(input, `${MALFORMED_TABLE}\nextra`);
    expect(rawSources(editor)).toEqual([`${MALFORMED_TABLE}\nextra`]);
    editor.destroy();
  });

  it('upgrades a repaired table to a real table after the debounce', () => {
    vi.useFakeTimers();
    const editor = makeEditor();
    admitRaw(editor);
    const input = rawTextarea(editor);
    type(input, REPAIRED_TABLE);
    vi.advanceTimersByTime(500);
    expect(rawSources(editor)).toEqual([]);
    const types: string[] = [];
    editor.state.doc.descendants((node) => { types.push(node.type.name); return true; });
    expect(types).toContain('table');
    editor.destroy();
  });

  it('keeps malformed content literal without touching input state', () => {
    vi.useFakeTimers();
    const editor = makeEditor();
    admitRaw(editor);
    const input = rawTextarea(editor);
    const edited = `${MALFORMED_TABLE}\nstill broken`;
    type(input, edited);
    vi.advanceTimersByTime(500);
    expect(rawSources(editor)).toEqual([edited]);
    expect(input.value).toBe(edited);
    editor.destroy();
  });

  it('never fires mid-IME composition and upgrades after compositionend', () => {
    vi.useFakeTimers();
    const editor = makeEditor();
    admitRaw(editor);
    const input = rawTextarea(editor);
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    type(input, REPAIRED_TABLE);
    vi.advanceTimersByTime(1000);
    expect(rawSources(editor)).toEqual([REPAIRED_TABLE]);
    input.dispatchEvent(new CompositionEvent('compositionend'));
    vi.advanceTimersByTime(500);
    expect(rawSources(editor)).toEqual([]);
    editor.destroy();
  });

  it('undoes the upgrade in one step back to an editable raw node', () => {
    vi.useFakeTimers();
    const editor = makeEditor();
    admitRaw(editor);
    const input = rawTextarea(editor);
    type(input, REPAIRED_TABLE);
    vi.advanceTimersByTime(500);
    expect(rawSources(editor)).toEqual([]);
    editor.commands.undo();
    // ProseMirror history's 500ms new-group delay merges the source edits and
    // the upgrade into one undo step, so Ctrl+Z lands back on the literal atom.
    expect(rawSources(editor).length).toBe(1);
    // The restored node keeps editing: typing still updates its source.
    const restored = rawTextarea(editor);
    type(restored, `${MALFORMED_TABLE}\nmore`);
    expect(rawSources(editor)).toEqual([`${MALFORMED_TABLE}\nmore`]);
    editor.destroy();
  });

  it('replaces with several nodes when the repaired source holds multiple blocks', () => {
    vi.useFakeTimers();
    const editor = makeEditor();
    admitRaw(editor);
    const input = rawTextarea(editor);
    type(input, '# Title\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
    vi.advanceTimersByTime(500);
    expect(rawSources(editor)).toEqual([]);
    const types: string[] = [];
    editor.state.doc.descendants((node) => { types.push(node.type.name); return true; });
    expect(types).toContain('heading');
    expect(types).toContain('table');
    editor.destroy();
  });

  it('deletes the node when edited to empty', () => {
    const editor = makeEditor();
    admitRaw(editor);
    const input = rawTextarea(editor);
    type(input, '');
    expect(rawSources(editor)).toEqual([]);
    editor.destroy();
  });

  it('locks the textarea while read-only and re-enables it afterwards', () => {
    const editor = makeEditor();
    admitRaw(editor);
    const input = rawTextarea(editor);
    editor.setEditable(false);
    // A focus visit while read-only latches the textarea shut…
    input.dispatchEvent(new Event('focus'));
    expect(input.readOnly).toBe(true);
    // …and the next focus once editable again must reopen it.
    editor.setEditable(true);
    input.dispatchEvent(new Event('focus'));
    expect(input.readOnly).toBe(false);
    editor.destroy();
  });

  it('keeps the save proof after every raw block upgraded (safe-edit + lossless reopen)', () => {
    vi.useFakeTimers();
    const editor = makeEditor();
    const admission = admitRaw(editor);
    expect(admission.session).not.toBeNull();
    const input = rawTextarea(editor);
    type(input, REPAIRED_TABLE);
    vi.advanceTimersByTime(500);
    expect(rawSources(editor)).toEqual([]);

    const saved = reconcileSave(editor, {
      session: admission.session!,
      registry: getOpaqueRegistry(),
      currentSourceRevision: 1,
      currentUserRevision: 1,
    });
    expect(saved.outcome.verdict).toBe('safe-edit');
    if (saved.outcome.verdict !== 'safe-edit') return;
    // The serializer aligns GFM table columns, so match on cells, not bytes.
    expect(saved.outcome.markdown).toMatch(/\|\s*A\s+\|\s*B\s+\|\s*C\s*\|/);

    const fresh = makeEditor();
    const reopened = decideAdmission(fresh, saved.outcome.markdown, { sourceRevision: 1, userRevisionAtAdmission: 0 });
    expect(reopened.mode).toBe('reconcile');
    expect(semanticFingerprint(fresh.getJSON())).toBe(saved.editorFingerprint);
    fresh.destroy();
    editor.destroy();
  });
});
