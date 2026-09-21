import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BlockImage, SafeParagraph } from './editor.extensions';
import { OpaqueNode } from './editor.markdown.opaque.extension';
import { admitOpaque } from './editor.markdown.opaque.integration';
import { getOpaqueRegistry, endOpaqueSession } from './editor.markdown.opaque.session';
import {
  deriveDirtyFromCandidate,
  runSaveBoundary,
  shouldSuppressAutosave,
  shouldUseReconcileBoundary,
} from './editor.save.reconcile';
import { createMarkdownExtension } from './editor.init';
import { assetToOriginalMap } from './editor.state';

/**
 * Task 8.5 + 8.6 — conflict state + autosave suppression; dirty derived from a
 * successful candidate vs the persisted baseline.
 */
describe('save-boundary reconcile (8.5, 8.6)', () => {
  afterEach(() => {
    endOpaqueSession();
    assetToOriginalMap.clear();
  });

  function makeEditor() {
    return new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
        SafeParagraph,
        OpaqueNode,
        BlockImage.configure({ allowBase64: true }),
        createMarkdownExtension(),
      ],
    });
  }

  it('8.6: dirty is derived only from a successful candidate vs the persisted baseline', () => {
    expect(deriveDirtyFromCandidate('# a\n', '# a\n')).toBe(false);
    expect(deriveDirtyFromCandidate('# b\n', '# a\n')).toBe(true);
    // A failed conversion must never be considered clean — callers keep dirty.
    expect(shouldSuppressAutosave(null)).toBe(false);
  });

  it('8.5: a pending conflict suppresses autosave', () => {
    expect(shouldSuppressAutosave('opaque-mismatch')).toBe(true);
    expect(shouldSuppressAutosave('stale-source')).toBe(true);
    expect(shouldSuppressAutosave(null)).toBe(false);
  });

  it('reconcile boundary engages only for opaque-aware modes (8.5)', () => {
    expect(shouldUseReconcileBoundary('opaque')).toBe(true);
    expect(shouldUseReconcileBoundary('reconcile')).toBe(true);
    // Verified eligible documents use the same full boundary as opaque docs.
    expect(shouldUseReconcileBoundary('gated')).toBe(true);
    expect(shouldUseReconcileBoundary('v3-compatible')).toBe(false);
    expect(shouldUseReconcileBoundary('source-only')).toBe(false);
  });

  it('8.5: an opaque doc that is NOT edited yields unchanged (no disk write)', () => {
    const editor = makeEditor();
    const source = '<!-- comment -->\n\n# Hi\n';
    const admission = admitOpaque(editor, source, { sourceRevision: 1, userRevisionAtAdmission: 0 });
    expect(admission.ok).toBe(true);
    if (!admission.ok) return;

    const decision = runSaveBoundary(editor, {
      session: admission.session,
      currentSourceRevision: 1,
      currentUserRevision: 0,
      registry: getOpaqueRegistry(),
      pipelineMode: 'opaque',
    });

    // No user edit and canonical-only → unchanged → no write.
    expect(decision.kind).toBe('unchanged');
    if (decision.kind === 'unchanged') expect(decision.write).toBe(false);
    editor.destroy();
  });

  it('8.5: a conflict yields no candidate (disk never written, dirty kept)', () => {
    const editor = makeEditor();
    const source = '<!-- comment -->\n\n# Hi\n';
    const admission = admitOpaque(editor, source, { sourceRevision: 1, userRevisionAtAdmission: 0 });
    expect(admission.ok).toBe(true);
    if (!admission.ok) return;

    // Simulate a stale source (external change) → the boundary must conflict
    // and hand back NO write candidate.
    const decision = runSaveBoundary(editor, {
      session: admission.session,
      currentSourceRevision: 99, // file changed externally
      currentUserRevision: 2,    // user edited too
      registry: getOpaqueRegistry(),
      pipelineMode: 'opaque',
    });

    expect(decision.kind).toBe('conflict');
    if (decision.kind === 'conflict') {
      expect(decision.write).toBe(false);
      expect(decision.code).toBe('stale-source');
      // A conflict suppresses autosave and never reports clean.
      expect(shouldSuppressAutosave(decision.code)).toBe(true);
    }
    editor.destroy();
  });

  it('8.5: an edited, verified doc yields a safe-edit write candidate', () => {
    const editor = makeEditor();
    const source = '<!-- a -->\n\n# Heading\n\nbody\n';
    const admission = admitOpaque(editor, source, { sourceRevision: 1, userRevisionAtAdmission: 0 });
    expect(admission.ok).toBe(true);
    if (!admission.ok) return;

    // Edit the heading and bump user revision.
    const { state } = editor.view;
    let pos = -1;
    state.doc.descendants((node, p) => {
      if (node.type.name === 'heading' && pos === -1) pos = p + 1;
      return true;
    });
    const tr = state.tr.replaceWith(pos, pos + 'Heading'.length, state.schema.text('Renamed'));
    editor.view.dispatch(tr);

    const decision = runSaveBoundary(editor, {
      session: admission.session,
      currentSourceRevision: 1,
      currentUserRevision: 1,
      registry: getOpaqueRegistry(),
      pipelineMode: 'opaque',
    });

    expect(decision.kind).toBe('safe-edit');
    if (decision.kind === 'safe-edit') {
      expect(decision.write).toBe(true);
      expect(decision.markdown).toContain('# Renamed');
      expect(decision.markdown).toContain('<!-- a -->');
    }
    editor.destroy();
  });

  it('8.4: a runtime asset: image URL never reaches the on-disk candidate (safe-edit mapping or conflict)', () => {
    const editor = makeEditor();
    const source = '<!-- note -->\n\n# Heading\n\nbody\n';
    const admission = admitOpaque(editor, source, { sourceRevision: 1, userRevisionAtAdmission: 0 });
    expect(admission.ok).toBe(true);
    if (!admission.ok) return;

    // A pasted/dropped local image carries a runtime `asset:` src; the original
    // Markdown path is recorded for the reverse mapping.
    const assetUrl = 'asset://abc123';
    assetToOriginalMap.set(assetUrl, 'images/photo.png');

    // Insert an image node with the runtime asset src into the body paragraph.
    const { state } = editor.view;
    const imageType = state.schema.nodes.image;
    expect(imageType).toBeTruthy();
    let paraPos = -1;
    state.doc.descendants((node, p) => {
      if (node.type.name === 'paragraph' && node.textContent === 'body' && paraPos === -1) paraPos = p + 1;
      return true;
    });
    expect(paraPos).toBeGreaterThan(-1);
    const tr = state.tr
      .insert(paraPos, imageType.create({ src: assetUrl, alt: 'photo' }))
      .scrollIntoView();
    editor.view.dispatch(tr);

    const decision = runSaveBoundary(editor, {
      session: admission.session,
      currentSourceRevision: 1,
      currentUserRevision: 1, // user edited (added the image)
      registry: getOpaqueRegistry(),
      pipelineMode: 'opaque',
    });

    // INVARIANT (round-trip spec): a runtime `asset:` URL must never be written
    // to disk. Either the safe-edit candidate maps it back to the original path,
    // or the boundary rejects the doc as a conflict (nothing written). This
    // guards the opaque save path against bypassing replaceAssetUrlsWithOriginal
    // (reviewer finding, task 10.4 round 2) — and against silently persisting a
    // runtime URL in any form.
    if (decision.kind === 'safe-edit') {
      expect(decision.write).toBe(true);
      expect(decision.markdown).not.toContain(assetUrl);
      expect(decision.markdown).toContain('![');
      expect(decision.markdown).toContain('images/photo.png');
      expect(decision.markdown).toContain('<!-- note -->');
    } else {
      // `conflict` is the safe outcome: no write, no candidate to persist.
      expect(decision.kind).toBe('conflict');
      expect(decision.write).toBe(false);
    }
    editor.destroy();
  });
});
