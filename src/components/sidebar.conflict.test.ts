import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockState, reloadActiveDocumentFromDisk, saveActiveDocumentAsNewFile, showDialog, clearActiveDocument } = vi.hoisted(() => ({
  mockState: {
    activePath: '/workspace/note.md' as string | null,
    dirty: false,
    external: false,
  },
  reloadActiveDocumentFromDisk: vi.fn(),
  saveActiveDocumentAsNewFile: vi.fn(),
  showDialog: vi.fn(),
  clearActiveDocument: vi.fn(),
}));

vi.mock('../lib/storage', () => ({ writeFile: vi.fn() }));
vi.mock('../lib/editor', () => ({
  getMarkdown: vi.fn(() => '# current'),
  hasExternalModification: vi.fn(() => mockState.external),
  isDocumentDirty: vi.fn(() => mockState.dirty),
  markDocumentPersisted: vi.fn(),
  markExternalModification: vi.fn(() => { mockState.external = true; }),
}));
vi.mock('./toast', () => ({ showToast: vi.fn() }));
vi.mock('./ui/dialog', () => ({ showDialog }));
vi.mock('./fileTree', () => ({ suppressNextWatcherRefresh: vi.fn(), refreshFileTree: vi.fn() }));
vi.mock('./outline', () => ({ refreshOutline: vi.fn() }));
vi.mock('./activeDocument', () => ({
  getActiveFilePath: vi.fn(() => mockState.activePath),
  clearActiveDocument,
}));
vi.mock('./sidebar.fileops', () => ({ reloadActiveDocumentFromDisk, saveActiveDocumentAsNewFile }));

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
});
