import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockState, showDialog, reloadActiveDocumentFromDisk, saveActiveDocumentAsNewFile, writeFile, getActiveLosslessBinding, isLosslessCoreSessionEnabled, markDocumentPersisted } = vi.hoisted(() => ({
  mockState: { activePath: '/workspace/note.md' as string | null },
  showDialog: vi.fn(),
  reloadActiveDocumentFromDisk: vi.fn(),
  saveActiveDocumentAsNewFile: vi.fn(),
  writeFile: vi.fn(),
  getActiveLosslessBinding: vi.fn(),
  isLosslessCoreSessionEnabled: vi.fn(),
  markDocumentPersisted: vi.fn(),
}));

vi.mock('../lib/storage', () => ({ writeFile }));
vi.mock('../lib/editor', () => ({
  getMarkdown: vi.fn(() => '# legacy'),
  hasExternalModification: vi.fn(() => false),
  isDocumentDirty: vi.fn(() => false),
  markDocumentPersisted,
  markExternalModification: vi.fn(),
}));
vi.mock('./toast', () => ({ showToast: vi.fn() }));
vi.mock('./ui/dialog', () => ({ showDialog }));
vi.mock('./fileTree', () => ({ suppressNextWatcherRefresh: vi.fn(), applyFileTreeEvents: vi.fn() }));
vi.mock('./outline', () => ({ refreshOutline: vi.fn() }));
vi.mock('./activeDocument', () => ({
  getActiveFilePath: vi.fn(() => mockState.activePath),
  clearActiveDocument: vi.fn(),
}));
vi.mock('./sidebar.fileops', () => ({ reloadActiveDocumentFromDisk, saveActiveDocumentAsNewFile }));
vi.mock('../lib/lossless/flag', () => ({ isLosslessCoreSessionEnabled }));
vi.mock('../lib/lossless/registry', () => ({ getActiveLosslessBinding }));

import { handleLosslessConflict } from './sidebar.conflict';

/** Minimal stand-in for the active EditorSurfaceBinding. */
function makeBinding(overrides: { dirty?: boolean; text?: string } = {}) {
  let conflict = false;
  return {
    logicalText: overrides.text ?? '# lossless 内容',
    isDirty: vi.fn(() => overrides.dirty ?? true),
    flushNow: vi.fn(async () => ({ status: 'flushed', revision: 2, confirmedHash: 'h' })),
    markExternalConflict: vi.fn(() => { conflict = true; }),
    hasExternalConflict: vi.fn(() => conflict),
    clearExternalConflict: vi.fn(() => { conflict = false; }),
  };
}

beforeEach(() => {
  mockState.activePath = '/workspace/note.md';
  showDialog.mockReset();
  reloadActiveDocumentFromDisk.mockReset();
  saveActiveDocumentAsNewFile.mockReset();
  writeFile.mockReset();
  markDocumentPersisted.mockReset();
  getActiveLosslessBinding.mockReset();
  isLosslessCoreSessionEnabled.mockReset();
  isLosslessCoreSessionEnabled.mockReturnValue(true);
});

describe('lossless conflict exits (design 04 §4)', () => {
  it('dirty + external modification → reload disk version is a reachable exit', async () => {
    const binding = makeBinding({ dirty: true });
    getActiveLosslessBinding.mockReturnValue(binding);
    showDialog.mockResolvedValue('reload');
    reloadActiveDocumentFromDisk.mockResolvedValue(true);

    await expect(handleLosslessConflict('external-modification')).resolves.toBe('reloaded');
    // The dead-end guard (dirty → reload refused without force) is bypassed by
    // an explicit user decision, never by autosave.
    expect(reloadActiveDocumentFromDisk).toHaveBeenCalledWith({ force: true });
  });

  it('dirty + save conflict → save copy writes to another path instead of overwriting', async () => {
    getActiveLosslessBinding.mockReturnValue(makeBinding({ dirty: true }));
    showDialog.mockResolvedValue('save-copy');
    saveActiveDocumentAsNewFile.mockResolvedValue(true);

    await expect(handleLosslessConflict('save-conflict')).resolves.toBe('saved-as');
    expect(saveActiveDocumentAsNewFile).toHaveBeenCalledOnce();
    expect(reloadActiveDocumentFromDisk).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('unsupported-platform offers Save Copy and no reload (reload would drop the edits)', async () => {
    getActiveLosslessBinding.mockReturnValue(makeBinding({ dirty: true }));
    showDialog.mockResolvedValue('cancel');

    await expect(handleLosslessConflict('unsupported-platform')).resolves.toBe('kept');

    const options = showDialog.mock.calls[0][0] as { buttons: Array<{ value: string }> };
    const values = options.buttons.map((b) => b.value);
    expect(values).toContain('save-copy');
    expect(values).not.toContain('reload');
  });

  it('force overwrite is offered only when the caller explicitly allows it', async () => {
    getActiveLosslessBinding.mockReturnValue(makeBinding({ dirty: true }));

    showDialog.mockResolvedValue('cancel');
    await handleLosslessConflict('unsupported-platform');
    const withoutAllow = showDialog.mock.calls[0][0] as { buttons: Array<{ value: string }> };
    expect(withoutAllow.buttons.map((b) => b.value)).not.toContain('force');

    showDialog.mockClear();
    showDialog.mockResolvedValue('cancel');
    await handleLosslessConflict('unsupported-platform', { allowForce: true });
    const withAllow = showDialog.mock.calls[0][0] as { buttons: Array<{ value: string }> };
    expect(withAllow.buttons.map((b) => b.value)).toContain('force');
  });

  it('force overwrite is not offered when there is nothing of the user to overwrite with', async () => {
    getActiveLosslessBinding.mockReturnValue(makeBinding({ dirty: false }));
    showDialog.mockResolvedValue('cancel');

    await handleLosslessConflict('save-conflict', { allowForce: true });

    const options = showDialog.mock.calls[0][0] as { buttons: Array<{ value: string }> };
    expect(options.buttons.map((b) => b.value)).not.toContain('force');
  });

  it('force overwrite writes the binding text in place and rebinds the session', async () => {
    const binding = makeBinding({ dirty: true, text: '# 本地版本' });
    getActiveLosslessBinding.mockReturnValue(binding);
    showDialog.mockResolvedValue('force');
    reloadActiveDocumentFromDisk.mockResolvedValue(true);

    await expect(handleLosslessConflict('save-conflict', { allowForce: true })).resolves.toBe('forced');
    expect(writeFile).toHaveBeenCalledWith('/workspace/note.md', '# 本地版本');
    expect(reloadActiveDocumentFromDisk).toHaveBeenCalledWith({ force: true });
  });

  it('a second prompt is not stacked while one is already open', async () => {
    getActiveLosslessBinding.mockReturnValue(makeBinding({ dirty: true }));
    let releaseDialog: ((value: string) => void) | undefined;
    showDialog.mockImplementation(
      () => new Promise<string>((resolve) => { releaseDialog = resolve; }),
    );

    const first = handleLosslessConflict('external-modification');
    await expect(handleLosslessConflict('external-modification')).resolves.toBe('ignored');
    expect(showDialog).toHaveBeenCalledOnce();
    releaseDialog?.('cancel');
    await expect(first).resolves.toBe('kept');
  });

  it('does nothing without an active lossless session', async () => {
    getActiveLosslessBinding.mockReturnValue(null);
    await expect(handleLosslessConflict('save-conflict')).resolves.toBe('ignored');
    expect(showDialog).not.toHaveBeenCalled();
  });
});
