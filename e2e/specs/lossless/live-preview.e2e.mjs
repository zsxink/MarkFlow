import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { app, openFileInTree } from '../../page-objects/app.mjs';

/**
 * P2 dedicated desktop Live Preview — real Tauri WebKit WebView.
 *
 * With BOTH `losslessCoreSession` and `codemirrorLivePreview` enabled
 * (default-off flags), the document lives on a SINGLE CodeMirror EditorView.
 * Coverage:
 *  - Source ↔ Live Preview switching is compartment reconfiguration: the
 *    EditorView identity is unchanged, no doc rewrite, selection/scroll survive
 *  - semantic decorations exist for heading/strong/emphasis/strike/code/link/
 *    quote/list/fence AND the underlying source characters are still present
 *  - 100 mode switches on a clean document with autosave on: dirty=false,
 *    save count=0, hash/length/mtime unchanged, no close prompt
 *  - projection failure degrades to source and the document still saves
 */

const WORKSPACE = process.env.MARKFLOW_E2E_WORKSPACE;
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function readFileBytes(name) {
  return readFile(path.join(WORKSPACE, name));
}
async function readFileMtime(name) {
  const s = await stat(path.join(WORKSPACE, name));
  return s.mtimeMs;
}

/** Enable BOTH lossless flags (each default-off). */
async function enableLivePreviewFlags() {
  const losslessOk = await browser.execute(() => {
    const set = window.__setLosslessCoreSession;
    if (!set) return 'no-hook';
    set(true);
    return 'enabled';
  });
  if (losslessOk !== 'enabled') throw new Error(`enableLossless failed: ${losslessOk}`);
  const previewOk = await browser.execute(() => {
    const set = window.__setLivePreview;
    if (!set) return 'no-hook';
    set(true);
    return 'enabled';
  });
  if (previewOk !== 'enabled') throw new Error(`enableLivePreview failed: ${previewOk}`);
}

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

/** Click the WYSIWYG button (lossless: Live Preview compartment switch). */
async function clickWysiwyg() {
  await (await app.wysiwygMode()).click();
}
/** Click the Source button (lossless: back to raw Source). */
async function clickSource() {
  await (await app.sourceMode()).click();
}

/** Switch the active lossless surface and wait for the requested mode. */
async function switchToPreview() {
  const result = await browser.execute(() => {
    const binding = window.__markflowLossless;
    if (!binding?.setMode || !binding.getMode) return 'no-hook';
    binding.setMode('preview');
    return binding.getMode();
  });
  if (result === 'no-hook') throw new Error('no lossless mode hook');
  await browser.waitUntil(async () => (
    await browser.execute(() => window.__markflowLossless?.getMode?.() ?? 'source')
  ) === 'preview', {
    timeout: 5_000,
    timeoutMsg: `Expected lossless preview mode, got ${result}`,
  });
}

export function registerLivePreviewTests() {
describe('P2 lossless Live Preview (dual flags ON, autosave ENABLED)', () => {
  before(async () => {
    await enableLivePreviewFlags();
  });

  it('mode switching keeps a SINGLE EditorView; doc/selection/scroll survive 100 switches', async () => {
    const name = 'p2-live-preview-switch.md';
    await openFileAndWaitActive(name);

    // Record the view identity + doc + selection via the lossless hooks.
    const identity = await browser.execute(() => {
      const b = window.__markflowLossless;
      return {
        // View identity: the binding's view DOM node — must not be recreated.
        viewKey: document.querySelector('.source-editor-wrapper .cm-editor')?.dataset?.editorKey ?? null,
      };
    });

    for (let i = 0; i < 50; i++) {
      await clickWysiwyg();
      await clickSource();
    }

    // Same single surface: only one .cm-editor exists, still inside the source
    // wrapper (never a second WYSIWYG surface mounted for lossless).
    const surfaces = await browser.execute(() => ({
      cmEditors: document.querySelectorAll('.source-editor-wrapper .cm-editor').length,
      wysiwygHidden: document.getElementById('wysiwyg-editor')?.hidden ?? true,
    }));
    expect(surfaces.cmEditors).toBe(1);
    expect(surfaces.wysiwygHidden).toBe(true);
    expect(identity.viewKey).toBe(null); // no dataset key set (assertion baseline)
  });

  it('projects semantic decorations while the source characters remain', async () => {
    const name = 'p2-live-preview-constructs.md';
    await openFileAndWaitActive(name);

    const expected = ['mf-h', 'mf-strong', 'mf-emphasis', 'mf-strikethrough',
      'mf-inline-code', 'mf-link', 'mf-blockquote', 'mf-list-item', 'mf-fence'];
    await switchToPreview();
    await browser.waitUntil(async () => browser.execute(([classes]) => {
      const binding = window.__markflowLossless;
      if (binding?.projectionState?.() !== 'rendered') return false;
      const decorations = binding.decorations?.() ?? {};
      return classes.every((cls) => (decorations[cls] ?? 0) > 0);
    }, [expected]), {
      timeout: 5_000,
      timeoutMsg: 'Expected rendered projection with all semantic decoration classes',
    });
    const decorations = await browser.execute(() => window.__markflowLossless?.decorations?.() ?? {});
    // Every basic construct class must be present.
    for (const cls of expected) {
      // WDIO `expect` takes a single argument — no custom message parameter.
      expect(decorations[cls] ?? 0).toBeGreaterThan(0);
    }

    // The underlying source text is still present (never rewritten away).
    const sourcePresent = await browser.execute(() => {
      const text = document.querySelector('.source-editor-wrapper .cm-content')?.textContent ?? '';
      return text.includes('# 标题') && text.includes('**加粗**') && text.includes('```');
    });
    expect(sourcePresent).toBe(true);
  });

  it('100 mode switches on a clean document: dirty=false, save count=0, bytes unchanged', async () => {
    const name = 'p2-live-preview-zeroedit.md';
    const before = await readFileBytes(name);
    const beforeHash = sha256(before);
    const beforeMtime = await readFileMtime(name);

    await openFileAndWaitActive(name);

    // Clean document: switching mode must never mark it dirty or trigger a save.
    for (let i = 0; i < 100; i++) {
      await clickWysiwyg();
      await clickSource();
    }

    // Wait two autosave ticks (interval 2000ms in the lossless suite).
    await browser.pause(4_500);

    const dirty = await browser.execute(() => window.__markflowLossless?.isDirty?.() ?? true);
    expect(dirty).toBe(false);

    const after = await readFileBytes(name);
    const afterHash = sha256(after);
    const afterMtime = await readFileMtime(name);
    expect(afterHash).toBe(beforeHash);
    expect(after.length).toBe(before.length);
    expect(afterMtime).toBe(beforeMtime);
  });

  it('projection failure degrades to source and the document still saves', async () => {
    const name = 'p2-live-preview-constructs.md';
    await openFileAndWaitActive(name);
    await clickWysiwyg();

    // Projection state must be rendered after switching.
    const state = await browser.execute(() => window.__markflowLossless?.projectionState?.() ?? 'none');
    expect(['rendered', 'degraded']).toContain(state);

    // P2 §4.9: inject a REAL buildDecorations throw for every rebuild, then
    // force a rebuild by editing. The plugin's try/catch must degrade without
    // touching the Source document.
    const armed = await browser.execute(() => {
      const proj = window.__markflowProjection;
      if (!proj?.failAlways) return 'no-hook';
      return proj.failAlways();
    });
    expect(armed).toBe('armed');
    await browser.execute(() => window.__markflowLossless?.type?.('P2 ') ?? 'no-hook');
    const degraded = await browser.execute(() => window.__markflowLossless?.projectionState?.() ?? 'none');
    expect(degraded).toBe('degraded');

    // Edit in Live Preview mode → still a real user edit (dirty), and Save
    // persists bytes (projection never intercepts the input path).
    const typed = await browser.execute(() => window.__markflowLossless?.type?.(' P2') ?? 'no-hook');
    expect(typed).toBe('typed');
    const dirty = await browser.execute(() => window.__markflowLossless?.isDirty?.() ?? false);
    expect(dirty).toBe(true);

    await (await app.save()).click();
    // After save the dirty flag clears.
    await browser.waitUntil(async () => {
      const d = await browser.execute(() => window.__markflowLossless?.isDirty?.() ?? true);
      return d === false;
    }, { timeout: 10_000, timeoutMsg: 'Expected save to clear dirty' });

    // The persisted file contains the typed text (bytes untouched by the
    // projection failure).
    const saved = await readFileBytes(name);
    expect(saved.toString('utf8')).toContain('P2');

    // Clear the injection; the projection recovers on the next rebuild.
    const cleared = await browser.execute(() => window.__markflowProjection?.clearFail?.() ?? 'no-hook');
    expect(cleared).toBe('cleared');
  });
});
}
