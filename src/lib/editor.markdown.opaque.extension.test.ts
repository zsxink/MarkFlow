import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SafeParagraph } from './editor.extensions';
import { OpaqueNode, OPAQUE_NODE_NAME, setActiveOpaqueRegistry } from './editor.markdown.opaque.extension';
import { OpaqueRegistry } from './editor.markdown.opaque';
import { createMarkdownExtension } from './editor.init';

// Task 7.3 — non-editable opaque atom extension + safe node view.
//
// The node stores ONLY `slot` (+ display `category`), never the raw payload.
// ProseMirror JSON and the DOM must not leak raw blog HTML / comments / front
// matter, and the node view renders a safe non-editable label.

function createEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({
        paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false,
        listItem: false, listKeymap: false,
      }),
      SafeParagraph,
      OpaqueNode,
      createMarkdownExtension(),
    ],
  });
}

function registerRaw(registry: OpaqueRegistry, category: 'frontmatter' | 'html-block' | 'html-comment', raw: string) {
  const r = registry.register(category, raw, { from: 0, to: raw.length });
  if (!r.ok) throw new Error('register failed');
  return r;
}

describe('opaque atom extension (7.3)', () => {
  afterEach(() => {
    setActiveOpaqueRegistry(null);
  });

  it('stores only slot + category in ProseMirror JSON (no raw payload)', () => {
    const editor = createEditor();
    const registry = new OpaqueRegistry('---\na: 1\n---\n# hi\n', { randomSource: () => 1 });
    const { sentinel } = registerRaw(registry, 'frontmatter', '---\na: 1\n---\n');
    setActiveOpaqueRegistry(registry);

    editor.commands.setContent(`# Title\n\n${sentinel}\n\nbody\n`, { contentType: 'markdown' } as never);
    const json = editor.getJSON();

    // Find the opaque node in the tree.
    const opaqueNode = json.content?.find((n) => n.type === OPAQUE_NODE_NAME);
    expect(opaqueNode).toBeTruthy();
    const attrs = opaqueNode?.attrs ?? {};
    // The node carries ONLY the slot + category — never the front-matter bytes.
    expect(attrs.slot).toBe(`${registry.nonce}.0`);
    expect(attrs.category).toBe('frontmatter');
    expect(JSON.stringify(json)).not.toContain('a: 1');
    expect(JSON.stringify(json)).not.toContain('---');
    editor.destroy();
  });

  it('renders a safe non-editable DOM node view and never injects raw HTML', () => {
    const editor = createEditor();
    const registry = new OpaqueRegistry('before\n\n<div>\nraw <script>alert(1)</script>\n</div>\n', { randomSource: () => 1 });
    const raw = '<div>\nraw <script>alert(1)</script>\n</div>\n';
    const { sentinel } = registerRaw(registry, 'html-block', raw);
    setActiveOpaqueRegistry(registry);

    editor.commands.setContent(`# Hi\n\n${sentinel}\n`, { contentType: 'markdown' } as never);
    const dom = editor.view.dom as HTMLElement;

    // The raw HTML never appears in the rendered DOM.
    expect(dom.outerHTML).not.toContain('alert(1)');
    expect(dom.outerHTML).not.toContain('raw <script>');
    expect(dom.outerHTML).not.toContain('<script>');

    // The node view exists, carries the slot, and is non-editable.
    const atom = dom.querySelector('.opaque-atom');
    expect(atom).toBeTruthy();
    expect(atom?.getAttribute('data-opaque-slot')?.length).toBeGreaterThan(0);
    expect(atom?.getAttribute('contenteditable')).toBe('false');
    // The label is derived from the category, not the payload.
    expect(atom?.textContent ?? '').toContain('HTML 块');
    editor.destroy();
  });

  it('serializes an opaque node back to its sentinel (slot-only, no payload)', () => {
    const editor = createEditor();
    const registry = new OpaqueRegistry('<!-- a -->\n\n<!-- b -->\n', { randomSource: () => 1 });
    const { sentinel } = registerRaw(registry, 'html-comment', '<!-- a -->');
    setActiveOpaqueRegistry(registry);

    editor.commands.setContent(`# Hi\n\n${sentinel}\n\nbody\n`, { contentType: 'markdown' } as never);
    const md = (editor as any).getMarkdown() as string;

    // The serialized output contains the slot sentinel, never the raw bytes.
    expect(md).not.toContain('<!-- a -->');
    expect(md).toContain(sentinel);
    editor.destroy();
  });

  it('is an atom: users cannot place the cursor inside / edit its payload', () => {
    const editor = createEditor();
    const schema = editor.schema;
    const nodeType = schema.nodes[OPAQUE_NODE_NAME];
    expect(nodeType).toBeTruthy();
    expect(nodeType.isAtom).toBe(true);
    expect(nodeType.isInline).toBe(false);
    editor.destroy();
  });

  it('parses a document with multiple opaque fragments into distinct atoms', () => {
    const editor = createEditor();
    const registry = new OpaqueRegistry('<!-- a -->\n\n# Hi\n\n<!-- b -->\n', { randomSource: () => 1 });
    const a = registerRaw(registry, 'html-comment', '<!-- a -->');
    const b = registerRaw(registry, 'html-comment', '<!-- b -->');
    setActiveOpaqueRegistry(registry);

    editor.commands.setContent(
      `${a.sentinel}\n\n# Hi\n\n${b.sentinel}\n`,
      { contentType: 'markdown' } as never,
    );
    const atoms = (editor.getJSON().content ?? []).filter((n) => n.type === OPAQUE_NODE_NAME);
    expect(atoms).toHaveLength(2);
    expect(atoms[0].attrs?.slot).toBe(a.entry.slot);
    expect(atoms[1].attrs?.slot).toBe(b.entry.slot);
    editor.destroy();
  });
});
