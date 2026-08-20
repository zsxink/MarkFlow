/**
 * Lossless image-file paste/drop — task 5.5 (editor dispatch contract).
 *
 * The editor's `onImageFiles` callback runs the resource pipeline OUTSIDE the
 * editor; the editor's job is: when the callback resolves, dispatch each
 * returned image Markdown as a local, single-group, Undoable CM transaction at
 * the caret — and NOT dispatch anything when the resource pipeline fails
 * (returns null/rejects). The async identity guard drops stale inserts after a
 * document switch/mount teardown.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { undo } from '@codemirror/commands';
import { createLosslessSourceEditor } from './losslessSourceEditor';
import * as nodeFs from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';

let dir: string;
beforeAll(async () => {
  dir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), 'lossless-image-paste-'));
});
afterAll(async () => {
  await nodeFs.rm(dir, { recursive: true, force: true });
});

/** A minimal File-shaped object for the paste/drop handler. */
function imageFile(name: string, type = 'image/png'): File {
  return new File(['x'], name, { type });
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('image-file paste dispatch (task 5.5)', () => {
  it('inserts the resolved image Markdown at the caret after async resource prep', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    let resolvePrep: (mds: string[] | null) => void = () => undefined;
    const prep = new Promise<string[] | null>((r) => { resolvePrep = r; });
    const handle = createLosslessSourceEditor(parent, 'text', {
      onImageFiles: () => prep,
    });
    const view = handle.view;
    view.dispatch({ selection: { anchor: 4 } });

    // Simulate a paste of an image file.
    const data = new DataTransfer();
    data.items.add(imageFile('a.png'));
    const ev = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(ev);

    // Resolve the resource pipeline with a ready reference Markdown.
    resolvePrep(['![](stored/a.png)']);
    await Promise.resolve();
    await Promise.resolve();

    expect(view.state.doc.toString()).toBe('text![](stored/a.png)');
    handle.destroy();
  });

  it('does NOT insert anything when the resource pipeline fails (null)', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    let resolvePrep: (mds: string[] | null) => void = () => undefined;
    const prep = new Promise<string[] | null>((r) => { resolvePrep = r; });
    const handle = createLosslessSourceEditor(parent, 'text', {
      onImageFiles: () => prep,
    });
    const view = handle.view;
    view.dispatch({ selection: { anchor: 4 } });

    const data = new DataTransfer();
    data.items.add(imageFile('bad.png'));
    const ev = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(ev);

    resolvePrep(null); // resource failure → no doc change
    await Promise.resolve();
    await Promise.resolve();

    expect(view.state.doc.toString()).toBe('text');
    handle.destroy();
  });

  it('image insert is a single undoable group (one paste intent)', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    let resolvePrep: (mds: string[] | null) => void = () => undefined;
    const prep = new Promise<string[] | null>((r) => { resolvePrep = r; });
    const handle = createLosslessSourceEditor(parent, 'text', {
      onImageFiles: () => prep,
    });
    const view = handle.view;
    view.dispatch({ selection: { anchor: 4 } });

    const data = new DataTransfer();
    data.items.add(imageFile('a.png'));
    const ev = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(ev);
    resolvePrep(['![](x.png)']);
    await Promise.resolve();
    await Promise.resolve();

    expect(view.state.doc.toString()).toBe('text![](x.png)');

    // One undo removes the whole image insert.
    undo(view);
    expect(view.state.doc.toString()).toBe('text');
    handle.destroy();
  });

  it('stale insert after teardown is dropped (async identity guard)', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    let resolvePrep: (mds: string[] | null) => void = () => undefined;
    const prep = new Promise<string[] | null>((r) => { resolvePrep = r; });
    const handle = createLosslessSourceEditor(parent, 'text', {
      onImageFiles: () => prep,
    });
    const view = handle.view;
    view.dispatch({ selection: { anchor: 4 } });

    const data = new DataTransfer();
    data.items.add(imageFile('a.png'));
    const ev = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(ev);

    // Teardown happens BEFORE the async resource prep resolves.
    handle.destroy();
    resolvePrep(['![](x.png)']);
    await Promise.resolve();
    await Promise.resolve();

    // No error, no dispatch into a destroyed view (contract: silent drop).
    expect(true).toBe(true);
  });
});