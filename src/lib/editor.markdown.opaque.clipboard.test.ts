import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SafeParagraph } from './editor.extensions';
import { handleOpaqueCopy, OpaqueNode, OPAQUE_NODE_NAME, setActiveOpaqueRegistry } from './editor.markdown.opaque.extension';
import { OpaqueRegistry } from './editor.markdown.opaque';
import { resolveClipboardOpaque, clipboardHasSentinel } from './editor.markdown.opaque.clipboard';
import { createMarkdownExtension } from './editor.init';

/**
 * Task 7.5 — opaque clipboard policy.
 *
 * Copy/cut must place original raw Markdown on the clipboard (never an internal
 * sentinel); a pasted foreign/unresolvable sentinel must become user text, not
 * an internal node.
 */
describe('opaque clipboard policy (7.5)', () => {
  afterEach(() => setActiveOpaqueRegistry(null));

  function makeRegistry(source: string, seed = 1) {
    return new OpaqueRegistry(source, { randomSource: () => seed });
  }

  it('substitutes sentinels with raw payloads when resolving clipboard text', () => {
    const registry = makeRegistry('# Hi\n\n<!-- real -->\n');
    const render = registry.register('html-comment', '<!-- real -->', { from: 0, to: 11 });
    if (!render.ok) throw new Error('reg');
    const resolved = resolveClipboardOpaque(`[ text ] ${render.sentinel} [ end ]`, registry);
    expect(resolved).toBe('[ text ] <!-- real --> [ end ]');
    expect(clipboardHasSentinel(resolved)).toBe(false);
  });

  it('leaves an unresolvable/foreign sentinel as literal user text', () => {
    const registry = makeRegistry('no opaque\n');
    // A foreign sentinel whose slot is NOT in this registry.
    const foreign = '⟦MF-OPAQUE:deadbeef.99⟧';
    const resolved = resolveClipboardOpaque(`before ${foreign} after`, registry);
    // It is not dropped or rewritten — kept verbatim (user content).
    expect(resolved).toContain(foreign);
  });

  it('pasting a foreign/unresolvable sentinel does NOT create an opaque node', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
        SafeParagraph,
        OpaqueNode,
        createMarkdownExtension(),
      ],
    });
    // No active registry (foreign/plain-text paste context).
    editor.commands.setContent('# Hi\n\n   foreign ⟦MF-OPAQUE:fe.c0ff33⟧ text\n', { contentType: 'markdown' } as never);
    const json = editor.getJSON();
    // No opaque node is created from the forged sentinel.
    const opaqueNodes = (json.content ?? []).filter((n) => n.type === OPAQUE_NODE_NAME);
    expect(opaqueNodes).toHaveLength(0);
    // The sentinel text is preserved as literal user text in a paragraph.
    const plain = JSON.stringify(json);
    expect(plain).toContain('⟦MF-OPAQUE:fe.c0ff33⟧');
    editor.destroy();
  });

  it('ClipboardEvent integration: copying an opaque selection yields raw, not a token', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
        SafeParagraph,
        OpaqueNode,
        createMarkdownExtension(),
      ],
    });
    const registry = makeRegistry('<!-- a -->\n\n<!-- b -->\nneeds a multiline body\n');
    const a = registry.register('html-comment', '<!-- a -->', { from: 0, to: 9 });
    const b = registry.register('html-block', '<div>\nraw body\n</div>', { from: 10, to: 30 });
    if (!a.ok || !b.ok) throw new Error('reg');
    setActiveOpaqueRegistry(registry);

    editor.commands.setContent(`${a.sentinel}\n\n${b.sentinel}\n`, { contentType: 'markdown' } as never);
    // Select the whole document.
    editor.commands.selectAll();

    // Invoke the copy handler with a spy clipboardData (the same handler wired
    // to the DOM `copy`/`cut` events by onCreate).
    const sets: Record<string, string> = {};
    const clipboardData = {
      setData: (type: string, value: string) => { sets[type] = value; },
    } as unknown as DataTransfer;
    const handled = handleOpaqueCopy(clipboardData, editor, registry);

    expect(handled).toBe(true);
    expect(clipboardHasSentinel(sets['text/plain'] ?? '')).toBe(false);
    expect(sets['text/plain'] ?? '').toContain('<!-- a -->');
    expect((sets['text/plain'] ?? '')).toContain('<div>');
    editor.destroy();
  });

  it('a resolved clipboard never contains an internal token for normal content', () => {
    const registry = makeRegistry('plain text\n');
    const resolved = resolveClipboardOpaque('just plain prose here', registry);
    expect(clipboardHasSentinel(resolved)).toBe(false);
    expect(resolved).toBe('just plain prose here');
  });
});
