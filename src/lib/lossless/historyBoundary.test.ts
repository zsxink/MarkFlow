/**
 * Past History boundary — task 5.6 + 5.5.
 *
 * A single user paste intent must become ONE explicit History group. CM's
 * default `doPaste` dispatches with `userEvent: 'input.paste'` which the
 * history extension MERGES with adjacent typing (`joinableUserEvent` matches
 * `input.paste`). This test pins the lossless editor's paste path: paste
 * followed by immediate typing must undo the typing first, then the paste —
 * each paste intent is an isolated group — AND the raw clipboard EOL
 * provenance is still captured for the bridge.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { undo } from '@codemirror/commands';
import { createLosslessSourceEditor } from './losslessSourceEditor';

type Harness = {
  view: ReturnType<typeof createLosslessSourceEditor>['view'];
  rawPastes: string[];
  destroy(): void;
};

function makeView(doc: string): Harness {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const rawPastes: string[] = [];
  const handle = createLosslessSourceEditor(parent, doc, {
    onRawPasteText: (text) => rawPastes.push(text),
  });
  return {
    view: handle.view,
    rawPastes,
    destroy: () => handle.destroy(),
  };
}

function setCursor(view: Harness['view'], pos: number): void {
  view.dispatch({ selection: { anchor: pos } });
}

function pasteAt(view: Harness['view'], text: string, pos: number): void {
  setCursor(view, pos);
  view.focus();
  const data = new DataTransfer();
  data.setData('text/plain', text);
  const ev = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(ev);
}

describe('paste History boundary + provenance capture (tasks 5.5/5.6)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('a paste followed by adjacent typing undoes as TWO separate groups', () => {
    const { view, rawPastes, destroy } = makeView('hello');

    pasteAt(view, ' WORLD', 5);
    expect(rawPastes).toEqual([' WORLD']);
    expect(view.state.doc.toString()).toBe('hello WORLD');

    // Type '!' immediately (within CM's 500 ms newGroupDelay).
    view.dispatch({ changes: { from: 11, to: 11, insert: '!' }, userEvent: 'input.type' });
    expect(view.state.doc.toString()).toBe('hello WORLD!');

    // Undo #1 removes the typed '!' only — the paste is a separate group.
    undo(view);
    expect(view.state.doc.toString()).toBe('hello WORLD');

    // Undo #2 removes the whole paste.
    undo(view);
    expect(view.state.doc.toString()).toBe('hello');

    destroy();
  });

  it('a CRLF paste captures explicit EOL provenance upstream (raw bytes observed)', () => {
    const { view, rawPastes, destroy } = makeView('a\nb');

    pasteAt(view, 'x\r\ny', 3);
    expect(rawPastes).toEqual(['x\r\ny']);
    // CM normalizes the pasted CRLF to logical LF; the raw CRLF is captured
    // via `onRawPasteText` so the bridge can annotate explicit EOLs.
    expect(view.state.doc.toString()).toBe('a\nbx\ny');

    destroy();
  });

  it('paste does not merge retroactively into typing that preceded it', () => {
    const { view, destroy } = makeView('helo');

    view.dispatch({ changes: { from: 3, to: 3, insert: 'l' }, userEvent: 'input.type' }); // "helo" → "hello"
    pasteAt(view, ' WORLD', 5);

    undo(view); // undo the paste first
    expect(view.state.doc.toString()).toBe('hello');
    undo(view); // then the typed 'l'
    expect(view.state.doc.toString()).toBe('helo');

    destroy();
  });

  it('a structural command after a paste opens its own group', () => {
    const { view, destroy } = makeView('hello');

    pasteAt(view, ' world', 5);
    // Bold command (userEvent: 'command') — must be separable.
    view.dispatch({
      changes: { from: 0, to: 0, insert: '**' },
      selection: { anchor: 0 },
      userEvent: 'command',
    });
    expect(view.state.doc.toString().startsWith('**')).toBe(true);

    undo(view); // undo the bold command
    expect(view.state.doc.toString()).toBe('hello world');
    undo(view); // undo the paste
    expect(view.state.doc.toString()).toBe('hello');

    destroy();
  });

  it('Undo/Redo after catch-up typing composes typing but keeps structural boundaries', () => {
    const { view, destroy } = makeView('ab');

    // Continuous typing (two chars) composes into ONE undo.
    view.dispatch({ changes: { from: 2, to: 2, insert: 'c' }, userEvent: 'input.type' });
    view.dispatch({ changes: { from: 3, to: 3, insert: 'd' }, userEvent: 'input.type' });
    expect(view.state.doc.toString()).toBe('abcd');

    // A structural command after typing opens its own group.
    view.dispatch({
      changes: { from: 0, to: 0, insert: '# ' },
      selection: { anchor: 0 },
      userEvent: 'command',
    });
    expect(view.state.doc.toString()).toBe('# abcd');

    // Undo #1 removes the heading command only.
    undo(view);
    expect(view.state.doc.toString()).toBe('abcd');
    // Undo #2 removes BOTH typed chars in one step (composed typing).
    undo(view);
    expect(view.state.doc.toString()).toBe('ab');

    destroy();
  });
});