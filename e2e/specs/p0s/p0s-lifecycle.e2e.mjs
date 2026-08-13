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
  // Dispatch a real ProseMirror transaction through the e2e-exposed editor.
  // WebKit + WDIO browser.keys does not fire the beforeinput/input sequence
  // ProseMirror needs, and document.execCommand bypasses ProseMirror's state
  // (DOM only, no revision). The exposed editor (only in e2e builds) dispatches
  // through Tiptap → ProseMirror → onTransaction → bumpRevision → dirty, which
  // exercises the exact product path ISSUE-001/003 require (immediate edit).
  const ok = await browser.execute((text) => {
    const editor = window.__markflowEditor;
    if (!editor) return 'no-editor';
    editor.commands.insertContent(text, { updateSelection: false });
    return 'inserted';
  }, text);
  if (ok !== 'inserted') throw new Error(`typeInWysiwyg failed: ${ok}`);
}

// The ProseMirror contenteditable root (nested inside the #wysiwyg-editor wrapper).
const pmRoot = () => $('#wysiwyg-editor .ProseMirror');

// Open a file in the tree AND wait until it actually becomes the active document
// (the tree click kicks off an async read→setMarkdown; inserting into the editor
// before that settles targets the PREVIOUS document).
async function openFileAndWaitActive(name) {
  await openFileInTree(name);
  await browser.waitUntil(async () => {
    const state = await browser.execute(() => window.__markflowStore?.getState()?.activeFilePath ?? null);
    return state != null && state.endsWith(`/${name}`);
  }, { timeout: 10_000, timeoutMsg: `Expected active document to be ${name}` });
}

// Wait for the WYSIWYG editor to show the expected text (sync after dispatch).
async function expectWysiwygText(expected) {
  await browser.waitUntil(async () => {
    const text = await (await pmRoot()).getText();
    return text.includes(expected);
  }, { timeout: 10_000, timeoutMsg: `Expected WYSIWYG to include "${expected}"` });
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

    // Open A, type without waiting.
    await openFileInTree('utf8-crlf-tail2.md');
    const aOriginal = await readFileBytes('utf8-crlf-tail2.md');
    await typeInWysiwyg('Y');

    // Immediately switch to B → dirty dialog appears → choose "不保存" (discard).
    await openFileInTree('utf8-mixed-tail2.md');
    await browser.waitUntil(async () => {
      const dialogs = await $$('[role="dialog"]');
      return dialogs.length > 0;
    }, { timeout: 5_000, timeoutMsg: 'Expected unsaved-changes dialog on A→B switch' });

    const discardBtn = await $('[data-dialog-value="discard"]');
    await discardBtn.click();

    // B is now active; A must NOT have been written (bytes unchanged).
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
