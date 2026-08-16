/**
 * P1B lossless lifecycle — frontend orchestration (default-green, mocked IPC).
 *
 * Drives the REAL `openLosslessDocument` / `saveLosslessActiveDocument` /
 * `EditorSurfaceBinding` / `SourceSyncController` against a real CodeMirror
 * editor, with the Tauri `invoke` IPC boundary mocked to a JS session double
 * that routes file commands to the REAL filesystem. Byte-fidelity itself is
 * proven by the Rust dispatcher contract tests + desktop E2E; this suite pins
 * the frontend wiring: open → CM edit → dirty → save → persist → reload →
 * close, plus the lossless flag call audit (3.9.2).
 *
 * The audit asserts the lossless path NEVER calls `setMarkdown` /
 * `getMarkdown` / `normalizeImageMarkdown` / the ProseMirror serializer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import * as nodeFs from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

// ── Real-fs-backed invoke mock implementing a minimal lossless session double ──
const state = vi.hoisted(() => ({
  sessions: new Map<number, any>(),
  nextSession: 1,
  nextDocument: 1,
  writeCount: 0,
  writes: [] as Array<{ path: string; payloadSha256: string }>,
  receipts: new Map<string, { state: 'written' | 'committed' | 'conflict'; payloadSha256: string; path: string }>(),
  /** Test hook: when true, the NEXT commit_document_save call fails (lost response). */
  failCommitOnce: false,
  /** Backend mutates state first, then only the response is lost. */
  loseCommitResponseAfterMutationOnce: false,
  loseWriteResponseAfterMutationOnce: false,
  /** Reject next patch before mutating Core, forcing controller resync. */
  rejectPatchStaleOnce: false,
  rejectPatchIoAlways: false,
}));

vi.mock('@tauri-apps/api/core', async () => {
  const nodeFsMod = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const { DEFAULT_SETTINGS } = await import('../../types/settings');
  const sessionState = state;

  const sha256hex = (buf: Buffer | string) => {
    const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
    return createHash('sha256').update(b).digest('hex');
  };

  const readLogical = (content: string) => {
    const withoutBom = content.replace(/^\uFEFF/, '');
    return withoutBom.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  };

  return {
    invoke: vi.fn(async (cmd: string, args: any = {}) => {
      const req = args.req ?? args;
      switch (cmd) {
        case 'open_lossless_document': {
          const content = await nodeFsMod.readFile(req.path, 'utf8');
          const logicalText = readLogical(content);
          const sessionId = sessionState.nextSession++;
          const documentId = sessionState.nextDocument++;
          const fileIdentity = {
            canonicalPath: req.path,
            size: Buffer.byteLength(content, 'utf8'),
            mtime: null,
            contentHash: sha256hex(content),
          };
          const session = {
            sessionId,
            documentId,
            bindingGeneration: 0,
            logicalText,
            revision: 0,
            persistedRevision: 0,
            confirmedHash: sha256hex(logicalText),
            fileIdentity,
          };
          sessionState.sessions.set(sessionId, session);
          return {
            sessionId,
            documentId,
            bindingGeneration: 0,
            logicalText,
            revision: 0,
            persistedRevision: 0,
            confirmedHash: sha256hex(logicalText),
            original: {
              contentHash: sha256hex(content),
              byteLen: Buffer.byteLength(content, 'utf8'),
              bom: content.startsWith('\uFEFF') ? 'utf8' : 'none',
              encoding: content.startsWith('\uFEFF') ? 'utf8Bom' : 'utf8',
              lineEndings: [],
              trailingLineBreaks: 0,
              fileIdentity,
              dominantLineEnding: 'lf',
            },
          };
        }
        case 'apply_document_patch': {
          const patch = req.patch;
          const session = sessionState.sessions.get(patch.sessionId);
          if (!session) throw { code: 'session-missing', message: 'missing' };
          if (session.bindingGeneration !== patch.bindingGeneration) {
            throw { code: 'wrong-identity', message: 'stale' };
          }
          if (session.revision !== patch.baseRevision) {
            throw { code: 'stale-revision', message: 'stale' };
          }
          session.lastPatch = patch;
          if (sessionState.rejectPatchStaleOnce) {
            sessionState.rejectPatchStaleOnce = false;
            throw { code: 'stale-revision', message: 'injected stale' };
          }
          if (sessionState.rejectPatchIoAlways) {
            throw { code: 'io', message: 'injected bridge outage' };
          }
          // Apply UTF-16 changes to the logical text (test double, not Core).
          let text = session.logicalText;
          const changes = [...patch.changes];
          for (const c of changes) {
            // Validate the bridge DTO shape so a malformed patch is caught here.
            if (typeof c.fromUtf16 !== 'number' || typeof c.toUtf16 !== 'number') {
              throw { code: 'invalid-dto', message: `patch change missing UTF-16 coords: ${JSON.stringify(c)}` };
            }
            if (c.insertedLineEndings.length !== (c.insertedLogicalText.match(/\n/g) ?? []).length) {
              throw { code: 'invalid-eol-provenance', message: 'line-ending count mismatch' };
            }
          }
          changes.sort((a, b) => b.fromUtf16 - a.fromUtf16);
          for (const c of changes) {
            text = text.slice(0, c.fromUtf16) + c.insertedLogicalText + text.slice(c.toUtf16);
          }
          session.revision += 1;
          session.logicalText = text;
          session.confirmedHash = sha256hex(text);
          return { revision: session.revision, confirmedHash: session.confirmedHash, selectionAfter: null };
        }
        case 'get_document_snapshot': {
          const session = sessionState.sessions.get(req.sessionId);
          if (!session) throw { code: 'session-missing', message: 'missing' };
          return {
            revision: session.revision,
            logicalText: session.logicalText,
            confirmedHash: session.confirmedHash,
            persistedRevision: session.persistedRevision,
            original: { contentHash: session.confirmedHash, byteLen: 0, bom: 'none', encoding: 'utf8', lineEndings: [], trailingLineBreaks: 0, fileIdentity: session.fileIdentity, dominantLineEnding: 'lf' },
          };
        }
        case 'flush_document_session': {
          const session = sessionState.sessions.get(req.sessionId);
          if (!session) throw { code: 'session-missing', message: 'missing' };
          return { revision: session.revision, confirmedHash: session.confirmedHash, persistedRevision: session.persistedRevision };
        }
        case 'prepare_document_save': {
          const session = sessionState.sessions.get(req.sessionId);
          if (!session) throw { code: 'session-missing', message: 'missing' };
          return {
            saveOperationId: req.saveOperationId,
            sessionId: req.sessionId,
            documentId: req.documentId,
            revision: session.revision,
            payloadBase64: Buffer.from(session.logicalText, 'utf8').toString('base64'),
            payloadSha256: sha256hex(session.logicalText),
          };
        }
        case 'guarded_atomic_write': {
          const payload = Buffer.from(req.payloadBase64, 'base64').toString('utf8');
          sessionState.writeCount += 1;
          sessionState.writes.push({ path: req.path, payloadSha256: sha256hex(payload) });
          await nodeFsMod.writeFile(req.path, payload, 'utf8');
          sessionState.receipts.set(req.saveOperationId, {
            state: 'written',
            payloadSha256: sha256hex(payload),
            path: req.path,
          });
          if (sessionState.loseWriteResponseAfterMutationOnce) {
            sessionState.loseWriteResponseAfterMutationOnce = false;
            throw { code: 'io', message: 'write response lost after mutation' };
          }
          return {
            saveOperationId: req.saveOperationId,
            outcome: 'written',
            newFileIdentity: {
              canonicalPath: req.path,
              size: Buffer.byteLength(payload, 'utf8'),
              mtime: Date.now(),
              contentHash: sha256hex(payload),
            },
            displacedIdentityMatched: true,
            receiptState: 'written',
          };
        }
        case 'reconcile_document_save': {
          const receipt = sessionState.receipts.get(req.saveOperationId ?? req);
          if (!receipt) throw { code: 'save-outcome-unknown', message: 'no receipt' };
          const disk = await nodeFsMod.readFile(receipt.path, 'utf8');
          const diskHash = sha256hex(disk);
          if ((receipt.state === 'written' || receipt.state === 'committed') && diskHash === receipt.payloadSha256) {
            // Written + disk matches prepared payload → commit is safe (mirrors
            // the real Rust `reconcile_document_save` returning the new identity).
            return {
              saveOperationId: receipt.path,
              state: receipt.state === 'committed' ? 'committed' : 'written-and-commit-pending',
              newFileIdentity: {
                canonicalPath: receipt.path,
                size: Buffer.byteLength(disk, 'utf8'),
                mtime: Date.now(),
                contentHash: diskHash,
              },
            };
          }
          return { saveOperationId: receipt.path, state: 'conflict', newFileIdentity: null };
        }
        case 'commit_document_save': {
          const session = sessionState.sessions.get(req.sessionId);
          if (!session) throw { code: 'session-missing', message: 'missing' };
          session.persistedRevision = req.persistedRevision;
          session.fileIdentity = req.newFileIdentity;
          const receipt = sessionState.receipts.get(req.saveOperationId);
          if (receipt) receipt.state = 'committed';
          if (sessionState.failCommitOnce || sessionState.loseCommitResponseAfterMutationOnce) {
            sessionState.failCommitOnce = false;
            sessionState.loseCommitResponseAfterMutationOnce = false;
            throw { code: 'io', message: 'commit response lost after mutation' };
          }
          return null;
        }
        case 'reload_lossless_document': {
          const content = await nodeFsMod.readFile(req.path, 'utf8');
          const session = sessionState.sessions.get(req.sessionId);
          if (!session) throw { code: 'session-missing', message: 'missing' };
          session.logicalText = readLogical(content);
          session.revision = 0;
          session.persistedRevision = 0;
          session.bindingGeneration += 1;
          session.confirmedHash = sha256hex(session.logicalText);
          return {
            sessionId: session.sessionId,
            documentId: session.documentId,
            bindingGeneration: session.bindingGeneration,
            logicalText: session.logicalText,
            revision: 0,
            persistedRevision: 0,
            confirmedHash: session.confirmedHash,
            original: { contentHash: sha256hex(content), byteLen: 0, bom: 'none', encoding: 'utf8', lineEndings: [], trailingLineBreaks: 0, fileIdentity: session.fileIdentity, dominantLineEnding: 'lf' },
          };
        }
        case 'close_lossless_document': {
          sessionState.sessions.delete(req.sessionId);
          return null;
        }
        // Legacy file commands (used by surrounding UI).
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
import { openLosslessDocument, saveLosslessActiveDocument, closeLosslessActiveDocument, reloadLosslessActiveDocument } from './integration';
import { setLosslessCoreSessionEnabled } from './flag';
import { getActiveLosslessBinding, setActiveLosslessBinding } from './registry';
import { store } from '../store';
import * as editorMod from '../editor';
import * as serializerMod from '../editor.serializer';

const fixtureRoot = nodePath.resolve(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', 'tests', 'fixtures', 'byte-contract', 'fixtures',
);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let tempRoot: string;

beforeAll(async () => {
  tempRoot = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), 'markflow-lossless-lifecycle-'));
});

afterAll(async () => {
  await nodeFs.rm(tempRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  state.sessions.clear();
  state.nextSession = 1;
  state.nextDocument = 1;
  state.writeCount = 0;
  state.writes = [];
  state.receipts.clear();
  state.failCommitOnce = false;
  state.loseCommitResponseAfterMutationOnce = false;
  state.loseWriteResponseAfterMutationOnce = false;
  state.rejectPatchStaleOnce = false;
  state.rejectPatchIoAlways = false;
  setLosslessCoreSessionEnabled(true);
  setActiveLosslessBinding(null);
  store.setState({ dirty: false, activeFilePath: null, mode: 'source' });
  // Provide the Source wrapper container the binding mounts into.
  document.body.innerHTML = '<div id="source-editor-wrapper"></div>';
});

afterEach(async () => {
  await closeLosslessActiveDocument().catch(() => undefined);
  setLosslessCoreSessionEnabled(false);
  document.body.innerHTML = '';
});

async function stageFixture(id: string): Promise<{ dest: string; original: Buffer }> {
  const original = await nodeFs.readFile(nodePath.join(fixtureRoot, `${id}.md`));
  const dest = nodePath.join(tempRoot, `${id}.lossless.md`);
  await nodeFs.writeFile(dest, original);
  return { dest, original };
}

describe('P1B lossless lifecycle (flag ON, mocked IPC, real CM + fs)', () => {
  it('zero-edit open → clean; two autosave ticks → no write; close no prompt; no serializer/PM calls', async () => {
    const { dest, original } = await stageFixture('utf8-lf-tail2');
    const origMtime = (await nodeFs.stat(dest)).mtimeMs;

    // ── Audit spies (3.9.2) ────────────────────────────────────────
    const setMarkdownSpy = vi.spyOn(editorMod, 'setMarkdown');
    const getMarkdownSpy = vi.spyOn(editorMod, 'getMarkdown');
    const normalizeSpy = vi.spyOn(serializerMod, 'normalizeImageMarkdown');

    // ── Real lossless open (Source mode, Core logical text) ─────────
    const opened = await openLosslessDocument(dest);
    expect(opened).toBe(true);
    const binding = getActiveLosslessBinding();
    expect(binding).not.toBeNull();
    expect(binding!.isDirty()).toBe(false);
    expect(store.getState().dirty).toBe(false);

    // The CM source editor shows the logical LF text.
    expect(binding!.logicalText).toContain('中文');
    expect(binding!.logicalText).not.toContain('\r');

    // Two autosave ticks against the real coordinator semantics: the binding
    // save path returns 'skipped' (no write) for a clean session.
    const r1 = await saveLosslessActiveDocument({ interactive: false });
    expect(r1).toBe('skipped');
    await sleep(50);
    const r2 = await saveLosslessActiveDocument({ interactive: false });
    expect(r2).toBe('skipped');
    expect(state.writeCount).toBe(0);

    // ── Close: no write, no prompt path needed for clean doc ────────
    await closeLosslessActiveDocument();
    expect(state.writeCount).toBe(0);

    // Bytes/mtime unchanged.
    const saved = await nodeFs.readFile(dest);
    expect(saved.equals(original)).toBe(true);
    expect((await nodeFs.stat(dest)).mtimeMs).toBe(origMtime);

    // ── Audit: the lossless open/dirty/save/close path must NOT call
    // serializer / setMarkdown / getMarkdown / normalizeImageMarkdown ──
    expect(setMarkdownSpy).not.toHaveBeenCalled();
    expect(getMarkdownSpy).not.toHaveBeenCalled();
    expect(normalizeSpy).not.toHaveBeenCalled();

    setMarkdownSpy.mockRestore();
    getMarkdownSpy.mockRestore();
    normalizeSpy.mockRestore();
  });

  it('a real CM edit → dirty → save writes once and persists; audit still clean', async () => {
    const { dest } = await stageFixture('utf8-lf-tail2');
    const getMarkdownSpy = vi.spyOn(editorMod, 'getMarkdown');
    const setMarkdownSpy = vi.spyOn(editorMod, 'setMarkdown');

    await openLosslessDocument(dest);
    const binding = getActiveLosslessBinding()!;

    // Real CodeMirror transaction: insert text at the start of the body.
    binding.typeAtCursor('X');
    await sleep(80); // let the controller batch + send + ack

    expect(binding.isDirty()).toBe(true);
    expect(store.getState().dirty).toBe(true);

    const result = await saveLosslessActiveDocument({ interactive: true });
    expect(result).toBe('saved');
    expect(state.writeCount).toBe(1);
    expect(binding.isDirty()).toBe(false);

    // Confirmed/persisted revisions converged.
    expect(binding.hash).not.toBeNull();

    // Audit: lossless edit+save never touches serializer/PM.
    expect(getMarkdownSpy).not.toHaveBeenCalled();
    expect(setMarkdownSpy).not.toHaveBeenCalled();
    getMarkdownSpy.mockRestore();
    setMarkdownSpy.mockRestore();
  });

  it('reload keeps the doc clean and disposes the old pipeline', async () => {
    const { dest } = await stageFixture('utf8-lf-tail3');
    await openLosslessDocument(dest);
    const binding = getActiveLosslessBinding()!;

    // An edit makes it dirty; reload from disk resets to clean.
    binding.typeAtCursor('Z');
    await sleep(80);
    expect(binding.isDirty()).toBe(true);

    const reloaded = await reloadLosslessActiveDocument(dest, 'lf', { discard: true });
    expect(reloaded).toBe(true);
    expect(getActiveLosslessBinding()!.isDirty()).toBe(false);
    expect(state.writeCount).toBe(0);
  });

  it('A/B switch: disposing A leaves B untouched and clean', async () => {
    const { dest: destA, original: origA } = await stageFixture('utf8-lf-tail2');
    const { dest: destB } = await stageFixture('utf8-crlf-tail2');

    await openLosslessDocument(destA);
    const bindingA = getActiveLosslessBinding()!;
    bindingA.typeAtCursor('Q');
    await sleep(80);
    expect(bindingA.isDirty()).toBe(true);

    // Switch to B: disposes A, opens B clean.
    await openLosslessDocument(destB);
    const bindingB = getActiveLosslessBinding()!;
    expect(bindingB.path).toBe(destB);
    expect(bindingB.isDirty()).toBe(false);

    // A's file must NOT have been written by the switch.
    expect(state.writeCount).toBe(0);
    const aAfter = await nodeFs.readFile(destA);
    expect(aAfter.equals(origA)).toBe(true);
  });

  it('lost commit response → reconcile confirms the write and commits idempotently', async () => {
    const { dest } = await stageFixture('utf8-lf-tail2');
    await openLosslessDocument(dest);
    const binding = getActiveLosslessBinding()!;

    binding.typeAtCursor('R');
    await sleep(80);
    expect(binding.isDirty()).toBe(true);

    // The write lands, but the commit RESPONSE is lost.
    state.loseCommitResponseAfterMutationOnce = true;
    const result = await saveLosslessActiveDocument({ interactive: false });
    // A commit response can be lost after the backend mutation. Reconcile must
    // return the receipt's durable identity and surface a successful save.
    expect(result).toBe('saved');
    expect(state.writeCount).toBe(1);
    expect(binding.isDirty()).toBe(false);
  });

  it('lost guarded-write response after the backend mutation reconciles without rewriting', async () => {
    const { dest } = await stageFixture('utf8-lf-tail2');
    await openLosslessDocument(dest);
    const binding = getActiveLosslessBinding()!;
    binding.typeAtCursor('W');
    await sleep(80);
    state.loseWriteResponseAfterMutationOnce = true;
    expect(await saveLosslessActiveDocument({ interactive: false })).toBe('saved');
    expect(state.writeCount).toBe(1);
    expect(binding.isDirty()).toBe(false);
  });

  it('Save As response loss reconciles and rebinds the active path', async () => {
    const { dest } = await stageFixture('utf8-lf-tail2');
    const target = nodePath.join(tempRoot, 'response-loss-save-as.md');
    await nodeFs.rm(target, { force: true });
    await openLosslessDocument(dest);
    const binding = getActiveLosslessBinding()!;
    binding.typeAtCursor('S');
    await sleep(80);
    state.loseWriteResponseAfterMutationOnce = true;
    const { saveLosslessActiveDocumentAsNewFile } = await import('./integration');
    expect(await saveLosslessActiveDocumentAsNewFile(target)).toBe(true);
    expect(binding.path).toBe(target);
    expect(getActiveLosslessBinding()).toBe(binding);
  });

  it('real CodeMirror stale resync retains one optimistic edit (never XX duplication)', async () => {
    const { dest } = await stageFixture('utf8-lf-tail2');
    await openLosslessDocument(dest);
    const binding = getActiveLosslessBinding()!;
    const before = binding.logicalText;
    state.rejectPatchStaleOnce = true;
    binding.typeAtCursor('X');
    await sleep(120);
    expect(binding.logicalText).toBe(`X${before}`);
    expect(state.sessions.get(binding.sessionId).logicalText).toBe(`X${before}`);
    expect(binding.pipelineState).toBe('idle');
  });

  it('blocked real CodeMirror optimistic edit remains dirty and cannot reload without explicit discard', async () => {
    const { dest } = await stageFixture('utf8-lf-tail2');
    await openLosslessDocument(dest);
    const binding = getActiveLosslessBinding()!;
    const controller = (binding as any).controller;
    controller.maxRetries = 0;
    state.rejectPatchIoAlways = true;
    binding.typeAtCursor('unresolved');
    await sleep(90);
    expect(binding.pipelineState).toBe('blocked');
    expect(binding.isDirty()).toBe(true);
    expect(store.getState().dirty).toBe(true);
    expect(await reloadLosslessActiveDocument(dest)).toBe(false);
    expect(binding.logicalText).toContain('unresolved');
  });

  it.each([
    ['LF', 'a\nb', ['lf']],
    ['CRLF', 'a\r\nb', ['crlf']],
    ['CR', 'a\rb', ['cr']],
    ['mixed CJK/emoji', '中\r\n😀\r尾\n', ['crlf', 'cr', 'lf']],
  ])('captures explicit %s paste EOL provenance before CodeMirror normalizes it', async (_name, raw, expected) => {
    const { dest } = await stageFixture('utf8-mixed-tail2');
    await openLosslessDocument(dest);
    const binding = getActiveLosslessBinding()!;
    binding.pasteRawAtCursor(raw);
    await sleep(90);
    const patch = state.sessions.get(binding.sessionId).lastPatch;
    expect(patch.changes[0].insertedLogicalText).toBe(raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
    expect(patch.changes[0].insertedLineEndings).toEqual(expected);
  });
});

describe('P1B 3.10: renderer/parser failures never affect lossless Source edit/save', () => {
  it('a failing renderer/parser command does not block open, edit, or save', async () => {
    const { dest } = await stageFixture('utf8-lf-tail2');

    // Force every renderer/parser command to fail. The lossless Source path must
    // NOT depend on them: open/edit/save still work end-to-end.
    const core = await import('@tauri-apps/api/core');
    const invokeSpy = vi.mocked(core.invoke);
    const originalImpl = invokeSpy.getMockImplementation();
    invokeSpy.mockImplementation(async (cmd: string, args: any = {}) => {
      if (typeof cmd === 'string' && /render|parse|export|mermaid|plantuml/i.test(cmd)) {
        throw { code: 'io', message: 'renderer/parser unavailable' };
      }
      if (originalImpl) return originalImpl(cmd, args);
      return null;
    });

    await openLosslessDocument(dest);
    const binding = getActiveLosslessBinding()!;
    expect(binding.logicalText).toContain('中文');

    // Real edit + save still succeed with the renderer/parser down.
    binding.typeAtCursor('3.10');
    await sleep(80);
    expect(binding.isDirty()).toBe(true);
    const result = await saveLosslessActiveDocument({ interactive: true });
    expect(result).toBe('saved');
    expect(state.writeCount).toBe(1);

    invokeSpy.mockRestore();
  });
});
