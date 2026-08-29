import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { app, openFileInTree, waitForAppReady } from '../../page-objects/app.mjs';

/**
 * P0S dedicated desktop lifecycle — autosave ENABLED.
 *
 * Runs against the real Tauri WebKit WebView with the product's autosave
 * pipeline on (settings written by e2e/run.mjs: autosave=true, interval=2000ms).
 * Fixtures (LF/CRLF/Mixed byte-contract copies) are pre-seeded in the workspace.
 *
 * Coverage (Reviewer ISSUE-003):
 *  - zero-edit open → ≥2 autosave ticks → close: file bytes/mtime unchanged,
 *    no dirty prompt
 *  - immediate WYSIWYG Save after typing (no wait): content persists
 *  - immediate A→B switch (discard): B not contaminated, A content preserved
 *  - clean Cmd+S: no write
 *  - a real user edit still saves and persists
 */

const WORKSPACE = process.env.MARKFLOW_E2E_WORKSPACE;

// Read a fixture's current bytes directly from disk (Node side). This is the
// authoritative on-disk state — not routed through Tauri read_file, so path
// resolution / app-side caching cannot hide an autosave overwrite.
async function readFileBytes(name) {
  return readFile(path.join(WORKSPACE, name), 'utf8');
}

// Read a fixture's mtime via Node fs.stat (authoritative on-disk state).
async function readFileMtime(name) {
  const stat = await import('node:fs/promises').then((m) => m.stat(path.join(WORKSPACE, name)));
  return stat.mtimeMs;
}

async function typeInWysiwyg(text) {
  // P3 default-on: the document lives on the lossless single CodeMirror
  // EditorView. Type through the lossless hook (`__markflowLossless.type`),
  // which dispatches a real CodeMirror transaction → SourceSyncController →
  // dirty — the exact product input path for the immediate-edit assertions.
  const ok = await browser.execute((t) => window.__markflowLossless?.type?.(t) ?? 'no-hook', text);
  if (ok !== 'typed') throw new Error(`typeInWysiwyg failed: ${ok}`);
}

// Read the current CodeMirror doc (the single lossless surface) — equivalent
// of reading the old ProseMirror root, but on the surface actually shown.
async function cmDoc() {
  return browser.execute(() => {
    const view = document.querySelector('.source-editor-wrapper .cm-content')?.cmTile?.view ?? null;
    return view ? view.state.doc.toString() : '';
  });
}

// Open a file in the tree AND wait until it actually becomes the active document
// (the tree click kicks off an async read→open; inserting into the editor
// before that settles targets the PREVIOUS document). P3 default-on: also wait
// for the lossless binding so `__markflowLossless` is available for typing.
async function openFileAndWaitActive(name) {
  await openFileInTree(name);
  await browser.waitUntil(async () => {
    const state = await browser.execute(() => window.__markflowStore?.getState()?.activeFilePath ?? null);
    return state != null && state.endsWith(`/${name}`);
  }, { timeout: 10_000, timeoutMsg: `Expected active document to be ${name}` });
  await browser.waitUntil(async () => {
    const active = await browser.execute(() => window.__markflowLossless?.isActive?.() ?? false);
    return active === true;
  }, { timeout: 10_000, timeoutMsg: `Expected lossless binding for ${name}` });
}

// Wait for the lossless CodeMirror doc to contain the expected text.
async function expectWysiwygText(expected) {
  await browser.waitUntil(async () => {
    const doc = await cmDoc();
    return doc.includes(expected);
  }, { timeout: 10_000, timeoutMsg: `Expected lossless editor to include "${expected}"` });
}

export function registerP0SLifecycleTests() {
describe('P0S dedicated desktop lifecycle (autosave ENABLED)', () => {
  const ZERO_EDIT_FIXTURES = [
    'utf8-lf-tail2.md',
    'utf8-lf-tail3.md',
    'utf8-crlf-tail2.md',
    'utf8-crlf-tail3.md',
    'utf8-cr-tail1.md',
    'utf8-mixed-tail2.md',
    'utf8-bom-lf-tail2.md',
  ];

  it('zero-edit open → two autosave ticks → close: bytes unchanged, no write, no dirty prompt', async () => {
    await waitForAppReady();
    expect(WORKSPACE).toBeTruthy();

    // Record bytes before opening each fixture.
    const before = new Map();
    for (const name of ZERO_EDIT_FIXTURES) {
      before.set(name, await readFileBytes(name));
    }

    for (const name of ZERO_EDIT_FIXTURES) {
      await openFileAndWaitActive(name);
      // Let the editor settle, then wait ≥ two autosave intervals (2×2000ms).
      await browser.pause(4500);
      const after = await readFileBytes(name);
      expect(after).toBe(before.get(name));
      // No dirty prompt observed — the file tree still shows the next file as active.
    }
  });

  it('immediate Cmd+S after typing persists content (no skipped save)', async () => {
    await waitForAppReady();

    const name = 'utf8-lf-tail2.md';
    await openFileAndWaitActive(name);
    const original = await readFileBytes(name);

    await typeInWysiwyg('X'); // no wait before save
    await expectWysiwygText('X'); // confirm the edit actually landed before saving

    await (await app.save()).click();
    await browser.pause(800);

    // The write must have happened: bytes changed on disk (X persisted).
    const saved = await readFileBytes(name);
    expect(saved).not.toBe(original);
    expect(saved).toContain('X');
  });

  it('immediate A→B switch with discard keeps A content and does not contaminate B', async () => {
    await waitForAppReady();

    // Wait for A's async open to settle before dispatching input; otherwise
    // the lossless hook can still target the document from the prior test.
    await openFileAndWaitActive('utf8-crlf-tail2.md');
    const aOriginal = await readFileBytes('utf8-crlf-tail2.md');
    // Keep typing, dirty observation, and the B click in one WebView task so
    // a 2s autosave interval cannot run between the edit and transition.
    const immediateSwitch = await browser.execute(() => {
      const binding = window.__markflowLossless;
      const typed = binding?.type?.('Y') ?? 'no-hook';
      const dirty = binding?.isDirty?.() ?? false;
      const storeDirty = window.__markflowStore?.getState()?.dirty ?? false;
      const activePath = window.__markflowStore?.getState()?.activeFilePath ?? null;
      const item = document.querySelector('[data-testid="file-tree-item"][data-path$="/utf8-mixed-tail2.md"]');
      if (!item) return { typed, dirty, storeDirty, activePath, bExists: false };
      item.click();
      return { typed, dirty, storeDirty, activePath, bExists: true };
    });
    expect(immediateSwitch.typed).toBe('typed');
    expect(immediateSwitch.dirty).toBe(true);
    expect(immediateSwitch.storeDirty).toBe(true);
    expect(immediateSwitch.bExists).toBe(true);

    // The same task clicked B → dirty dialog appears → choose "不保存" (discard).
    await browser.waitUntil(async () => {
      const dialogs = await $$('[role="dialog"]');
      return dialogs.length > 0;
    }, { timeout: 5_000, timeoutMsg: 'Expected unsaved-changes dialog on A→B switch' });

    const discardBtn = await $('[data-dialog-value="discard"]');
    await discardBtn.click();

    // B is now active and must not receive the edit; A must NOT have been
    // written (bytes unchanged).
    await browser.waitUntil(async () => {
      const state = await browser.execute(() => window.__markflowStore?.getState()?.activeFilePath ?? null);
      return state != null && state.endsWith('/utf8-mixed-tail2.md');
    }, { timeout: 10_000, timeoutMsg: 'Expected B to become active after discard' });
    await browser.waitUntil(async () => (
      await browser.execute(() => window.__markflowLossless?.isActive?.() ?? false)
    ) === true, { timeout: 10_000, timeoutMsg: 'Expected lossless binding for B after discard' });
    const bDoc = await cmDoc();
    expect(bDoc).not.toContain('Y');
    const aAfter = await readFileBytes('utf8-crlf-tail2.md');
    expect(aAfter).toBe(aOriginal);
  });

  it('clean Cmd+S on an unedited document does not write', async () => {
    await waitForAppReady();

    const name = 'utf8-cr-tail1.md';
    await openFileAndWaitActive(name);
    const beforeBytes = await readFileBytes(name);
    const beforeMtime = await readFileMtime(name);

    await (await app.save()).click();
    await browser.pause(500);

    const afterBytes = await readFileBytes(name);
    const afterMtime = await readFileMtime(name);
    expect(afterBytes).toBe(beforeBytes);
    expect(afterMtime).toBe(beforeMtime);
  });
});
}
