import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SafeParagraph } from './editor.extensions';
import { OpaqueNode } from './editor.markdown.opaque.extension';
import { admitOpaque, reconcileSave } from './editor.markdown.opaque.integration';
import { getOpaqueRegistry, endOpaqueSession } from './editor.markdown.opaque.session';
import { createMarkdownExtension } from './editor.init';

/**
 * Task 8.1 + 8.4 — opaque admission captures baselines; the `safe-edit` path
 * verifies the candidate reparses to the current editor semantics and preserves
 * every opaque fragment byte-for-byte.
 */
describe('opaque admission + safe-edit reconcile (8.1, 8.4)', () => {
  afterEach(() => {
    endOpaqueSession();
  });

  function makeEditor() {
    return new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
        SafeParagraph,
        OpaqueNode,
        createMarkdownExtension(),
      ],
    });
  }

  it('8.1: admits an opaque doc and captures a full session', () => {
    const editor = makeEditor();
    const source = '---\ntitle: X\n---\n\n# Heading\n\n<!-- a -->\n\nbody\n\n<!-- b -->\n';
    const admission = admitOpaque(editor, source, { sourceRevision: 5, userRevisionAtAdmission: 2 });
    expect(admission.ok).toBe(true);
    if (!admission.ok) return;
    expect(admission.mode).toBe('opaque');
    expect(admission.session.sourceBaseline).toBe(source);
    expect(admission.session.sourceRevision).toBe(5);
    expect(admission.session.userRevisionAtAdmission).toBe(2);
    expect(admission.session.opaqueRegistry.size).toBe(3); // front matter + 2 comments
    editor.destroy();
  });

  it('8.4: editing a supported region yields a safe-edit that preserves opaque fragments', () => {
    const editor = makeEditor();
    const source = '<!-- keep-one -->\n\n# Heading\n\nbody *text*\n\n<!-- keep-two -->\n';
    const admission = admitOpaque(editor, source, { sourceRevision: 1, userRevisionAtAdmission: 0 });
    expect(admission.ok).toBe(true);
    if (!admission.ok) return;
    expect(admission.session.opaqueRegistry.size).toBe(2);

    // Simulate a user edit to the heading (a supported region), leaving the two
    // opaque atoms untouched, and bump the user revision.
    // Find the heading node and replace its text via a ProseMirror transaction.
    const { state } = editor.view;
    let headingPos = -1;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && headingPos === -1) headingPos = pos + 1;
      return true; // keep descending to find the heading text
    });
    expect(headingPos).toBeGreaterThan(-1);
    const headingTextEnd = headingPos + 'Heading'.length;
    const tr = state.tr
      .replaceWith(headingPos, headingTextEnd, state.schema.text('Renamed'))
      .scrollIntoView();
    editor.view.dispatch(tr);

    const registry = getOpaqueRegistry();
    const result = reconcileSave(editor, {
      session: admission.session,
      currentSourceRevision: 1,
      currentUserRevision: 1, // user edited
      registry,
    });

    expect(result.outcome.verdict).toBe('safe-edit');
    if (result.outcome.verdict === 'safe-edit') {
      const md = result.outcome.markdown;
      expect(md).toContain('<!-- keep-one -->');
      expect(md).toContain('<!-- keep-two -->');
      expect(md).toContain('# Renamed');
      // No internal token reaches the candidate.
      expect(md).not.toContain('⟦MF-OPAQUE:');
    }
    editor.destroy();
  });

  it('8.4: an unedited opaque doc with only canonicalization differences is unchanged', () => {
    const editor = makeEditor();
    const source = '# Heading\n\nbody\n\n<!-- note -->\n';
    const admission = admitOpaque(editor, source, { sourceRevision: 1, userRevisionAtAdmission: 0 });
    expect(admission.ok).toBe(true);
    if (!admission.ok) return;
    const result = reconcileSave(editor, {
      session: admission.session,
      currentSourceRevision: 1,
      currentUserRevision: 0, // no user edit
      registry: getOpaqueRegistry(),
    });
    // No user edit → the classifier must return the exact source baseline
    // (unchanged), never a canonicalized rewrite.
    expect(result.outcome.verdict).toBe('unchanged');
    if (result.outcome.verdict === 'unchanged') {
      expect(result.outcome.markdown).toBe(source);
    }
    editor.destroy();
  });
});
