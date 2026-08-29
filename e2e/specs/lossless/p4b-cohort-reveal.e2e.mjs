import { app, openFileInTree } from '../../page-objects/app.mjs';

/**
 * P4B task 7.1/7.2 — per-cohort marker reveal over the real desktop WebView.
 *
 * This file provides the DESKTOP semantic coverage for the five marker cohorts
 * behind the `window.__setP4bFlag` E2E hook. It is registered here but, at the
 * time of the 7.1/7.2 implementation, the authoring box could NOT build/run the
 * real Tauri app (tauri build + WebDriver), so these run and their assertions
 * are written from the unit-level contract (`isConstructRevealed` in
 * projection.ts) — they are NOT yet observed to pass on the desktop.
 *
 * Status: PENDING-MANUAL/ENV. Run them with:
 *   npm run test:e2e:build   # builds the e2e Tauri app (features = e2e)
 *   npm run test:e2e -- lossless
 * A human operator is required to confirm these green on a real WebKit WebView;
 * the unit tests (projection.test.ts "P4B task 7.1/7.2" describes) already lock
 * the same semantics headlessly.
 */

const WORKSPACE = process.env.MARKFLOW_E2E_WORKSPACE;

/** Enable the base lossless + live-preview flags (both default-off). */
async function enableBaseFlags() {
  for (const key of ['__setLosslessCoreSession', '__setLivePreview']) {
    const ok = await browser.execute((k) => {
      const set = window[k];
      if (!set) return 'no-hook';
      set(true);
      return 'enabled';
    }, key);
    if (ok !== 'enabled') throw new Error(`${key} failed: ${ok}`);
  }
}

async function openFileAndWait(name) {
  await openFileInTree(name);
  await browser.waitUntil(async () => {
    const state = await browser.execute(() => window.__markflowStore?.getState()?.activeFilePath ?? null);
    return state != null && state.endsWith(`/${name}`);
  }, { timeout: 10_000, timeoutMsg: `Expected active doc ${name}` });
  await browser.waitUntil(async () => {
    const active = await browser.execute(() => window.__markflowLossless?.isActive?.() ?? false);
    return active === true;
  }, { timeout: 10_000 });
}

/** Read `.mf-active` and `.mf-marker` counts plus raw `.cm-content` text. */
async function revealState() {
  return browser.execute(() => {
    const content = document.querySelector('.source-editor-wrapper .cm-content');
    return {
      active: document.querySelectorAll('.source-editor-wrapper .cm-content span.mf-active').length,
      markers: document.querySelectorAll('.source-editor-wrapper .cm-content span.mf-marker').length,
      text: content?.textContent ?? '',
    };
  });
}

/** Place the caret at a 0-based offset via the lossless selection hook. */
async function placeCaret(offset) {
  const done = await browser.execute(
    (pos) => window.__markflowLossless?.caret?.(pos) ?? 'no-hook',
    offset,
  );
  if (done === 'no-hook') throw new Error('no __markflowLossless.caret hook');
}

async function setP4b(name, on) {
  const ok = await browser.execute(([n, v]) => window.__setP4bFlag?.set?.(n, v) ?? 'no-hook', [name, on]);
  if (ok !== true) throw new Error(`__setP4bFlag.set(${name}) failed: ${ok}`);
}

export function registerP4bCohortRevealTests() {
describe('P4B task 7.1/7.2 — per-cohort marker reveal (PENDING-MANUAL/ENV)', () => {
  before(async () => {
    await enableBaseFlags();
  });
  after(async () => {
    // Restore every cohort to default-OFF for other suites.
    await browser.execute(() => {
      for (const n of ['headingStrong', 'emphasisStrikeInlineCode', 'links', 'quoteLists', 'fence']) {
        window.__setP4bFlag?.set?.(n, false);
      }
      return true;
    });
  });

  it('① headingStrong: a caret in the heading # marker reveals; a far caret weakens it', async () => {
    const name = 'p4b-cohort-heading.md';
    await openFileAndWait(name);
    await (await app.wysiwygMode()).click();
    await setP4b('headingStrong', true);

    // Caret on the `#` delimiter (offset 1) → the heading construct is active.
    await placeCaret(1);
    await browser.pause(150);
    let s = await revealState();
    expect(s.active).toBeGreaterThan(0);
    expect(s.markers).toBe(0);
    // The raw source `# ` is still in .cm-content (lossless: never rewritten).
    expect(s.text.includes('# Heading text')).toBe(true);

    // Caret far away in the body → marker weakens (appears as .mf-marker `#`).
    await placeCaret(s.text.indexOf('plain paragraph'));
    await browser.pause(150);
    s = await revealState();
    expect(s.markers).toBeGreaterThan(0);
  });

  it('② emphasisStrikeInlineCode: a caret in **  reveals; emoji content is UTF-16 safe', async () => {
    const name = 'p4b-cohort-emoji.md';
    await openFileAndWait(name);
    await (await app.wysiwygMode()).click();
    await setP4b('emphasisStrikeInlineCode', true);

    await placeCaret(2); // inside **…**
    await browser.pause(150);
    let s = await revealState();
    expect(s.active).toBeGreaterThan(0);
    // The emoji inside the emphasised span is intact in source.
    expect(s.text.includes('**加粗🚀**')).toBe(true);
  });

  it('③ links: a caret in a `(` delimiter of [text](url) reveals; Select All fully reveals', async () => {
    const name = 'p4b-cohort-link.md';
    await openFileAndWait(name);
    await (await app.wysiwygMode()).click();
    await setP4b('links', true);

    const idx = (await revealState()).text.indexOf('(https://');
    await placeCaret(idx + 1); // inside `(`
    await browser.pause(150);
    const s = await revealState();
    expect(s.active).toBeGreaterThan(0);
  });

  it('④ quoteLists: a caret on `>` reveals the blockquote; blank line does not', async () => {
    const name = 'p4b-cohort-quote.md';
    await openFileAndWait(name);
    await (await app.wysiwygMode()).click();
    await setP4b('quoteLists', true);

    await placeCaret(1); // on `>`
    await browser.pause(150);
    let s = await revealState();
    expect(s.active).toBeGreaterThan(0);
  });

  it('⑤ fence: caret inside the code reveals the fence; no descent into body', async () => {
    const name = 'p4b-cohort-fence.md';
    await openFileAndWait(name);
    await (await app.wysiwygMode()).click();
    await setP4b('fence', true);

    const text = (await revealState()).text;
    const inside = text.indexOf('const x');
    await placeCaret(inside + 1);
    await browser.pause(150);
    let s = await revealState();
    expect(s.active).toBeGreaterThan(0);
    // The fence body is NOT decorated as an inner construct.
    const innerConstructs = await browser.execute(() =>
      document.querySelectorAll('.source-editor-wrapper .cm-content span.mf-construct.mf-fence').length,
    );
    expect(innerConstructs).toBe(1);
    expect(s.text.includes('const x = 1;')).toBe(true);
  });
});
}
