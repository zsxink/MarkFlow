/**
 * P0 corrective characterization — zero-edit open lifecycle rewrites the file.
 *
 * HUMAN HISTORY: before P0S, merely opening a file made the app dirty and
 * autosave rewrote the original file:
 *
 *   open file (zero edits)
 *   → setMarkdown / hydration
 *   → dirty=true
 *   → autosave tick
 *   → original file rewritten on disk
 *
 * P0S (Issue #254 / umbrella refactor-lossless-live-preview) fixed this:
 * hydration and read-only/editable sync no longer bump userRevision, dirty is
 * revision-driven, and the save entrance clean-guards zero-edit documents.
 * The P0 failing evidence remains immutable at
 *   openspec/changes/archive/2026-08-13-p0-lossless-byte-contract/
 *   validation/evidence/P0/20260813-005131-p0-corrective-zeroedit-lifecycle/
 *
 * THIS FILE now verifies the P0S FIX on the historical failing lifecycle: the
 * same real open/initEditor/onUpdate/setEditable/runAutoSaveTick/
 * saveActiveDocument/write_file chain must produce dirty=false, save count=0,
 * unchanged hash/length/mtime and no close prompt. The default-green guard
 * (src/main.lifecycle.guard.test.ts) independently covers the full fixture
 * matrix; this suite keeps the historical-run link and the REAL drive, and
 * still runs only via `npm run test:characterization`.
 *
 * The L1 serializer loss (editing body → trailing newlines/EOL lost) is NOT
 * fixed by P0S and stays a failing characterization in pm-tail-newline.
 * characterization.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import * as nodeFs from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ── Real-fs-backed invoke mock (Tauri IPC boundary only) ───────────────
// Every command that matters for the lifecycle routes to a REAL isolated
// directory on disk. The save path is never mocked.
const state = vi.hoisted(() => ({ writeCount: 0, writeLog: [] as string[] }));

vi.mock('@tauri-apps/api/core', async () => {
  const nodeFsMod = await import('node:fs/promises');
  const { DEFAULT_SETTINGS } = await import('../../src/types/settings');
  return {
    invoke: vi.fn(async (cmd: string, args: any = {}) => {
      switch (cmd) {
        case 'read_file':
          return await nodeFsMod.readFile(args.path, 'utf8'); // read_to_string semantics
        case 'write_file': {
          state.writeCount += 1;
          state.writeLog.push(args.path);
          await nodeFsMod.writeFile(args.path, args.content, 'utf8'); // real byte write
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
          return null;
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

// Real modules — imported after the mock. The lifecycle functions and the
// editor stack are the REAL production code, not test doubles.
import { openFileInEditor, confirmDocumentTransition, isSavingInProgress } from '../../src/components/sidebar.fileops';
import { runAutoSaveTick } from '../../src/main';
import { initEditor } from '../../src/lib/editor.init';
import { store } from '../../src/lib/store';
import { getDocumentState, setEditor, getEditor, getRevision } from '../../src/lib/editor.state';
import { isDocumentDirty } from '../../src/lib/editor';
import { scheduler } from '../../src/lib/taskScheduler';
import { resetActiveImageDraftState } from '../../src/lib/imageUtils';
import * as dialog from '../../src/components/ui/dialog';

const fixtureRoot = nodePath.resolve(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'byte-contract', 'fixtures',
);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
const toHex = (buf: Buffer) => buf.toString('hex');

let tempRoot: string;

beforeAll(async () => {
  tempRoot = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), 'markflow-p0-lifecycle-'));
  // confirmDocumentTransition shows the real close/switch prompt when dirty.
  // Resolve it as "discard" so the test can record that the prompt appeared
  // without blocking on a human click.
  vi.spyOn(dialog, 'showDialog').mockResolvedValue('discard');
});

afterAll(async () => {
  await nodeFs.rm(tempRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  state.writeCount = 0;
  state.writeLog = [];
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

interface EolCounts {
  crlfBefore: number; crlfAfter: number;
  crBefore: number; crAfter: number;
  lfBefore: number; lfAfter: number;
}

interface ByteDiffReport {
  eol: EolCounts;
  trailingBefore: string;
  trailingAfter: string;
  bodyDiffs: { index: number; before: string; after: string }[];
  firstDiffByte: number;
}

/** Itemized byte diff: EOL counts, trailing boundary run, body char changes. */
function analyzeByteDiff(original: Buffer, saved: Buffer): ByteDiffReport {
  const origStr = original.toString('utf8');
  const savedStr = saved.toString('utf8');
  const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
  const eol: EolCounts = {
    crlfBefore: count(origStr, /\r\n/g), crlfAfter: count(savedStr, /\r\n/g),
    crBefore: count(origStr, /(?<!\r)\r/g), crAfter: count(savedStr, /(?<!\r)\r/g),
    lfBefore: count(origStr, /(?<!\r)\n/g), lfAfter: count(savedStr, /(?<!\r)\n/g),
  };
  const trailingBefore = origStr.match(/(?:\r\n|\r|\n)+$/)?.[0] ?? '';
  const trailingAfter = savedStr.match(/(?:\r\n|\r|\n)+$/)?.[0] ?? '';

  // Normalize both to LF and locate the first N body-level differences
  // (e.g. soft break `\n` → ` ` inside a paragraph).
  const normOrig = origStr.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const normSaved = savedStr.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const bodyDiffs: ByteDiffReport['bodyDiffs'] = [];
  const maxLen = Math.min(normOrig.length, normSaved.length);
  for (let i = 0; i < maxLen; i++) {
    if (normOrig[i] !== normSaved[i]) {
      bodyDiffs.push({
        index: i,
        before: normOrig[i] === '\n' ? '\\n' : JSON.stringify(normOrig[i]),
        after: normSaved[i] === '\n' ? '\\n' : JSON.stringify(normSaved[i]),
      });
      if (bodyDiffs.length >= 6) break;
    }
  }
  let firstDiffByte = -1;
  for (let i = 0; i < Math.min(original.length, saved.length); i++) {
    if (original[i] !== saved[i]) { firstDiffByte = i; break; }
  }
  return { eol, trailingBefore, trailingAfter, bodyDiffs, firstDiffByte };
}

describe('P0S fix verification on the P0 corrective zero-edit lifecycle', () => {
  it('product default autosave is enabled (autosave must be ON for this suite)', async () => {
    const { DEFAULT_SETTINGS } = await import('../../src/types/settings');
    expect(DEFAULT_SETTINGS.autosave).toBe(true);
    expect(DEFAULT_SETTINGS.autosaveInterval).toBe(10000);
  });

  // LF tail2/tail3 + CRLF tail2/tail3 — the fixtures human acceptance used.
  const fixtures = ['utf8-lf-tail2', 'utf8-lf-tail3', 'utf8-crlf-tail2', 'utf8-crlf-tail3'];

  for (const id of fixtures) {
    it(`${id}: zero-edit open → two autosave ticks → clean, bytes unchanged, no prompt (P0S fix)`, async () => {
      const { dest, original } = await stageFixture(id);
      const origSha = sha256(original);
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
      (dialog.showDialog as ReturnType<typeof vi.spyOn>).mockClear();
      const transitionOk = await confirmDocumentTransition();
      const showDialogSpy = dialog.showDialog as ReturnType<typeof vi.spyOn>;
      const promptTitle = showDialogSpy.mock.calls[0]?.[0]?.title ?? null;

      // ── Real autosave: two ticks of the real coordinator ──────────
      expect(isSavingInProgress()).toBe(false);
      await runAutoSaveTick();                 // tick 1
      await sleep(100);                        // let real fs settle
      const saveCountAfterTick1 = state.writeCount;
      const dirtyAfterTick1 = isDocumentDirty();

      await runAutoSaveTick();                 // tick 2
      await sleep(100);
      const saveCountAfterTick2 = state.writeCount;
      const dirtyAfterTick2 = isDocumentDirty();

      // ── Read the file back from the real temp dir ─────────────────
      const saved = await nodeFs.readFile(dest);
      const savedSha = sha256(saved);
      const savedMtime = (await nodeFs.stat(dest)).mtimeMs;
      const diff = analyzeByteDiff(original, saved);

      // ── Evidence record (no document content logged) ──────────────
      console.log(`\n[lifecycle] === ${id} ===`);
      console.log(`[lifecycle] original: length=${original.length} sha256=${origSha} mtime=${origMtime.toFixed(1)}`);
      console.log(`[lifecycle] dirty: afterOpen=${dirtyAfterOpen} afterSettle=${dirtyAfterSettle} afterTick1=${dirtyAfterTick1} afterTick2=${dirtyAfterTick2}`);
      console.log(`[lifecycle] revision (transaction-time): afterOpen=${revisionAfterOpen} afterSettle=${revisionAfterSettle}`);
      console.log(`[lifecycle] closePrompt: transitionOk=${transitionOk} dialogTitle=${JSON.stringify(promptTitle)}`);
      console.log(`[lifecycle] saveCount: tick1=${saveCountAfterTick1} tick2=${saveCountAfterTick2} writtenPaths=${JSON.stringify(state.writeLog)}`);
      console.log(`[lifecycle] saved: length=${saved.length} sha256=${savedSha} mtime=${savedMtime.toFixed(1)}`);
      console.log(`[lifecycle] byteDiff: firstDiffByte=${diff.firstDiffByte} crlf=${diff.eol.crlfBefore}->${diff.eol.crlfAfter} cr=${diff.eol.crBefore}->${diff.eol.crAfter} lf=${diff.eol.lfBefore}->${diff.eol.lfAfter}`);
      console.log(`[lifecycle] trailing: before=${JSON.stringify(diff.trailingBefore)} after=${JSON.stringify(diff.trailingAfter)}`);
      console.log(`[lifecycle] bodyDiffs(up to 6): ${JSON.stringify(diff.bodyDiffs)}`);
      console.log(`[lifecycle] originalTailHex=...${toHex(original.slice(-8))} savedTailHex=...${toHex(saved.slice(-8))}`);

      // ── P0S fix assertions: the historical violation is GONE ───────
      expect(dirtyAfterOpen, 'zero-edit open must stay clean (P0S)').toBe(false);
      expect(dirtyAfterSettle, 'UI task settle must stay clean (P0S)').toBe(false);
      expect(dirtyAfterTick1, 'autosave tick1 must stay clean (P0S)').toBe(false);
      expect(dirtyAfterTick2, 'autosave tick2 must stay clean (P0S)').toBe(false);
      expect(revisionAfterOpen, 'hydration must not bump userRevision (P0S)').toBe(0);
      expect(revisionAfterSettle, 'setEditable settle must not bump userRevision (P0S)').toBe(0);
      expect(saveCountAfterTick1, 'autosave tick1 must not write (P0S)').toBe(0);
      expect(saveCountAfterTick2, 'autosave tick2 must not write (P0S)').toBe(0);
      expect(saved.equals(original), 'open alone must NOT rewrite the file bytes (P0S)').toBe(true);
      expect(saved.length).toBe(original.length);
      expect(savedSha).toBe(origSha);
      expect(savedMtime).toBe(origMtime);
      expect(transitionOk, 'clean doc must transition without prompt').toBe(true);
      expect(promptTitle, 'clean doc must show no unsaved prompt').toBeNull();
    });
  }
});
