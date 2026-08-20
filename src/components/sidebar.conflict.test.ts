import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockState, reloadActiveDocumentFromDisk, saveActiveDocumentAsNewFile, showDialog, clearActiveDocument, writeFile, getActiveLosslessBinding, isLosslessCoreSessionEnabled } = vi.hoisted(() => ({
  mockState: {
    activePath: '/workspace/note.md' as string | null,
    dirty: false,
    external: false,
  },
  reloadActiveDocumentFromDisk: vi.fn(),
  saveActiveDocumentAsNewFile: vi.fn(),
  showDialog: vi.fn(),
  clearActiveDocument: vi.fn(),
  writeFile: vi.fn(),
  getActiveLosslessBinding: vi.fn(() => null),
  isLosslessCoreSessionEnabled: vi.fn(() => false),
}));

vi.mock('../lib/storage', () => ({ writeFile }));
vi.mock('../lib/editor', () => ({
  getMarkdown: vi.fn(() => '# current'),
  hasExternalModification: vi.fn(() => mockState.external),
  isDocumentDirty: vi.fn(() => mockState.dirty),
  markDocumentPersisted: vi.fn(),
  markExternalModification: vi.fn(() => { mockState.external = true; }),
}));
vi.mock('./toast', () => ({ showToast: vi.fn() }));
vi.mock('./ui/dialog', () => ({ showDialog }));
vi.mock('./fileTree', () => ({ suppressNextWatcherRefresh: vi.fn(), applyFileTreeEvents: vi.fn(), refreshFileTree: vi.fn() }));
vi.mock('./outline', () => ({ refreshOutline: vi.fn() }));
vi.mock('./activeDocument', () => ({
  getActiveFilePath: vi.fn(() => mockState.activePath),
  clearActiveDocument,
}));
vi.mock('./sidebar.fileops', () => ({ reloadActiveDocumentFromDisk, saveActiveDocumentAsNewFile }));
vi.mock('../lib/lossless/flag', () => ({ isLosslessCoreSessionEnabled }));
vi.mock('../lib/lossless/registry', () => ({ getActiveLosslessBinding }));

import {
  handleActiveDocumentExternalModification,
  handleExternalDeletion,
} from './sidebar.conflict';

beforeEach(() => {
  mockState.activePath = '/workspace/note.md';
  mockState.dirty = false;
  mockState.external = false;
  reloadActiveDocumentFromDisk.mockReset();
  saveActiveDocumentAsNewFile.mockReset();
  showDialog.mockReset();
  clearActiveDocument.mockReset();
  writeFile.mockReset();
  getActiveLosslessBinding.mockReset();
  getActiveLosslessBinding.mockReturnValue(null);
  isLosslessCoreSessionEnabled.mockReset();
  isLosslessCoreSessionEnabled.mockReturnValue(false);
});

describe('external modification conflict decisions', () => {
  it('reloads a clean document from disk', async () => {
    reloadActiveDocumentFromDisk.mockResolvedValue(true);
    await expect(handleActiveDocumentExternalModification()).resolves.toBe('reloaded');
    expect(reloadActiveDocumentFromDisk).toHaveBeenCalledWith({ force: true });
  });

  it('keeps dirty content when the user chooses keep', async () => {
    mockState.dirty = true;
    showDialog.mockResolvedValue('keep');
    await expect(handleActiveDocumentExternalModification()).resolves.toBe('kept');
    expect(reloadActiveDocumentFromDisk).not.toHaveBeenCalled();
  });

  it('clears a clean document when its file is deleted', async () => {
    await expect(handleExternalDeletion('/workspace/note.md')).resolves.toBe('cleared');
    expect(clearActiveDocument).toHaveBeenCalledOnce();
  });

  it('ignores deletion events outside the active document', async () => {
    await expect(handleExternalDeletion('/workspace/other.md')).resolves.toBe('ignored');
    expect(clearActiveDocument).not.toHaveBeenCalled();
  });

  it('resaves a DIRTY lossless doc using the binding logical text, never getMarkdown (reviewer N1)', async () => {
    mockState.dirty = true;
    isLosslessCoreSessionEnabled.mockReturnValue(true);
    const fakeBinding = { logicalText: '![img](local.png)\n\n中文内容', persistedRevision: 3, fileIdentity: null };
    getActiveLosslessBinding.mockReturnValue(fakeBinding as never);

    // User chooses "重新保存"
    showDialog.mockResolvedValue('resave');

    await expect(handleExternalDeletion('/workspace/note.md')).resolves.toBe('resaved');
    // The recreate write uses the lossless binding's logical text — NOT the
    // hidden/empty PM via getMarkdown().
    expect(writeFile).toHaveBeenCalledWith('/workspace/note.md', '![img](local.png)\n\n中文内容');
  });

  it('resaves a dirty LEGACY doc via getMarkdown() (unchanged behavior)', async () => {
    mockState.dirty = true;
    showDialog.mockResolvedValue('resave');

    await expect(handleExternalDeletion('/workspace/note.md')).resolves.toBe('resaved');
    expect(writeFile).toHaveBeenCalledWith('/workspace/note.md', '# current');
  });
});
