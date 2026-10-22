import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockState, reloadActiveDocumentFromDisk, saveActiveDocumentAsNewFile, showDialog, clearActiveDocument, discardCurrentDocumentTabInOperation } = vi.hoisted(() => ({
  mockState: {
    activePath: '/workspace/note.md' as string | null,
    dirty: false,
    external: false,
    operationTail: Promise.resolve() as Promise<unknown>,
  },
  reloadActiveDocumentFromDisk: vi.fn(),
  saveActiveDocumentAsNewFile: vi.fn(),
  showDialog: vi.fn(),
  clearActiveDocument: vi.fn(),
  discardCurrentDocumentTabInOperation: vi.fn(),
}));

const { getMarkdownResult, writeFile, showToast } = vi.hoisted(() => ({
  getMarkdownResult: vi.fn<() => any>(() => ({ ok: true, markdown: '# current' })),
  writeFile: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../lib/storage', () => ({ writeFile }));
vi.mock('../lib/editor', () => ({
  getMarkdownResult,
  hasExternalModification: vi.fn(() => mockState.external),
  isDocumentDirty: vi.fn(() => mockState.dirty),
  markDocumentPersisted: vi.fn(),
  markExternalModification: vi.fn(() => { mockState.external = true; }),
}));
vi.mock('./toast', () => ({ showToast }));
vi.mock('./ui/dialog', () => ({ showDialog }));
vi.mock('./fileTree', () => ({ suppressNextWatcherRefresh: vi.fn(), refreshFileTree: vi.fn() }));
vi.mock('./outline', () => ({ refreshOutline: vi.fn() }));
vi.mock('./activeDocument', () => ({
  getActiveFilePath: vi.fn(() => mockState.activePath),
  clearActiveDocument,
}));
vi.mock('./sidebar.fileops', () => ({ reloadActiveDocumentFromDiskInOperation: reloadActiveDocumentFromDisk, saveActiveDocumentAsNewFileInOperation: saveActiveDocumentAsNewFile }));
vi.mock('../lib/documentSessions', () => ({ discardCurrentDocumentTabInOperation }));
vi.mock('../lib/documentOperations', () => ({
  runDocumentOperation: vi.fn((operation: () => unknown) => {
    const result = mockState.operationTail.then(operation);
    mockState.operationTail = result.catch(() => undefined);
    return result;
  }),
}));

import {
  handleActiveDocumentExternalModification,
  handleExternalDeletion,
} from './sidebar.conflict';

beforeEach(() => {
  mockState.activePath = '/workspace/note.md';
  mockState.dirty = false;
  mockState.external = false;
  mockState.operationTail = Promise.resolve();
  reloadActiveDocumentFromDisk.mockReset();
  saveActiveDocumentAsNewFile.mockReset();
  showDialog.mockReset();
  clearActiveDocument.mockReset();
  discardCurrentDocumentTabInOperation.mockReset();
  getMarkdownResult.mockReturnValue({ ok: true, markdown: '# current' });
  writeFile.mockReset();
  showToast.mockReset();
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

  it('prompts before discarding a clean document when its file is deleted', async () => {
    showDialog.mockResolvedValue('keep');
    await expect(handleExternalDeletion('/workspace/note.md')).resolves.toBe('kept');
    expect(showDialog).toHaveBeenCalledOnce();
    expect(clearActiveDocument).not.toHaveBeenCalled();
    expect(discardCurrentDocumentTabInOperation).not.toHaveBeenCalled();
  });

  it('ignores deletion events outside the active document', async () => {
    await expect(handleExternalDeletion('/workspace/other.md')).resolves.toBe('ignored');
    expect(clearActiveDocument).not.toHaveBeenCalled();
  });

  it('does not restore a deleted file with an empty fallback after serialization fails', async () => {
    mockState.dirty = true;
    showDialog.mockResolvedValue('resave');
    getMarkdownResult.mockReturnValue({ ok: false, error: { stage: 'serialize', code: 'unknown-node' } });

    await expect(handleExternalDeletion('/workspace/note.md')).resolves.toBe('failed');

    expect(writeFile).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Markdown 转换失败，未写入文件');
  });

  it('discards a deleted document only after the user explicitly chooses discard', async () => {
    showDialog.mockResolvedValue('discard');

    await expect(handleExternalDeletion('/workspace/note.md')).resolves.toBe('discarded');

    expect(discardCurrentDocumentTabInOperation).toHaveBeenCalledOnce();
    expect(clearActiveDocument).not.toHaveBeenCalled();
  });
});
