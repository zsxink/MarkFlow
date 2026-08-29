/**
 * P0S default-green regression — zero-edit open lifecycle must NOT write.
 *
 * P3 default-on: documents open through the lossless Core path (single CM
 * EditorView). This suite drives the SAME real lifecycle (real `openFileInEditor`,
 * real `openLosslessDocument` attempt + legacy fallback, real Tiptap `initEditor`
 * + `onUpdate`, real `runAutoSaveTick`, real `saveActiveDocument`, real
 * `write_file` IPC to an isolated real temp file) and asserts the P0S contract
 * under the default-on open path: dirty stays false, save count stays 0,
 * hash/length/mtime stay unchanged, and closing shows no unsaved prompt.
 *
 * Note: the invoke mock stub does not implement lossless IPC, so `openLosslessDocument`
 * fails and the product falls back to the legacy open — which exactly exercises the
 * real "lossless open failure → legacy fallback" path and proves zero-edit safety on
 * both sides of that boundary. The lossless-success zero-edit lifecycle is itself
 * covered by `src/lib/lossless/lifecycle.test.ts` (`zero-edit open → clean; two ticks
 * → no write`).
 *
 * This suite is DEFAULT GREEN — it runs in `npm test`.
 * The only mocked boundary is the Tauri `invoke` IPC (Rust is not available
 * under vitest); that mock routes file commands to the REAL filesystem.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import * as nodeFs from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ── Real-fs-backed invoke mock (Tauri IPC boundary only) ───────────────
const state = vi.hoisted(() => ({
  writeCount: 0,
  writeLog: [] as string[],
  writeBarrier: null as Promise<void> | null,
  readBarrier: null as Promise<void> | null,
}));

vi.mock('@tauri-apps/api/core', async () => {
  const nodeFsMod = await import('node:fs/promises');
  const { DEFAULT_SETTINGS } = await import('./types/settings');
  return {
    invoke: vi.fn(async (cmd: string, args: any = {}) => {
      switch (cmd) {
        case 'read_file':
          if (state.readBarrier) await state.readBarrier;
          return await nodeFsMod.readFile(args.path, 'utf8');
        case 'write_file': {
          state.writeCount += 1;
          state.writeLog.push(args.path);
          if (state.writeBarrier) await state.writeBarrier;
          await nodeFsMod.writeFile(args.path, args.content, 'utf8');
          return null;
        }
        case 'get_file_stats': {
          const s = await nodeFsMod.stat(args.path);
          return { mtime: s.mtimeMs, size: s.size };
        }
        case 'file_metadata': {
          const c = await nodeFsMod.readFile(args.path, 'utf8');
          return { size: Buffer.byteLength(c, 'utf8'), lines: c.split(/\r\n|\r|\n/).length, extension: 'md' };
        }
        case 'load_settings':
          return { ...DEFAULT_SETTINGS };
        case 'save_settings':
        case 'add_recent_file':
        case 'add_recent_folder':
        case 'get_workspace':
        case 'set_workspace':
        case 'authorize_image_storage':
        case 'migrate_pending_images':
        case 'cleanup_pending_images':
        case 'get_cached_settings':
          return null;
        default:
          return null;
      }
    }),
  };
});

// Real modules — imported after the mock.
import { openFileInEditor, confirmDocumentTransition, saveActiveDocument, isSavingInProgress, isDocumentTransitionInProgress } from './components/sidebar.fileops';
import { runAutoSaveTick } from './main';
import { initEditor } from './lib/editor.init';
import { store } from './lib/store';
import { getDocumentState, setEditor, getEditor, getRevision, resetDocumentRevision } from './lib/editor.state';
import { isDocumentDirty } from './lib/editor';
import { scheduler } from './lib/taskScheduler';
import { resetActiveImageDraftState } from './lib/imageUtils';
import * as dialog from './components/ui/dialog';

const fixtureRoot = nodePath.resolve(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  '..', 'tests', 'fixtures', 'byte-contract', 'fixtures',
);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

let tempRoot: string;

beforeAll(async () => {
  tempRoot = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), 'markflow-p0s-lifecycle-'));
  // Resolve any real close/switch prompt as "discard" (records that the prompt
  // appeared without blocking on a human click).
  vi.spyOn(dialog, 'showDialog').mockResolvedValue('discard');
});

afterAll(async () => {
  await nodeFs.rm(tempRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  state.writeCount = 0;
  state.writeLog = [];
  state.writeBarrier = null;
  state.readBarrier = null;
  scheduler.cancelAll();
  resetActiveImageDraftState();
  store.setState({
    mode: 'wysiwyg',
    dirty: false,
    activeFilePath: null,
    workspacePath: null,
    readOnly: false,
    autosaveErrorCount: 0,
  });
  const d = getDocumentState();
  d.trailingNewlines = 0;
  d.lastPersistedMarkdown = '';
  d.userRevision = 0;
  d.persistedRevision = 0;
  d.programmaticUpdate = false;
  d.externallyModified = false;
  d.lastReadMtime = 0;
  d.lastReadSize = 0;

  // Real editor with synchronous transaction-origin/revision tracking.
  const area = document.createElement('div');
  area.id = 'editor-area';
  document.body.appendChild(area);
  await initEditor();
});

afterEach(() => {
  getEditor()?.destroy();
  setEditor(null);
  document.body.innerHTML = '';
});

/** Copy a canonical fixture byte-for-byte into an isolated temp file. */
async function stageFixture(id: string): Promise<{ dest: string; original: Buffer }> {
  const original = await nodeFs.readFile(nodePath.join(fixtureRoot, `${id}.md`));
  const dest = nodePath.join(tempRoot, `${id}.opened.md`);
  await nodeFs.writeFile(dest, original);
  return { dest, original };
}

describe('P0S: default-on zero-edit open lifecycle stays clean (default green)', () => {
  it('product default autosave is enabled (this gate must run with autosave ON)', async () => {
    const { DEFAULT_SETTINGS } = await import('./types/settings');
    expect(DEFAULT_SETTINGS.autosave).toBe(true);
    expect(DEFAULT_SETTINGS.autosaveInterval).toBe(10000);
  });

  // LF / CRLF / CR / Mixed EOL / BOM and tail 0..3 boundaries — the full
  // P0 lifecycle fixture matrix. Each is opened with ZERO user edits and
  // driven through two real autosave ticks.
  const fixtures = [
    'utf8-lf-tail0',
    'utf8-lf-tail1',
    'utf8-lf-tail2',
    'utf8-lf-tail3',
    'utf8-crlf-tail1',
    'utf8-crlf-tail2',
    'utf8-crlf-tail3',
    'utf8-cr-tail1',
    'utf8-mixed-tail2',
    'utf8-bom-lf-tail2',
  ];

  for (const id of fixtures) {
    it(`${id}: zero-edit open → two autosave ticks → clean, no write, hash/length/mtime unchanged, no close prompt`, async () => {
      const { dest, original } = await stageFixture(id);
      const origSha = sha256(original);
      const origLen = original.length;
      const origMtime = (await nodeFs.stat(dest)).mtimeMs;

      // ── Real open (no edits) ──────────────────────────────────────
      await openFileInEditor(dest);
      const dirtyAfterOpen = isDocumentDirty();
      const revisionAfterOpen = getRevision();

      // Allow non-authoritative UI refresh tasks to settle.
      await sleep(500);
      const dirtyAfterSettle = isDocumentDirty();
      const revisionAfterSettle = getRevision();

      // ── Close/transition prompt: clean doc must NOT prompt ─────────
      const showDialogSpy = vi.mocked(dialog.showDialog);
      showDialogSpy.mockClear();
      const transitionOk = await confirmDocumentTransition();
      const promptTitle = showDialogSpy.mock.calls[0]?.[0]?.title ?? null;

      // ── Real autosave: two ticks of the real coordinator ──────────
      expect(isSavingInProgress()).toBe(false);
      await runAutoSaveTick();                 // tick 1
      await sleep(100);
      const saveCountAfterTick1 = state.writeCount;
      const dirtyAfterTick1 = isDocumentDirty();

      await runAutoSaveTick();                 // tick 2
      await sleep(100);
      const saveCountAfterTick2 = state.writeCount;
      const dirtyAfterTick2 = isDocumentDirty();

      // ── Read back from the real temp dir ──────────────────────────
      const saved = await nodeFs.readFile(dest);
      const savedSha = sha256(saved);
      const savedLen = saved.length;
      const savedMtime = (await nodeFs.stat(dest)).mtimeMs;

      // Evidence line (no document content is logged — only hashes/numbers).
      console.log(`[p0s] ${id}: len=${origLen}/${savedLen} sha=${origSha.slice(0,16)} saved=${savedSha.slice(0,16)} mtimeDelta=${(savedMtime-origMtime).toFixed(1)}ms dirty=${dirtyAfterOpen}/${dirtyAfterSettle}/${dirtyAfterTick1}/${dirtyAfterTick2} rev=${revisionAfterOpen}/${revisionAfterSettle} saves=${saveCountAfterTick1}/${saveCountAfterTick2} prompt=${JSON.stringify(promptTitle)}`);

      // ── P0S contract assertions ────────────────────────────────────
      expect(dirtyAfterOpen, 'zero-edit open must stay clean').toBe(false);
      expect(dirtyAfterSettle, 'UI task settle must stay clean').toBe(false);
      expect(dirtyAfterTick1, 'autosave tick1 must stay clean').toBe(false);
      expect(dirtyAfterTick2, 'autosave tick2 must stay clean').toBe(false);
      expect(revisionAfterOpen, 'hydration must not bump userRevision').toBe(0);
      expect(revisionAfterSettle, 'setEditable/UI settle must not bump userRevision').toBe(0);
      expect(saveCountAfterTick1, 'autosave tick1 must not write').toBe(0);
      expect(saveCountAfterTick2, 'autosave tick2 must not write').toBe(0);
      expect(saved.equals(original), 'open alone must NOT rewrite the file bytes').toBe(true);
      expect(savedLen).toBe(origLen);
      expect(savedSha).toBe(origSha);
      expect(savedMtime).toBe(origMtime); // mtime unchanged (no write)
      expect(transitionOk, 'clean doc must transition without prompt').toBe(true);
      expect(promptTitle, 'clean doc must show no unsaved prompt').toBeNull();
    });
  }

  it('read-only → editable toggles do not dirty or write a zero-edit doc', async () => {
    const { dest, original } = await stageFixture('utf8-lf-tail2');
    const origMtime = (await nodeFs.stat(dest)).mtimeMs;

    await openFileInEditor(dest);
    await sleep(500);

    // The real product read-only toggle path (e.g. huge-tier readonly preview
    // → force open) is setReadOnly() → editor.setEditable(!readOnly, emitUpdate
    // =false) + setSourceReadOnly(). It must not dirty a zero-edit doc.
    const { setSourceReadOnly } = await import('./lib/editor.source');
    const { getEditor: getEd } = await import('./lib/editor.state');
    // Enter read-only.
    store.setState({ readOnly: true });
    getEd()!.setEditable(false, /* emitUpdate */ false);
    setSourceReadOnly(true);
    // Back to editable.
    store.setState({ readOnly: false });
    getEd()!.setEditable(true, /* emitUpdate */ false);
    setSourceReadOnly(false);
    // Allow non-authoritative UI refresh tasks to settle.
    await sleep(500);

    expect(isDocumentDirty()).toBe(false);
    expect(getRevision()).toBe(0);
    expect(state.writeCount).toBe(0);
    const saved = await nodeFs.readFile(dest);
    expect(saved.equals(original)).toBe(true);
    expect((await nodeFs.stat(dest)).mtimeMs).toBe(origMtime);
  });

  it('A/B document switch keeps both docs clean and unwritten', async () => {
    const { dest: destA, original: origA } = await stageFixture('utf8-lf-tail2');
    const { dest: destB, original: origB } = await stageFixture('utf8-crlf-tail2');
    const mtimeA = (await nodeFs.stat(destA)).mtimeMs;
    const mtimeB = (await nodeFs.stat(destB)).mtimeMs;

    await openFileInEditor(destA);
    await sleep(300);
    await openFileInEditor(destB);
    await sleep(300);
    await runAutoSaveTick();
    await sleep(100);

    expect(isDocumentDirty()).toBe(false);
    expect(state.writeCount).toBe(0);
    expect((await nodeFs.readFile(destA)).equals(origA)).toBe(true);
    expect((await nodeFs.readFile(destB)).equals(origB)).toBe(true);
    expect((await nodeFs.stat(destA)).mtimeMs).toBe(mtimeA);
    expect((await nodeFs.stat(destB)).mtimeMs).toBe(mtimeB);
  });

  it('an immediate A→B switch after a WYSIWYG edit is blocked before debounce time', async () => {
    const { dest: destA } = await stageFixture('utf8-lf-tail2');
    const { dest: destB } = await stageFixture('utf8-crlf-tail2');

    await openFileInEditor(destA);
    getEditor()!.commands.insertContentAt(0, 'X');

    expect(getRevision()).toBe(1);
    expect(isDocumentDirty()).toBe(true);
    vi.mocked(dialog.showDialog).mockResolvedValueOnce('cancel');
    await openFileInEditor(destB);

    expect(store.getState().activeFilePath).toBe(destA);
    expect(state.writeCount).toBe(0);
  });

  it('autosave skips while a transition decision is pending and resumes after cancel', async () => {
    const { dest } = await stageFixture('utf8-lf-tail2');
    await openFileInEditor(dest);
    getEditor()!.commands.insertContentAt(0, 'Y');
    expect(isDocumentDirty()).toBe(true);

    let resolveDialog!: (value: 'cancel') => void;
    vi.mocked(dialog.showDialog).mockImplementationOnce(() => new Promise((resolve) => {
      resolveDialog = resolve;
    }));
    const transition = confirmDocumentTransition();
    await Promise.resolve();
    expect(isDocumentTransitionInProgress()).toBe(true);

    await runAutoSaveTick();
    expect(state.writeCount).toBe(0);

    resolveDialog('cancel');
    await expect(transition).resolves.toBe(false);
    expect(isDocumentTransitionInProgress()).toBe(false);

    await runAutoSaveTick();
    expect(state.writeCount).toBe(1);
  });

  it('keeps autosave blocked through the deferred open after discard', async () => {
    const { dest: destA } = await stageFixture('utf8-lf-tail2');
    const { dest: destB } = await stageFixture('utf8-crlf-tail2');
    await openFileInEditor(destA);
    getEditor()!.commands.insertContentAt(0, 'Y');
    expect(isDocumentDirty()).toBe(true);

    let releaseRead!: () => void;
    state.readBarrier = new Promise<void>((resolve) => { releaseRead = resolve; });
    vi.mocked(dialog.showDialog).mockResolvedValueOnce('discard');

    const opening = openFileInEditor(destB);
    await Promise.resolve();
    expect(isDocumentTransitionInProgress()).toBe(true);

    await runAutoSaveTick();
    expect(state.writeCount).toBe(0);

    releaseRead();
    await opening;
    expect(store.getState().activeFilePath).toBe(destB);
    expect(isDocumentTransitionInProgress()).toBe(false);
    expect(state.writeCount).toBe(0);
  });

  it('reload from disk keeps the reloaded doc clean', async () => {
    const { dest, original } = await stageFixture('utf8-lf-tail3');
    const origMtime = (await nodeFs.stat(dest)).mtimeMs;

    await openFileInEditor(dest);
    await sleep(300);

    // Simulate an external reload path (reloadActiveDocumentFromDisk force).
    const { reloadActiveDocumentFromDisk } = await import('./components/sidebar.fileops');
    await reloadActiveDocumentFromDisk({ force: true });
    await sleep(500);

    expect(isDocumentDirty()).toBe(false);
    expect(getRevision()).toBe(0);
    expect(state.writeCount).toBe(0);
    const saved = await nodeFs.readFile(dest);
    expect(saved.equals(original)).toBe(true);
    expect((await nodeFs.stat(dest)).mtimeMs).toBe(origMtime);
  });

  it('clean interactive Ctrl+S returns skipped and does not serialize or write', async () => {
    const { dest, original } = await stageFixture('utf8-mixed-tail2');
    const origMtime = (await nodeFs.stat(dest)).mtimeMs;

    await openFileInEditor(dest);
    await sleep(500);
    resetDocumentRevision(); // ensure clean per revision model

    // Spy the serializer/write boundary: getMarkdown must NOT be called.
    const editorMod = await import('./lib/editor');
    const getMarkdownSpy = vi.spyOn(editorMod, 'getMarkdown');

    const result = await saveActiveDocument({ interactive: true });

    expect(result).toBe('skipped');
    expect(getMarkdownSpy).not.toHaveBeenCalled(); // no serializer call
    expect(state.writeCount).toBe(0);              // no write
    const saved = await nodeFs.readFile(dest);
    expect(saved.equals(original)).toBe(true);
    expect((await nodeFs.stat(dest)).mtimeMs).toBe(origMtime);
    getMarkdownSpy.mockRestore();
  });

  // ── 1S.6: one real user transaction must still dirty / save / persist ──
  it('a real user edit enters dirty, saves, and persists its revision', async () => {
    const { dest, original } = await stageFixture('utf8-lf-tail2');
    const origMtime = (await nodeFs.stat(dest)).mtimeMs;

    // Real open (zero edits) → clean.
    await openFileInEditor(dest);
    await sleep(500);
    expect(isDocumentDirty()).toBe(false);
    expect(getRevision()).toBe(0);

    // Real user edit: revision and dirty must update in the same transaction
    // turn, before a Cmd+S / switch / close can run.
    getEditor()!.commands.insertContentAt(0, 'X');

    const revisionAfterEdit = getRevision();
    expect(isDocumentDirty(), 'real user edit must set dirty').toBe(true);
    expect(revisionAfterEdit, 'real user edit must bump userRevision').toBeGreaterThan(0);

    // Real save through the coordinator path (interactive) must write once and
    // converge persistedRevision to the current userRevision.
    const beforeSaveCount = state.writeCount;
    const result = await saveActiveDocument({ interactive: true });
    await sleep(100);
    expect(result).toBe('saved');
    expect(state.writeCount).toBe(beforeSaveCount + 1);
    expect(isDocumentDirty(), 'save must clear dirty').toBe(false);
    // persistedRevision now equals userRevision (clean).
    const { hasUnpersistedUserChanges } = await import('./lib/editor');
    expect(hasUnpersistedUserChanges()).toBe(false);

    // The file was written (mtime/hash changed — a REAL edit save is expected).
    const saved = await nodeFs.readFile(dest);
    const savedMtime = (await nodeFs.stat(dest)).mtimeMs;
    console.log(`[p0s-user-edit] len=${original.length}/${saved.length} sha=${sha256(original).slice(0,16)}/${sha256(saved).slice(0,16)} mtimeChanged=${savedMtime !== origMtime} revAfterEdit=${revisionAfterEdit}`);
    expect(saved.equals(original), 'real edit save must change bytes').toBe(false);
    expect(savedMtime).not.toBe(origMtime);
    // Legacy serializer loss (soft break → space) is EXPECTED here and must NOT
    // be presented as fixed: the P0 L1 failing characterization stays red in
    // `npm run test:characterization`.
  });

  it('an edit arriving during write stays dirty after the older revision is persisted', async () => {
    const { dest } = await stageFixture('utf8-lf-tail2');
    await openFileInEditor(dest);

    getEditor()!.commands.insertContentAt(0, 'X');
    expect(getRevision()).toBe(1);

    let releaseWrite!: () => void;
    state.writeBarrier = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const firstSave = saveActiveDocument({ interactive: true });
    await vi.waitFor(() => expect(state.writeCount).toBe(1));

    getEditor()!.commands.insertContentAt(1, 'Y');
    expect(getRevision()).toBe(2);
    expect(isDocumentDirty()).toBe(true);

    releaseWrite();
    state.writeBarrier = null;
    await expect(firstSave).resolves.toBe('saved');
    expect(isDocumentDirty(), 'newer edit must survive old save completion').toBe(true);

    await expect(saveActiveDocument({ interactive: true })).resolves.toBe('saved');
    expect(isDocumentDirty()).toBe(false);
  });

  it('P0S must not silently flip the L1 failing characterization to green', async () => {
    // The L1 serializer-loss suite is intentionally kept in the characterization
    // config (tests/byte-contract/pm-tail-newline.characterization.test.ts) and
    // still asserts the baseline VIOLATION. This guard just documents that P0S
    // does not remove or invert it.
    const { readFile } = await import('node:fs/promises');
    const charFile = nodePath.resolve(
      nodePath.dirname(fileURLToPath(import.meta.url)),
      '..', 'tests', 'byte-contract', 'pm-tail-newline.characterization.test.ts',
    );
    const src = await readFile(charFile, 'utf8');
    expect(src).toContain('THIS SUITE IS EXPECTED TO FAIL');
    expect(src).toContain('baseline MUST fail L1');
    expect(src).not.toContain('toBe(true)'); // the failing expectation must not be inverted
  });
});
