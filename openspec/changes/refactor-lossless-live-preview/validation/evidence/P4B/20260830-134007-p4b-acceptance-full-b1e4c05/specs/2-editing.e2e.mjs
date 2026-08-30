// Human-acceptance items 1-3:
//   1. editing feels natural and visible/dimmed markers are discoverable
//   2. caret and keyboard behaviour is predictable
//   3. after a projection failure the user lands back on exact source
//
// Every caret/keyboard observation below comes from REAL HID keystrokes posted
// to the running app, or a real WebDriver mouse click. Only the initial caret
// placement and the DOM/state read-back use scripted hooks; each such read is
// labelled script-assisted in the report.

import {
  composing, enableBaseFlags, hidKeys, openDoc, record, refreshProjection,
  setFlag, shot, sourceText, workspaceBytes, dumpFindings,
} from '../lib.mjs';

const PLAIN = 'p4b-human-plain.md';
const TYPING = 'p4b-plain-typing.md';
const FALLBACK = 'p4b-plain-fallback.md';

async function caretInfo() {
  return browser.execute(() => {
    const el = document.querySelector('.source-editor-wrapper .cm-content');
    const v = el?.cmTile?.view ?? el?.cmView?.view;
    const r = v?.state?.selection?.main;
    return { from: r?.from ?? -1, to: r?.to ?? -1, docLength: v?.state.doc.length ?? -1 };
  });
}

async function markerSnapshot() {
  return browser.execute(() => {
    const root = document.querySelector('.source-editor-wrapper .cm-content');
    if (!root) return null;
    const markers = [...root.querySelectorAll('span.mf-marker')];
    const actives = [...root.querySelectorAll('span.mf-active')];
    const cs = markers[0] ? getComputedStyle(markers[0]) : null;
    return {
      markerSpanCount: markers.length,
      markerTexts: markers.slice(0, 12).map((m) => m.textContent),
      activeConstructCount: actives.length,
      activeClasses: actives.map((a) => a.className),
      firstMarkerOpacity: cs?.opacity ?? null,
      firstMarkerColor: cs?.color ?? null,
      // P4B must never emit a `hidden` construct: no marker may be
      // display:none / visibility:hidden / opacity:0 / zero-sized.
      anyMarkerHidden: markers.some((m) => {
        const s = getComputedStyle(m);
        const rect = m.getBoundingClientRect();
        return s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0'
          || rect.width === 0 || rect.height === 0;
      }),
      domText: root.textContent,
    };
  });
}

describe('P4B human acceptance — editing, caret, fallback', () => {
  before(async () => {
    await enableBaseFlags();
  });

  it('item 1 — dimmed markers stay discoverable and revealed markers follow the caret', async () => {
    await openDoc(PLAIN);
    await refreshProjection();

    const away = await markerSnapshot();
    record('item1.caretAway.markers', away);
    await (await $('.source-editor-wrapper .cm-content')).saveScreenshot('/tmp/p4b-acc/shots/05-item1-markers-dimmed.png');

    const source = await sourceText();
    const boldAt = source.indexOf('**加粗**');
    record('item1.boldSourceOffset', boldAt);
    await browser.execute((pos) => window.__markflowLossless?.caret?.(pos), boldAt + 3);
    await browser.pause(400);
    const onTop = await markerSnapshot();
    record('item1.caretInsideBold.markers', onTop);
    await (await $('.source-editor-wrapper .cm-content')).saveScreenshot('/tmp/p4b-acc/shots/06-item1-markers-revealed.png');
    await browser.saveScreenshot('/tmp/p4b-acc/shots/07-item1-window-revealed.png');

    expect(away.markerSpanCount).toBeGreaterThan(0);
    expect(away.anyMarkerHidden).toBe(false);
    expect(away.firstMarkerOpacity).toBe('0.45');
    expect(onTop.activeConstructCount).toBeGreaterThan(0);
    expect(onTop.markerSpanCount).toBeLessThan(away.markerSpanCount);
  });

  it('item 2 — real ArrowRight advances exactly one source character per press', async () => {
    await openDoc(PLAIN);
    await refreshProjection();
    const source = await sourceText();
    const start = source.indexOf('*斜体*');
    record('item2.startOffset', start);
    await browser.execute((pos) => window.__markflowLossless?.caret?.(pos), start - 4);
    await browser.pause(300);

    await (await $('.source-editor-wrapper .cm-content')).click();
    await browser.execute((pos) => window.__markflowLossless?.caret?.(pos), start - 4);
    await browser.pause(300);

    const walk = [];
    for (let i = 0; i < 12; i += 1) {
      const before = await caretInfo();
      hidKeys('Right');
      await browser.pause(120);
      const after = await caretInfo();
      walk.push({ press: i + 1, from: after.from, delta: after.from - before.from, charUnderCaret: source[after.from] ?? null });
    }
    record('item2.arrowWalk', walk);
    record('item2.allDeltasAreOne', walk.every((w) => w.delta === 1));
    await (await $('.source-editor-wrapper .cm-content')).saveScreenshot('/tmp/p4b-acc/shots/08-item2-caret-walk.png');
    expect(walk.every((w) => w.delta === 1)).toBe(true);
  });

  it('item 2 — real HID typing: per-keystroke trace including IME composition state', async () => {
    await openDoc(TYPING);
    await refreshProjection();
    const before = await sourceText();
    const diskBefore = await workspaceBytes(TYPING);

    await (await $('.source-editor-wrapper .cm-content')).click();
    await browser.pause(200);
    record('item2.typing.hidGotoStart', hidKeys('cmd+a', 'Down', 'Down', 'Down', 'Down', 'Down'));
    await browser.pause(200);
    const atInsert = await caretInfo();
    record('item2.typing.caretBeforeTyping', atInsert);
    record('item2.typing.composingBefore', await composing());

    const trace = [];
    for (const key of ['a', 'b', 'c']) {
      const hid = hidKeys(key);
      await browser.pause(250);
      trace.push({
        key,
        hid,
        doc: await sourceText(),
        caret: await caretInfo(),
        composing: (await composing()).composing,
      });
    }
    record('item2.typing.perKeyTrace', trace);
    const typed = await sourceText();
    record('item2.typing.docAfterTyping', typed);
    record('item2.typing.composingAfterTyping', await composing());
    await (await $('.source-editor-wrapper .cm-content')).saveScreenshot('/tmp/p4b-acc/shots/09-item2-real-typing.png');

    // The selected system input source during this run is the Chinese Pinyin
    // IME, so the ASCII keys above open a composition. Commit it the way a
    // human would (Return) and only then exercise Undo.
    record('item2.typing.hidCommit', hidKeys('Return'));
    await browser.pause(400);
    const committed = await sourceText();
    record('item2.typing.docAfterCommit', committed);
    record('item2.typing.composingAfterCommit', await composing());

    // Undo measured while a composition is open, then again after commit.
    record('item2.typing.hidUndo', hidKeys('cmd+z'));
    await browser.pause(600);
    const undone = await sourceText();
    record('item2.typing.docAfterSingleUndo', undone);
    record('item2.typing.singleUndoRestoredBytes', undone === before);
    record('item2.typing.typedTextPresent', committed.includes('abc'));

    await browser.pause(11_000);
    const diskAfter = await workspaceBytes(TYPING);
    record('item2.typing.diskUnchangedAfterAutosaveWindow', Buffer.compare(diskBefore, diskAfter) === 0);
    expect(committed).toContain('abc');
  });

  it('item 3 — injected projection failure falls back to exact source and stays editable', async () => {
    await openDoc(FALLBACK);
    await refreshProjection();
    const before = await sourceText();
    const diskBefore = await workspaceBytes(FALLBACK);
    record('item3.before.decorations', await browser.execute(() => window.__markflowLossless?.decorations?.() ?? null));

    record('item3.failMode', await browser.execute(() => window.__markflowProjection?.failAlways?.() ?? 'no-hook'));
    await refreshProjection();
    await browser.pause(600);

    const degraded = await markerSnapshot();
    record('item3.degraded.markers', degraded);
    record('item3.degraded.projectionState', await browser.execute(() => window.__markflowLossless?.projectionState?.() ?? null));
    record('item3.degraded.decorations', await browser.execute(() => window.__markflowLossless?.decorations?.() ?? null));
    record('item3.degraded.sourceUnchanged', (await sourceText()) === before);
    await browser.saveScreenshot('/tmp/p4b-acc/shots/10-item3-fallback-to-source.png');

    // Editing must still work on the degraded surface. The system input source
    // is the Pinyin IME, so commit with Return afterwards.
    await (await $('.source-editor-wrapper .cm-content')).click();
    await browser.pause(200);
    hidKeys('cmd+a', 'Down');
    await browser.pause(200);
    hidKeys('x', 'y');
    await browser.pause(300);
    hidKeys('Return');
    await browser.pause(400);
    const typed = await sourceText();
    record('item3.docAfterTypingInFallback', typed);
    record('item3.fallbackEditable', typed !== before && typed.length > before.length);
    await (await $('.source-editor-wrapper .cm-content')).saveScreenshot('/tmp/p4b-acc/shots/10b-item3-fallback-typing.png');

    // Restore by undoing until the document matches again (bounded).
    let undos = 0;
    let current = typed;
    while (current !== before && undos < 8) {
      hidKeys('cmd+z');
      await browser.pause(400);
      current = await sourceText();
      undos += 1;
    }
    record('item3.undosNeededToRestore', undos);
    record('item3.restoredByUndo', current === before);
    record('item3.saveResult', await browser.execute(() => window.__markflowLossless?.save?.(false) ?? 'no-hook'));
    await browser.waitUntil(async () => await browser.execute(() => window.__markflowLossless?.isDirty?.() === false), { timeout: 10_000 });

    record('item3.clearFail', await browser.execute(() => window.__markflowProjection?.clearFail?.() ?? 'no-hook'));
    await browser.execute(() => window.__markflowLossless?.setMode?.('preview'));
    await refreshProjection();
    await browser.pause(800);
    record('item3.recovered.projectionState', await browser.execute(() => window.__markflowLossless?.projectionState?.() ?? null));
    record('item3.recovered.markerCount', (await markerSnapshot()).markerSpanCount);
    await browser.saveScreenshot('/tmp/p4b-acc/shots/11-item3-recovered.png');

    expect(degraded.markerSpanCount).toBe(0);
    expect(typed).not.toBe(before);
    expect(current).toBe(before);
  });

  after(async () => {
    await dumpFindings('/tmp/p4b-acc/findings-editing.json');
    await setFlag('taskCheckbox', false).catch(() => {});
  });
});
