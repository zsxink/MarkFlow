import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormatCommandLayer, type FormatCommandLayerDeps } from './formatCommandLayer';
import type { CoreSessionState } from '../lib/coreSession';

vi.mock('../lib/logger', () => ({
  logDebug: vi.fn(),
  logException: vi.fn(),
}));

function activeSession(partial: Partial<CoreSessionState> = {}): CoreSessionState {
  return {
    sessionId: 7,
    documentId: 9,
    confirmedRevision: 3,
    persistedRevision: 3,
    pendingCount: 0,
    pendingBytes: 0,
    syncState: 'idle',
    isActive: true,
    filePath: '/tmp/a.md',
    sizeClass: 'normal',
    stats: { lineCount: 1, byteCount: 5 },
    ...partial,
  };
}

function commandResult(revision = 4) {
  return {
    session_id: 7,
    transaction_id: 'fmt-1',
    revision,
    patch: {
      transaction_id: 'fmt-1',
      base_revision: 3,
      changes: [{ from: 1, to: 3, insert: '**b**' }],
      selection_after: null,
    },
    affected_ranges: [{ start: 1, end: 3 }],
    selection_after: { anchor: 5, head: 5 },
  };
}

function createLayer(overrides: Partial<FormatCommandLayerDeps> = {}) {
  let session = activeSession();
  const flush = vi.fn(async () => {
    session = activeSession({ confirmedRevision: 4 });
    return 4;
  });
  const handleResyncSuccess = vi.fn();
  const deps: FormatCommandLayerDeps = {
    viewProvider: vi.fn(() => ({
      state: {
        selection: { main: { anchor: 2, head: 4, from: 2, to: 4 } },
      },
    } as any)),
    getSessionState: vi.fn(() => ({ ...session })),
    getSyncController: vi.fn(() => ({ flush, handleResyncSuccess })),
    bridge: {
      executeEditCommand: vi.fn(async () => commandResult(5)),
      undoDocument: vi.fn(async () => commandResult(6)),
      redoDocument: vi.fn(async () => commandResult(7)),
    },
    applyPatch: vi.fn(),
    markRevisionConfirmed: vi.fn(),
    markBlocked: vi.fn(),
    toast: vi.fn(),
    ...overrides,
  };
  return { layer: new FormatCommandLayer(deps), deps, flush, handleResyncSuccess };
}

describe('FormatCommandLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flushes pending source patches before building and sending a command', async () => {
    const { layer, deps, flush } = createLayer();

    await layer.execute({ type: 'toggle_strong' });

    expect(flush).toHaveBeenCalledOnce();
    expect(deps.bridge.executeEditCommand).toHaveBeenCalledWith(
      7,
      { type: 'toggle_strong', anchor: 2, head: 4 },
      4,
      expect.stringMatching(/^fmt_/),
    );
  });

  it('applies returned patch and selection_after then syncs confirmed revision', async () => {
    const { layer, deps, handleResyncSuccess } = createLayer();

    await layer.execute({ type: 'toggle_emphasis' });

    expect(deps.applyPatch).toHaveBeenCalledWith(
      [{ from: 1, to: 3, insert: '**b**' }],
      { anchor: 5, head: 5 },
    );
    expect(deps.markRevisionConfirmed).toHaveBeenCalledWith(5);
    expect(handleResyncSuccess).toHaveBeenCalledWith(5);
  });

  it('discards stale command results when the session switches before apply', async () => {
    let calls = 0;
    const { layer, deps } = createLayer({
      getSessionState: vi.fn(() => {
        calls += 1;
        if (calls >= 3) return activeSession({ sessionId: 99 });
        return activeSession({ confirmedRevision: calls === 2 ? 4 : 3 });
      }),
    });

    await layer.execute({ type: 'toggle_inline_code' });

    expect(deps.applyPatch).not.toHaveBeenCalled();
    expect(deps.markRevisionConfirmed).not.toHaveBeenCalled();
  });

  it('flushes before undo and applies Core history patch result', async () => {
    const { layer, deps, flush } = createLayer();

    await layer.undo();

    expect(flush).toHaveBeenCalledOnce();
    expect(deps.bridge.undoDocument).toHaveBeenCalledWith(7, expect.stringMatching(/^undo_/), 1);
    expect(deps.applyPatch).toHaveBeenCalled();
  });

  it('sends link display text from the semantic action', async () => {
    const { layer, deps } = createLayer({
      viewProvider: vi.fn(() => ({
        state: {
          selection: { main: { anchor: 4, head: 4, from: 4, to: 4 } },
        },
      } as any)),
    });

    await layer.execute({
      type: 'insert_link',
      href: 'https://example.com/',
      title: null,
      text: 'Example',
    });

    expect(deps.bridge.executeEditCommand).toHaveBeenCalledWith(
      7,
      {
        type: 'insert_link',
        anchor: 4,
        head: 4,
        href: 'https://example.com/',
        title: null,
        text: 'Example',
      },
      4,
      expect.stringMatching(/^fmt_/),
    );
  });

  it('sends code fence selection instead of dropping to cursor-only position', async () => {
    const { layer, deps } = createLayer({
      viewProvider: vi.fn(() => ({
        state: {
          selection: { main: { anchor: 2, head: 8, from: 2, to: 8 } },
        },
      } as any)),
    });

    await layer.execute({ type: 'insert_code_fence', language: null });

    expect(deps.bridge.executeEditCommand).toHaveBeenCalledWith(
      7,
      {
        type: 'insert_code_fence',
        position: 2,
        anchor: 2,
        head: 8,
        language: null,
      },
      4,
      expect.stringMatching(/^fmt_/),
    );
  });
});
