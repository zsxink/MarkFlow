/**
 * P0 baseline characterization — ProseMirror path violates L1.
 *
 * Proves that on the current baseline (feat-v0.1.0@6bfba453), editing the
 * document body loses or rewrites trailing line-break bytes, so the #189
 * `trailingNewlines` metadata compensation does NOT satisfy the L1
 * surviving-interval contract.
 *
 * THIS SUITE IS EXPECTED TO FAIL at the baseline. It runs only via
 *   npm run test:characterization
 * and is deliberately excluded from the default green suite and from tsc.
 *
 * It drives the REAL editor stack: a real Tiptap editor with the real
 * `tiptap-markdown` serializer, injected into the REAL `setMarkdown` /
 * `getMarkdown` functions of src/lib/editor.ts, then compares the save-path
 * bytes against the L1 oracle from l1-harness.mjs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPatch, verifyL1 } from './l1-harness.mjs';
import { store } from '../../src/lib/store';
import { setEditor, getEditor, getDocumentState, setMode } from '../../src/lib/editor.state';
import { setMarkdown, getMarkdown } from '../../src/lib/editor';

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'byte-contract', 'fixtures',
);

let editors: Editor[] = [];

function makeEditor(): Editor {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const ed = new Editor({
    element: el,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Markdown.configure({ html: false, tightLists: true, bulletListMarker: '-' }),
    ],
    content: '',
  });
  editors.push(ed);
  return ed;
}

beforeEach(() => {
  store.setState({ mode: 'wysiwyg', dirty: false, activeFilePath: null, workspacePath: null });
  const d = getDocumentState();
  d.trailingNewlines = 0;
  d.lastPersistedMarkdown = '';
  d.revision = 0;
  d.programmaticUpdate = false;
  setMode('wysiwyg');
  setEditor(makeEditor());
});

afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
  setEditor(null);
});

/** Real open → body-edit → save pipeline, returning saved bytes. */
function openEditBodySave(fixtureBytes: Buffer, inserted: string): Buffer {
  const content = fixtureBytes.toString('utf8'); // read_to_string semantics
  setMarkdown(content); // captures trailingNewlines, sets PM doc, marks persisted
  getEditor()!.commands.insertContentAt(0, inserted); // body edit at doc start
  return Buffer.from(getMarkdown(), 'utf8'); // real save-path string → bytes
}

describe('P0 characterization: PM path tail-newline byte loss', () => {
  const failFixtures = ['utf8-crlf-tail2', 'utf8-crlf-tail3', 'utf8-cr-tail1'];

  for (const id of failFixtures) {
    it(`${id}: body edit rewrites untouched trailing line-break bytes`, async () => {
      const fixtureBytes = await readFile(path.join(fixtureRoot, `${id}.md`));
      const intent = { from: 0, to: 0, inserted: 'Z' };
      const saved = openEditBodySave(fixtureBytes, 'Z');
      const verdict = verifyL1(fixtureBytes, saved, intent);

      // The baseline MUST fail L1 with a byte-level tail diff.
      expect(verdict.pass, JSON.stringify(verdict)).toBe(false);
      expect(verdict.trailingPreserved).toBe(false);
      // Compilation evidence: compensation writes LF, source tail was CRLF/CR.
      const oracleTail = applyPatch(fixtureBytes, intent).out.toString('utf8').match(/(\r\n|\r|\n)+$/)?.[0] ?? '';
      const savedTail = saved.toString('utf8').match(/(\r\n|\r|\n)+$/)?.[0] ?? '';
      expect(savedTail).not.toBe(oracleTail);
      console.log(`[characterization] ${id}: inputSha=${verdict.inputSha} savedSha=${verdict.outputSha} oracleSha=${verdict.oracleSha}`);
      console.log(`[characterization] ${id}: oracleTail=${JSON.stringify(oracleTail)} savedTail=${JSON.stringify(savedTail)}`);
    });
  }

  it('utf8-lf-tail3: explicit user tail deletion is overwritten by stale metadata', async () => {
    const fixtureBytes = await readFile(path.join(fixtureRoot, 'utf8-lf-tail3.md'));
    setMarkdown(fixtureBytes.toString('utf8'));

    // User explicitly removes ALL trailing blank paragraphs (tail edit intent).
    const doc = getEditor()!.state.doc;
    const end = doc.content.size;
    const lastEmpty = doc.lastChild;
    const deleteFrom = lastEmpty && lastEmpty.childCount === 0 ? end - lastEmpty.nodeSize : end;
    getEditor()!.commands.deleteRange({ from: deleteFrom, to: end });

    const saved = Buffer.from(getMarkdown(), 'utf8');
    // The user's intent: tail removed. Metadata re-adds 3 LF boundaries.
    const savedText = saved.toString('utf8');
    const tailCount = (savedText.match(/\n+$/)?.[0].length) ?? 0;
    console.log(`[characterization] utf8-lf-tail3 after explicit tail delete: savedTail=${JSON.stringify(savedText.slice(-8))}`);
    expect(tailCount).toBeGreaterThan(0); // stale metadata re-added the deleted tail
    expect(tailCount).toBe(3); // the exact stale count captured at open
  });
});
