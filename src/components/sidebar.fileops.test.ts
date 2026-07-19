import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(), writeFile: vi.fn(), addRecentFile: vi.fn(), getFileMetadata: vi.fn(),
  getMarkdown: vi.fn(), hasExternalModification: vi.fn(), isDocumentDirty: vi.fn(), markDocumentPersisted: vi.fn(), resetEditorScroll: vi.fn(), setActiveDocumentPath: vi.fn(), setMarkdown: vi.fn(), getRevision: vi.fn(), getLastReadMtime: vi.fn(), getLastReadSize: vi.fn(), setLastReadStats: vi.fn(), getEditor: vi.fn(),
  save: vi.fn(), showToast: vi.fn(), getActiveFilePath: vi.fn(), setActiveFilePath: vi.fn(), invoke: vi.fn(),
}));
vi.mock('../lib/storage', () => ({ readFile: mocks.readFile, writeFile: mocks.writeFile, addRecentFile: mocks.addRecentFile, getFileMetadata: mocks.getFileMetadata }));
vi.mock('../lib/editor', () => ({ getMarkdown: mocks.getMarkdown, hasExternalModification: mocks.hasExternalModification, isDocumentDirty: mocks.isDocumentDirty, markDocumentPersisted: mocks.markDocumentPersisted, resetEditorScroll: mocks.resetEditorScroll, setActiveDocumentPath: mocks.setActiveDocumentPath, setMarkdown: mocks.setMarkdown, getRevision: mocks.getRevision, getLastReadMtime: mocks.getLastReadMtime, getLastReadSize: mocks.getLastReadSize, setLastReadStats: mocks.setLastReadStats, getEditor: mocks.getEditor }));
vi.mock('../lib/editor.source', () => ({ setSourceReadOnly: vi.fn() })); vi.mock('./toast', () => ({ showToast: mocks.showToast })); vi.mock('./fileTree', () => ({ suppressNextWatcherRefresh: vi.fn(), applyFileTreeEvents: vi.fn() })); vi.mock('./outline', () => ({ refreshOutline: vi.fn() })); vi.mock('../lib/logger', () => ({ logException: vi.fn(), logInfo: vi.fn(), logDebug: vi.fn() })); vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save })); vi.mock('./ui/dialog', () => ({ showDialog: vi.fn() })); vi.mock('./activeDocument', () => ({ getActiveFilePath: mocks.getActiveFilePath, setActiveFilePath: mocks.setActiveFilePath })); vi.mock('./sidebar.conflict', () => ({ handleActiveDocumentExternalModification: vi.fn() })); vi.mock('../lib/fileSizeTier', () => ({ determineTier: vi.fn(() => 'normal'), formatFileSize: vi.fn() })); vi.mock('./degradationBar', () => ({ showDegradationBar: vi.fn(), hideDegradationBar: vi.fn() })); vi.mock('../lib/store', () => ({ store: { setState: vi.fn() } })); vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
import { reloadActiveDocumentFromDisk, saveActiveDocument } from './sidebar.fileops';

beforeEach(() => {
  vi.clearAllMocks(); mocks.getMarkdown.mockReturnValue('# edited'); mocks.getRevision.mockReturnValue(4); mocks.getLastReadMtime.mockReturnValue(0); mocks.getLastReadSize.mockReturnValue(0); mocks.hasExternalModification.mockReturnValue(false); mocks.isDocumentDirty.mockReturnValue(false); mocks.writeFile.mockResolvedValue(undefined); mocks.addRecentFile.mockResolvedValue(undefined); mocks.invoke.mockResolvedValue({ mtime: 10, size: 9 });
});

describe('active document file operations', () => {
  it('saves an existing file and records its persisted revision', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    await expect(saveActiveDocument()).resolves.toBe(true);
    expect(mocks.writeFile).toHaveBeenCalledWith('/work/note.md', '# edited');
    expect(mocks.markDocumentPersisted).toHaveBeenCalledWith('# edited', 4);
    expect(mocks.showToast).toHaveBeenCalledWith('已保存');
  });
  it('prompts for a target when saving a new document', async () => {
    mocks.getActiveFilePath.mockReturnValue(null); mocks.save.mockResolvedValue('/work/new.md');
    await expect(saveActiveDocument()).resolves.toBe(true);
    expect(mocks.writeFile).toHaveBeenCalledWith('/work/new.md', '# edited');
    expect(mocks.setActiveFilePath).toHaveBeenCalledWith('/work/new.md');
    expect(mocks.addRecentFile).toHaveBeenCalledWith('/work/new.md');
  });
  it('does not overwrite an externally modified file without confirmation', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md'); mocks.hasExternalModification.mockReturnValue(true); vi.spyOn(window, 'confirm').mockReturnValue(false);
    await expect(saveActiveDocument()).resolves.toBe(false);
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith('已取消保存');
  });
  it('reloads disk content only when the document is safe to replace', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md'); mocks.readFile.mockResolvedValue('# disk');
    await expect(reloadActiveDocumentFromDisk()).resolves.toBe(true);
    expect(mocks.setMarkdown).toHaveBeenCalledWith('# disk');
    mocks.isDocumentDirty.mockReturnValue(true);
    await expect(reloadActiveDocumentFromDisk()).resolves.toBe(false);
  });
});
