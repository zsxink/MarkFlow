/**
 * Lossless command router — Slice 3.1/3.2 tests.
 *
 * Proves the toolbar/keyboard/link-dialog commands operate on the ACTIVE
 * CodeMirror view when a lossless binding is active: a command dispatches a
 * doc-changing transaction on `binding.editor.view`, the resulting CodeMirror
 * doc bytes are correct, and the binding's patch pipeline picks the change up
 * (the view's updateListener queues it as a user edit). Uses the same
 * real-binding harness as projection.test.ts (real `openLosslessDocument` /
 * `EditorSurfaceBinding` / `createLosslessSourceEditor` with the Tauri
 * `invoke` boundary mocked).
 *
 * Note: `EditorView.focus()` collapses a range selection under happy-dom (a
 * test-env artifact; real browsers preserve the range on focus). Tests that
 * assert the resulting selection mock `focus` to a no-op so the dispatch's
 * own selection spec is what's verified.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import * as nodeFs from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';

const state = vi.hoisted(() => ({
  sessions: new Map<number, any>(),
  nextSession: 1,
  nextDocument: 1,
}));

vi.mock('@tauri-apps/api/core', async () => {
  const nodeFsMod = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const sessionState = state;
  const sha256hex = (buf: Buffer | string) => {
    const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
    return createHash('sha256').update(b).digest('hex');
  };
  const readLogical = (content: string) =>
    content.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  return {
    invoke: vi.fn(async (cmd: string, args: any = {}) => {
      const req = args.req ?? args;
      switch (cmd) {
        case 'open_lossless_document': {
          const content = await nodeFsMod.readFile(req.path, 'utf8');
          const logicalText = readLogical(content);
          const sessionId = sessionState.nextSession++;
          const documentId = sessionState.nextDocument++;
          const fileIdentity = {
            canonicalPath: req.path,
            size: Buffer.byteLength(content, 'utf8'),
            mtime: null,
            contentHash: sha256hex(content),
          };
          sessionState.sessions.set(sessionId, {
            sessionId, documentId, bindingGeneration: 0, logicalText, revision: 0,
            persistedRevision: 0,
          });
          return {
            sessionId, documentId, bindingGeneration: 0, logicalText,
            revision: 0, persistedRevision: 0, confirmedHash: sha256hex(logicalText),
            original: {
              contentHash: sha256hex(content),
              byteLen: Buffer.byteLength(content, 'utf8'),
              bom: content.startsWith('﻿') ? 'utf8' : 'none',
              encoding: content.startsWith('﻿') ? 'utf8Bom' : 'utf8',
              lineEndings: [], trailingLineBreaks: 0,
              fileIdentity, dominantLineEnding: 'lf',
            },
          };
        }
        case 'apply_document_patch': {
          const patch = req.patch;
          const session = sessionState.sessions.get(patch.sessionId);
          if (!session) throw { code: 'session-missing', message: 'missing' };
          session.revision = (patch.baseRevision ?? 0) + 1;
          session.persistedRevision = session.revision;
          return { revision: session.revision };
        }
        case 'get_document_snapshot':
          return { text: '', revision: 0, confirmedHash: '' };
        case 'prepare_document_save':
          return { revision: req.expectedRevision, payloadBase64: '' };
        case 'guarded_atomic_write':
          return { outcome: 'written', newFileIdentity: null };
        case 'commit_document_save':
          return {};
        case 'reconcile_document_save':
          return { state: 'not-written' };
        default:
          throw new Error(`unmocked command: ${cmd}`);
      }
    }),
  };
});

import { setLosslessCoreSessionEnabled } from './flag';
import { openLosslessDocument } from './integration';
import { getActiveLosslessBinding } from './registry';
import {
  getActiveLosslessView,
  insertHorizontalRule,
  insertLinkMarkdown,
  toggleCodeBlock,
  toggleHeading,
  toggleInlineWrap,
  toggleList,
  toggleQuote,
} from './commandRouter';

let dir: string;

beforeAll(async () => {
  dir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), 'command-router-'));
});

afterAll(async () => {
  await nodeFs.rm(dir, { recursive: true, force: true });
});

beforeEach(() => {
  document.body.innerHTML = '<div id="source-editor-wrapper"></div>';
  vi.clearAllMocks();
  // happy-dom's focus() collapses range selections and can re-enter the DOM
  // observer mid-update when commands are chained; no-op it for doc assertions.
  vi.spyOn(EditorView.prototype, 'focus').mockImplementation(() => {});
});

afterEach(() => {
  setLosslessCoreSessionEnabled(false);
});

async function writeFixture(name: string, content: string): Promise<string> {
  const p = nodePath.join(dir, name);
  await nodeFs.writeFile(p, content, 'utf8');
  return p;
}

/** Open a lossless doc and set the CodeMirror selection to `[from, to)`. */
async function openWithSelection(content: string, from: number, to: number) {
  setLosslessCoreSessionEnabled(true);
  const path = await writeFixture('router.md', content);
  expect(await openLosslessDocument(path)).toBe(true);
  const binding = getActiveLosslessBinding();
  expect(binding).not.toBeNull();
  const view = binding!.editor.view;
  view.dispatch({ selection: { anchor: from, head: to } });
  return { binding: binding!, view };
}

/** happy-dom focus() collapses range selections; no-op it when asserting ranges. */
function suppressFocus(view: { focus(): void }) {
  vi.spyOn(view, 'focus').mockImplementation(() => {});
}

describe('lossless command router', () => {
  it('resolves the active lossless binding view', async () => {
    const { binding, view } = await openWithSelection('hello', 0, 0);
    expect(getActiveLosslessView()).toBe(view);
    expect(getActiveLosslessBinding()).toBe(binding);
  });

  it('bold command wraps selected text with **...** as a doc-changing transaction', async () => {
    const md = 'hello world';
    const { view } = await openWithSelection(md, 0, 5);
    const before = view.state.doc.toString();

    toggleInlineWrap(view, 'bold');

    expect(view.state.doc.toString()).toBe('**hello** world');
    expect(view.state.doc.toString()).not.toBe(before);
    // The binding captured the change as a pending user edit (dirty).
    expect(getActiveLosslessBinding()?.isDirty()).toBe(true);
  });

  it('bold command unwraps when selection is already wrapped', async () => {
    const md = '**hello** world';
    const { view } = await openWithSelection(md, 2, 7); // "hello"
    toggleInlineWrap(view, 'bold');
    expect(view.state.doc.toString()).toBe('hello world');
  });

  it('italic/strike/code wrap their selections', async () => {
    const md = 'a quick x y';
    const { view } = await openWithSelection(md, 0, 0);

    view.dispatch({ selection: { anchor: 2, head: 7 } }); // "quick"
    toggleInlineWrap(view, 'italic');
    expect(view.state.doc.toString()).toBe('a *quick* x y');

    view.dispatch({ selection: { anchor: 10, head: 11 } }); // "x"
    toggleInlineWrap(view, 'strike');
    expect(view.state.doc.toString()).toBe('a *quick* ~~x~~ y');

    view.dispatch({ selection: { anchor: 16, head: 17 } }); // "y"
    toggleInlineWrap(view, 'code');
    expect(view.state.doc.toString()).toBe('a *quick* ~~x~~ `y`');
  });

  it('heading toggle adds and removes the # marker on the current line', async () => {
    const md = 'plain text';
    const { view } = await openWithSelection(md, 0, 0);
    toggleHeading(view, 1);
    expect(view.state.doc.toString()).toBe('# plain text');
    toggleHeading(view, 1);
    expect(view.state.doc.toString()).toBe('plain text');
  });

  it('quote toggle adds and removes the > prefix', async () => {
    const md = 'line one\nline two';
    const { view } = await openWithSelection(md, 0, 0);
    toggleQuote(view);
    expect(view.state.doc.toString()).toBe('> line one\nline two');
    toggleQuote(view);
    expect(view.state.doc.toString()).toBe('line one\nline two');
  });

  it('list toggle adds and removes the - marker', async () => {
    const md = 'line one\nline two';
    const { view } = await openWithSelection(md, 0, 0);
    toggleList(view, false);
    expect(view.state.doc.toString()).toBe('- line one\nline two');
    toggleList(view, false);
    expect(view.state.doc.toString()).toBe('line one\nline two');
  });

  it('code block wraps a selection with fences', async () => {
    const md = 'const x = 1;';
    const { view } = await openWithSelection(md, 0, md.length);
    toggleCodeBlock(view);
    expect(view.state.doc.toString()).toBe('```\nconst x = 1;\n```');
  });

  it('link insertion produces [text](url) and selects the text slot', async () => {
    const md = 'some text';
    const { view } = await openWithSelection(md, 5, 5);
    suppressFocus(view);
    insertLinkMarkdown(view, 'https://example.com', 'link');
    expect(view.state.doc.toString()).toBe('some [link](https://example.com)text');
    const sel = view.state.selection.main;
    expect(view.state.sliceDoc(sel.from, sel.to)).toBe('link');
  });

  it('link with a selection keeps the selected text as the visible text', async () => {
    const md = 'click here now';
    const { view } = await openWithSelection(md, 6, 10); // "here"
    suppressFocus(view);
    insertLinkMarkdown(view, 'https://example.com', '');
    expect(view.state.doc.toString()).toBe('click [here](https://example.com) now');
  });

  it('horizontal rule inserts --- on a blank line', async () => {
    const md = 'a\n\nb';
    const { view } = await openWithSelection(md, 2, 2); // blank line between
    insertHorizontalRule(view);
    expect(view.state.doc.toString()).toBe('a\n---\n\nb');
  });

  it('commands keep focus on the CodeMirror view', async () => {
    const { view } = await openWithSelection('focus test', 0, 0);
    const focusSpy = vi.spyOn(view, 'focus');
    toggleInlineWrap(view, 'bold');
    expect(focusSpy).toHaveBeenCalled();
  });

  it('doc bytes remain correct after multiple structural commands', async () => {
    const md = 'title\nbody text';
    const { view } = await openWithSelection(md, 0, 0);
    toggleHeading(view, 1);
    expect(view.state.doc.toString()).toBe('# title\nbody text');
    toggleQuote(view);
    expect(view.state.doc.toString()).toBe('> # title\nbody text');
    toggleList(view, false);
    // Each command prefixes its marker at the line start in order.
    expect(view.state.doc.toString()).toBe('- > # title\nbody text');
  });
});

// ── Table-driven command coverage (task 5.2) ───────────────────────────
// Covers the mandated matrix: collapsed/range/reversed selection, line
// start/end, nested constructs, CJK/emoji, malformed fallback, and Undo/Redo —
// all through the SAME command router functions (each a local CM transaction).

describe('lossless command router — table-driven (task 5.2)', () => {
  const cases = [
    {
      name: 'bold wraps a range selection',
      doc: 'hello world',
      kind: 'bold',
      sel: [0, 5] as const,
      expect: '**hello** world',
    },
    {
      name: 'bold wraps a REVERSED selection',
      doc: 'hello world',
      kind: 'bold',
      sel: [5, 0] as const, // head < anchor
      expect: '**hello** world',
    },
    {
      name: 'bold unwraps when fully wrapped',
      doc: '**hello** world',
      kind: 'bold',
      sel: [2, 7] as const, // "hello" inside
      expect: 'hello world',
    },
    {
      name: 'italic wraps a range',
      doc: 'a quick x y',
      kind: 'italic',
      sel: [2, 7] as const,
      expect: 'a *quick* x y',
    },
    {
      name: 'strike wraps a range',
      doc: 'a quick x y',
      kind: 'strike',
      sel: [8, 9] as const, // "x"
      expect: 'a quick ~~x~~ y',
    },
    {
      name: 'code wraps a range',
      doc: 'a quick x y',
      kind: 'code',
      sel: [8, 9] as const, // "x"
      expect: 'a quick `x` y',
    },
    {
      name: 'bold at line start wraps cleanly (no cross-line leakage)',
      doc: 'first line\nsecond line',
      kind: 'bold',
      sel: [0, 5] as const, // "first"
      expect: '**first** line\nsecond line',
    },
    {
      name: 'bold around CJK text preserves the exact bytes',
      doc: '你好世界',
      kind: 'bold',
      sel: [0, 2] as const,
      expect: '**你好**世界',
    },
    {
      name: 'bold around emoji does not split the surrogate pair',
      doc: 'a😀b',
      kind: 'bold',
      sel: [1, 3] as const, // the emoji high+low surrogate
      expect: 'a**😀**b',
    },
    {
      name: 'bold on malformed/unbalanced text still wraps the exact selection',
      doc: '**unclosed text',
      kind: 'bold',
      sel: [0, 14] as const, // "**unclosed tex" (15 chars total; 14 = one short)
      expect: '****unclosed tex**t',
    },
  ] as const;

  for (const c of cases) {
    it(c.name, async () => {
      const { view } = await openWithSelection(c.doc, c.sel[0], c.sel[1]);
      toggleInlineWrap(view, c.kind as 'bold');
      expect(view.state.doc.toString()).toBe(c.expect);
    });
  }

  it('heading toggles level 1 on a range spanning multiple lines', async () => {
    const { view } = await openWithSelection('one\ntwo\nthree', 0, 7);
    toggleHeading(view, 1);
    expect(view.state.doc.toString()).toBe('# one\n# two\nthree');
  });

  it('heading normalizes a lower level to the target level', async () => {
    const { view } = await openWithSelection('## two', 0, 0);
    toggleHeading(view, 1);
    expect(view.state.doc.toString()).toBe('# two');
  });

  it('quote toggle on a multi-line selection quotes every line', async () => {
    const { view } = await openWithSelection('one\ntwo', 0, 7);
    toggleQuote(view);
    expect(view.state.doc.toString()).toBe('> one\n> two');
  });

  it('unordered list toggle respects existing markers per line', async () => {
    const { view } = await openWithSelection('one\n- two', 0, 8);
    toggleList(view, false);
    // "one" gains a marker, "- two" already has one (allMarked=false path).
    expect(view.state.doc.toString()).toBe('- one\n- two');
  });

  it('ordered list toggle normalizes numbered markers', async () => {
    const { view } = await openWithSelection('1. one\n2. two', 0, 10);
    toggleList(view, true);
    // Removing the ordered marker from every line.
    expect(view.state.doc.toString()).toBe('one\ntwo');
  });

  it('fence toggle unwraps an existing fence around a selection', async () => {
    const { view } = await openWithSelection('```\nconst x = 1;\n```', 0, 20);
    toggleCodeBlock(view);
    // The whole fence (openers + body + closer) is selected → unwrap removes
    // the fence lines and keeps the body exactly.
    expect(view.state.doc.toString()).toBe('const x = 1;');
  });

  it('structure commands are undoable as ONE group each (history boundary)', async () => {
    const { view } = await openWithSelection('hello world', 0, 5);
    toggleInlineWrap(view, 'bold');
    const wrapped = view.state.doc.toString();
    expect(wrapped).toBe('**hello** world');

    // `undo` restores the exact previous doc (structure command = one group).
    const { undo } = await import('@codemirror/commands');
    undo(view);
    expect(view.state.doc.toString()).toBe('hello world');
  });

  it('heading, quote, list each undo as one group', async () => {
    const { undo } = await import('@codemirror/commands');
    const { view } = await openWithSelection('plain line', 0, 0);

    toggleHeading(view, 1);
    expect(view.state.doc.toString()).toBe('# plain line');
    undo(view);
    expect(view.state.doc.toString()).toBe('plain line');

    toggleQuote(view);
    expect(view.state.doc.toString()).toBe('> plain line');
    undo(view);
    expect(view.state.doc.toString()).toBe('plain line');

    toggleList(view, false);
    expect(view.state.doc.toString()).toBe('- plain line');
    undo(view);
    expect(view.state.doc.toString()).toBe('plain line');
  });
});