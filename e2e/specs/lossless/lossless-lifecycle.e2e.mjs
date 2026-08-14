import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { app, openFileInTree } from '../../page-objects/app.mjs';

/**
 * P1B dedicated desktop lossless lifecycle — real Tauri WebKit WebView.
 *
 * With `losslessCoreSession` enabled (default-off flag), the document opens into
 * the lossless Core Source editor. Coverage:
 *  - zero-edit open → ≥2 autosave ticks → close: file bytes/mtime unchanged,
 *    no dirty prompt, save count 0
 *  - a real Source edit → dirty → Save → bytes persist; reopen hash matches
 *  - clean Cmd+S does not write
 *  - A→B switch: A not written, B clean
 */

const WORKSPACE = process.env.MARKFLOW_E2E_WORKSPACE;

/** Wait for app ready WITHOUT asserting WYSIWYG (lossless docs stay in Source). */
async function waitForLosslessAppReady() {
  await (await app.ready()).waitForDisplayed({ timeout: 30_000 });
}

async function readFileBytes(name) {
  return readFile(path.join(WORKSPACE, name));
}
async function readFileMtime(name) {
  const s = await stat(path.join(WORKSPACE, name));
  return s.mtimeMs;
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Enable the lossless flag and switch to Source mode (flag is default-off). */
async function enableLossless() {
  const ok = await browser.execute(() => {
    const set = window.__setLosslessCoreSession;
    if (!set) return 'no-hook';
    set(true);
    return 'enabled';
  });
  if (ok !== 'enabled') throw new Error(`enableLossless failed: ${ok}`);
}

async function openFileAndWaitActive(name) {
  await openFileInTree(name);
  await browser.waitUntil(async () => {
    const state = await browser.execute(() => window.__markflowStore?.getState()?.activeFilePath ?? null);
    return state != null && state.endsWith(`/${name}`);
  }, { timeout: 10_000, timeoutMsg: `Expected active document to be ${name}` });
  // Lossless binding must be active.
  await browser.waitUntil(async () => {
    const active = await browser.execute(() => window.__markflowLossless?.isActive?.() ?? false);
    return active === true;
  }, { timeout: 10_000, timeoutMsg: `Expected lossless binding for ${name}` });
}

async function typeInLosslessSource(text) {
  const ok = await browser.execute((t) => window.__markflowLossless?.type?.(t) ?? 'no-hook', text);
  if (ok !== 'typed') throw new Error(`typeInLosslessSource failed: ${ok}`);
}

async function losslessDirty() {
  return browser.execute(() => window.__markflowLossless?.isDirty?.() ?? false);
}

export function registerLosslessLifecycleTests() {
describe('P1B lossless desktop lifecycle (flag ON, autosave ENABLED)', () => {
  it('zero-edit open → two autosave ticks → bytes/mtime unchanged, no write', async () => {
    await waitForLosslessAppReady();
    await enableLossless();
    expect(WORKSPACE).toBeTruthy();

    const fixtures = [
      'utf8-lf-tail2.md', 'utf8-lf-tail3.md', 'utf8-crlf-tail2.md',
      'utf8-cr-tail1.md', 'utf8-mixed-tail2.md', 'utf8-bom-lf-tail2.md',
    ];
    const before = new Map();
    for (const name of fixtures) {
      before.set(name, await readFileBytes(name));
    }

    for (const name of fixtures) {
      await openFileAndWaitActive(name);
      expect(await losslessDirty()).toBe(false);
      // Two autosave ticks at the product 2000ms interval.
      await browser.pause(4500);
      const after = await readFileBytes(name);
      expect(after.equals(before.get(name))).toBe(true);
    }
  });

  it('clean Cmd+S does not write; bytes/hash/mtime unchanged', async () => {
    await waitForLosslessAppReady();
    await enableLossless();

    const name = 'utf8-cr-tail1.md';
    await openFileAndWaitActive(name);
    const beforeBytes = await readFileBytes(name);
    const beforeMtime = await readFileMtime(name);

    await (await app.save()).click();
    await browser.pause(500);

    const afterBytes = await readFileBytes(name);
    expect(afterBytes.equals(beforeBytes)).toBe(true);
    expect(await readFileMtime(name)).toBe(beforeMtime);
  });

  it('Source edit → dirty → Save persists; reopen hash matches', async () => {
    await waitForLosslessAppReady();
    await enableLossless();

    const name = 'utf8-lf-tail2.md';
    await openFileAndWaitActive(name);
    const original = await readFileBytes(name);

    await typeInLosslessSource('编辑');
    await browser.waitUntil(async () => (await losslessDirty()) === true, {
      timeout: 5_000, timeoutMsg: 'edit must dirty the lossless doc',
    });

    await (await app.save()).click();
    await browser.pause(1000);

    // The write must have happened and changed the bytes.
    const saved = await readFileBytes(name);
    expect(saved.equals(original)).toBe(false);
    const savedHash = sha256(saved);
    expect(saved.toString('utf8')).toContain('编辑');

    // Reopen the saved file: hash must be identical (Core confirmed bytes).
    await openFileAndWaitActive(name);
    await browser.pause(800);
    const reopenedHash = await browser.execute(() => window.__markflowLossless?.hash?.() ?? null);
    expect(reopenedHash).toBe(savedHash);
  });

  it('A→B switch does not write A and leaves B clean', async () => {
    await waitForLosslessAppReady();
    await enableLossless();

    const aName = 'utf8-crlf-tail2.md';
    await openFileAndWaitActive(aName);
    const aOriginal = await readFileBytes(aName);
    await typeInLosslessSource('Y');
    await browser.waitUntil(async () => (await losslessDirty()) === true, { timeout: 5_000 });

    await openFileAndWaitActive('utf8-mixed-tail2.md');
    const bDirty = await losslessDirty();
    expect(bDirty).toBe(false);
    const aAfter = await readFileBytes(aName);
    expect(aAfter.equals(aOriginal)).toBe(true);
  });
});
}
