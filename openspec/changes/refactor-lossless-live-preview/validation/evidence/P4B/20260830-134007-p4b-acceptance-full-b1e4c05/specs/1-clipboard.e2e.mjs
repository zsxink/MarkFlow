// HIGHEST-VALUE ITEM: end-to-end system pasteboard round trip.
//
// What automation already proved: a synthetic ClipboardEvent routed through
// CodeMirror's handlers.copy/cut yields the exact Markdown source.
// What it could NOT prove: after a REAL Cmd+C / Cmd+X in the running desktop
// app, what actually lands in the macOS general pasteboard.
//
// This spec posts real HID keystrokes (CGEvent -> .cghidEventTap, with the
// Command modifier) to the running app and then reads the system pasteboard
// out-of-process with `pbpaste`, comparing raw bytes.

import {
  enableBaseFlags, hidKeys, openDoc, pbpasteBytes, record,
  setFlag, shot, sourceText, workspaceBytes, dumpFindings,
} from '../lib.mjs';

function bytesEqual(a, b) {
  return Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
}

describe('P4B human acceptance — system pasteboard end to end', () => {
  before(async () => {
    await enableBaseFlags();
  });

  it('Cmd+A then Cmd+C puts byte-exact Markdown source on the system pasteboard (fence widget ON)', async () => {
    await openDoc('p4b-widget-fence.md');
    await setFlag('codeFenceControls', true);

    const before = await sourceText();
    record('clipboard.fence.source', before);
    record('clipboard.fence.widgetCount', await browser.execute(() => window.__p4bWidgets?.fenceCount?.() ?? -1));
    record('clipboard.fence.domText', await browser.execute(() => document.querySelector('.source-editor-wrapper .cm-content')?.textContent ?? ''));

    // Real mouse click into the editing surface (WebDriver synthesizes a real
    // mouse event at the element's hit point), then real HID keys.
    await (await $('.source-editor-wrapper .cm-content')).click();
    await browser.pause(300);

    const selectAll = hidKeys('cmd+a');
    record('clipboard.hid.selectAll', selectAll);
    const selection = await browser.execute(() => {
      const el = document.querySelector('.source-editor-wrapper .cm-content');
      const v = el?.cmTile?.view ?? el?.cmView?.view;
      const r = v?.state?.selection?.main;
      return r ? { from: r.from, to: r.to, docLength: v.state.doc.length } : null;
    });
    record('clipboard.fence.selectionAfterCmdA', selection);

    const copy = hidKeys('cmd+c');
    record('clipboard.hid.copy', copy);
    await browser.pause(800);

    const pasted = pbpasteBytes();
    const disk = await workspaceBytes('p4b-widget-fence.md');

    record('clipboard.fence.pastedText', pasted.toString('utf8'));
    record('clipboard.fence.pastedSha256', await browser.execute(async (t) => {
      const buf = new TextEncoder().encode(t);
      const d = await crypto.subtle.digest('SHA-256', buf);
      return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }, pasted.toString('utf8')));
    record('clipboard.fence.pastedLength', pasted.length);
    record('clipboard.fence.sourceLength', Buffer.byteLength(before, 'utf8'));
    record('clipboard.fence.byteIdenticalToInMemoryDoc', bytesEqual(pasted, before));
    record('clipboard.fence.byteIdenticalToDiskFile', bytesEqual(pasted, disk));

    await shot('01-clipboard-fence-copy');

    expect(bytesEqual(pasted, before)).toBe(true);
    expect(bytesEqual(pasted, disk)).toBe(true);
    // The rendered DOM carries widget chrome that must NOT leak into the
    // pasteboard — proof the payload is source, not DOM text.
    expect(pasted.toString('utf8')).not.toContain('复制');
    expect(pasted.toString('utf8')).toContain('```js title="keep"');
  });

  it('Cmd+A then Cmd+X puts source on the pasteboard, empties the doc, and one Cmd+Z restores bytes', async () => {
    await openDoc('p4b-widget-fence.md');
    await setFlag('codeFenceControls', true);
    const before = await sourceText();
    const diskBefore = await workspaceBytes('p4b-widget-fence.md');

    await (await $('.source-editor-wrapper .cm-content')).click();
    await browser.pause(300);
    record('clipboard.hid.cutSequence', [
      hidKeys('cmd+a'),
      hidKeys('cmd+x'),
    ]);
    await browser.pause(800);

    const pasted = pbpasteBytes();
    record('clipboard.cut.pastedText', pasted.toString('utf8'));
    record('clipboard.cut.byteIdenticalToSource', bytesEqual(pasted, before));
    const afterCut = await sourceText();
    record('clipboard.cut.docAfterCut', afterCut);
    record('clipboard.cut.docEmptied', afterCut === '');
    await shot('02-clipboard-fence-cut-emptied');

    // Restore with a real HID Cmd+Z measured immediately, before any autosave
    // tick can write the emptied document.
    record('clipboard.hid.undo', hidKeys('cmd+z'));
    await browser.pause(600);
    const restored = await sourceText();
    record('clipboard.cut.docAfterUndo', restored);
    record('clipboard.cut.undoRestoredBytes', restored === before);
    expect(bytesEqual(pasted, before)).toBe(true);
    expect(restored).toBe(before);

    // Let the autosave window pass, then prove the on-disk bytes were never
    // clobbered by the transient cut.
    await browser.pause(11_000);
    const diskAfter = await workspaceBytes('p4b-widget-fence.md');
    record('clipboard.cut.diskUnchangedAfterAutosaveWindow', bytesEqual(diskBefore, diskAfter));
    expect(bytesEqual(diskBefore, diskAfter)).toBe(true);
  });

  it('partial selection with real HID (Shift+Down) copies a source sub-range, not DOM text', async () => {
    await openDoc('p4b-widget-fence.md');
    await setFlag('codeFenceControls', true);
    const before = await sourceText();

    await (await $('.source-editor-wrapper .cm-content')).click();
    await browser.pause(300);
    // Cmd+Up is "move to document start" under the macOS CodeMirror keymap.
    record('clipboard.hid.partial', [
      hidKeys('cmd+Up'),
      hidKeys('shift+Down', 'shift+Down', 'shift+Down'),
      hidKeys('cmd+c'),
    ]);
    await browser.pause(800);
    const partialSelection = await browser.execute(() => {
      const el = document.querySelector('.source-editor-wrapper .cm-content');
      const v = el?.cmTile?.view ?? el?.cmView?.view;
      const r = v?.state?.selection?.main;
      return r ? { from: r.from, to: r.to } : null;
    });
    record('clipboard.partial.selection', partialSelection);
    const pasted = pbpasteBytes().toString('utf8');
    record('clipboard.partial.pastedText', pasted);
    record('clipboard.partial.isSourceSubstring', before.includes(pasted) && pasted.length > 0);
    record('clipboard.partial.isWholeDoc', pasted === before);
    await shot('03-clipboard-fence-partial-selection');
    expect(pasted.length).toBeGreaterThan(0);
    expect(before).toContain(pasted);
    expect(pasted).not.toBe(before);
  });

  it('baseline document with every P4B flag OFF also copies byte-exact source', async () => {
    await openDoc('p4b-human-plain.md');
    for (const n of ['taskCheckbox', 'codeFenceControls', 'frontmatterPolicy', 'rawHtmlPolicy']) {
      await setFlag(n, false);
    }
    const before = await sourceText();
    record('clipboard.plain.source', before);
    await (await $('.source-editor-wrapper .cm-content')).click();
    await browser.pause(300);
    hidKeys('cmd+a');
    hidKeys('cmd+c');
    await browser.pause(800);
    const pasted = pbpasteBytes();
    const disk = await workspaceBytes('p4b-human-plain.md');
    record('clipboard.plain.pastedText', pasted.toString('utf8'));
    record('clipboard.plain.byteIdenticalToInMemoryDoc', bytesEqual(pasted, before));
    record('clipboard.plain.byteIdenticalToDiskFile', bytesEqual(pasted, disk));
    await shot('04-clipboard-plain-baseline');
    expect(bytesEqual(pasted, before)).toBe(true);
    expect(bytesEqual(pasted, disk)).toBe(true);
  });

  after(async () => {
    await dumpFindings('/tmp/p4b-acc/findings-clipboard.json');
  });
});
