import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  save: vi.fn(),
  invoke: vi.fn(),
  getActiveLosslessBinding: vi.fn(),
  reloadLosslessActiveDocument: vi.fn(),
  saveLosslessActiveDocumentAsNewFile: vi.fn(),
  saveLosslessActiveDocument: vi.fn(),
  handleLosslessConflict: vi.fn(),
  showToast: vi.fn(),
  getActiveFilePath: vi.fn(),
}));

vi.mock('../lib/storage', () => ({ writeFile: mocks.writeFile, readFile: vi.fn(), addRecentFile: vi.fn(), authorizeImageStorage: vi.fn(), getFileMetadata: vi.fn() }));
vi.mock('../lib/imageUtils', () => ({ preparePendingImagesForSave: vi.fn(), completePendingImagesSave: vi.fn(), abortPendingImagesSave: vi.fn(), discardActiveImageDraft: vi.fn() }));
vi.mock('../lib/editor', () => ({
  getMarkdown: vi.fn(() => '# legacy'),
  hasExternalModification: vi.fn(() => false),
  isDocumentDirty: vi.fn(() => true),
  markDocumentPersisted: vi.fn(),
  resetEditorScroll: vi.fn(),
  setActiveDocumentPath: vi.fn(),
  setMarkdown: vi.fn(),
  getRevision: vi.fn(() => 1),
  getDocumentGeneration: vi.fn(() => 1),
  getLastReadMtime: vi.fn(() => 0),
  getLastReadSize: vi.fn(() => 0),
  setLastReadStats: vi.fn(),
  getEditor: vi.fn(() => null),
  hasUnpersistedUserChanges: vi.fn(() => true),
}));
vi.mock('../lib/editor.source', () => ({ setSourceReadOnly: vi.fn() }));
vi.mock('./toast', () => ({ showToast: mocks.showToast }));
vi.mock('./fileTree', () => ({ suppressNextWatcherRefresh: vi.fn(), applyFileTreeEvents: vi.fn() }));
vi.mock('./outline', () => ({ refreshOutline: vi.fn() }));
vi.mock('../lib/logger', () => ({ logException: vi.fn(), logInfo: vi.fn(), logDebug: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('./ui/dialog', () => ({ showDialog: vi.fn() }));
vi.mock('./activeDocument', () => ({ getActiveFilePath: mocks.getActiveFilePath, setActiveFilePath: vi.fn() }));
vi.mock('./sidebar.conflict', () => ({
  handleActiveDocumentExternalModification: vi.fn(),
  handleLosslessConflict: mocks.handleLosslessConflict,
}));
vi.mock('../lib/fileSizeTier', () => ({ determineTier: vi.fn(() => 'normal'), formatFileSize: vi.fn() }));
vi.mock('./degradationBar', () => ({ showDegradationBar: vi.fn(), hideDegradationBar: vi.fn() }));
vi.mock('../lib/store', () => ({ store: { setState: vi.fn() } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('../lib/lossless/integration', () => ({
  closeLosslessActiveDocument: vi.fn(),
  isLosslessOpenRecoveryBlocked: vi.fn(() => false),
  isLosslessActiveDoc: vi.fn(() => true),
  openLosslessDocument: vi.fn(() => Promise.resolve(true)),
  reloadLosslessActiveDocument: mocks.reloadLosslessActiveDocument,
  saveLosslessActiveDocument: mocks.saveLosslessActiveDocument,
  saveLosslessActiveDocumentAsNewFile: mocks.saveLosslessActiveDocumentAsNewFile,
}));
vi.mock('../lib/lossless/flag', () => ({ isLosslessCoreSessionEnabled: vi.fn(() => true) }));
vi.mock('../lib/lossless/registry', () => ({
  getActiveLosslessBinding: mocks.getActiveLosslessBinding,
  rebindActiveLosslessPath: vi.fn(),
}));

import { saveActiveDocument, saveActiveDocumentAsNewFile } from './sidebar.fileops';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActiveFilePath.mockReturnValue('/work/note.md');
  mocks.saveLosslessActiveDocument.mockResolvedValue('saved');
  mocks.saveLosslessActiveDocumentAsNewFile.mockResolvedValue('saved');
  mocks.handleLosslessConflict.mockResolvedValue('kept');
  mocks.getActiveLosslessBinding.mockReturnValue(null);
  mocks.reloadLosslessActiveDocument.mockResolvedValue(true);
});

describe('lossless save routing — no dead ends, autosave never forces', () => {
  it('unsupported platform + interactive save → the user reaches the Save Copy exit', async () => {
    mocks.saveLosslessActiveDocument.mockResolvedValue('unsupported');
    mocks.handleLosslessConflict.mockResolvedValue('saved-as');

    await expect(saveActiveDocument({ interactive: true })).resolves.toBe('saved');
    expect(mocks.handleLosslessConflict).toHaveBeenCalledWith('unsupported-platform', {
      allowForce: true,
    });
  });

  it('unsupported platform + autosave → no dialog, no force, no silent overwrite', async () => {
    mocks.saveLosslessActiveDocument.mockResolvedValue('unsupported');

    await expect(saveActiveDocument({ interactive: false })).resolves.toBe('unsupported');
    expect(mocks.handleLosslessConflict).not.toHaveBeenCalled();
    // A plain fallback write would defeat the whole guarded-write guarantee.
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('external conflict + autosave → structured skip, never an unattended force', async () => {
    mocks.saveLosslessActiveDocument.mockResolvedValue('conflict');

    await expect(saveActiveDocument({ interactive: false })).resolves.toBe('conflict');
    expect(mocks.handleLosslessConflict).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('external conflict + interactive save → conflict surface is opened', async () => {
    mocks.saveLosslessActiveDocument.mockResolvedValue('conflict');
    mocks.handleLosslessConflict.mockResolvedValue('reloaded');

    await expect(saveActiveDocument({ interactive: true })).resolves.toBe('skipped');
    expect(mocks.handleLosslessConflict).toHaveBeenCalledWith('save-conflict', {
      allowForce: true,
    });
  });

  it('a failed resolution is reported as a failure, never as saved', async () => {
    mocks.saveLosslessActiveDocument.mockResolvedValue('unsupported');
    mocks.handleLosslessConflict.mockResolvedValue('failed');

    await expect(saveActiveDocument({ interactive: true })).resolves.toBe('failed');
  });
});

describe('lossless Save Copy when create-without-overwrite is unavailable', () => {
  const binding = {
    logicalText: '# lossless 副本内容',
    flushNow: vi.fn(async () => ({ status: 'flushed', revision: 3, confirmedHash: 'h' })),
  };

  it('writes the copy to an absent target', async () => {
    mocks.getActiveLosslessBinding.mockReturnValue(binding);
    mocks.saveLosslessActiveDocumentAsNewFile.mockResolvedValue('unsupported');
    mocks.save.mockResolvedValue('/work/note.copy.md');
    // get_file_stats rejects → the target does not exist.
    mocks.invoke.mockRejectedValue(new Error('missing'));

    await expect(saveActiveDocumentAsNewFile()).resolves.toBe(true);
    expect(mocks.writeFile).toHaveBeenCalledWith('/work/note.copy.md', '# lossless 副本内容');
  });

  it('refuses to clobber a target that already exists', async () => {
    mocks.getActiveLosslessBinding.mockReturnValue(binding);
    mocks.saveLosslessActiveDocumentAsNewFile.mockResolvedValue('unsupported');
    mocks.save.mockResolvedValue('/work/existing.md');
    mocks.invoke.mockResolvedValue({ mtime: 1, size: 2 });

    await expect(saveActiveDocumentAsNewFile()).resolves.toBe(false);
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
});
