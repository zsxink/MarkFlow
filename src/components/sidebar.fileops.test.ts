import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(), writeFile: vi.fn(), addRecentFile: vi.fn(), getFileMetadata: vi.fn(),
  authorizeImageStorage: vi.fn(), preparePendingImagesForSave: vi.fn(), completePendingImagesSave: vi.fn(), abortPendingImagesSave: vi.fn(), discardActiveImageDraft: vi.fn(),
  getCurrentSourceMarkdown: vi.fn(), hasExternalModification: vi.fn(), isDocumentDirty: vi.fn(), markDocumentPersisted: vi.fn(), resetEditorScroll: vi.fn(), setActiveDocumentPath: vi.fn(), setMarkdown: vi.fn(), getRevision: vi.fn(), getLastReadMtime: vi.fn(), getLastReadSize: vi.fn(), setLastReadStats: vi.fn(), getEditor: vi.fn(),
  save: vi.fn(), showDialog: vi.fn(), showToast: vi.fn(), getActiveFilePath: vi.fn(), setActiveFilePath: vi.fn(), invoke: vi.fn(),
  getCoreSessionState: vi.fn(), saveCoreSession: vi.fn(), openCoreSession: vi.fn(), closeCoreSession: vi.fn(),
}));
vi.mock('../lib/storage', () => ({ readFile: mocks.readFile, writeFile: mocks.writeFile, addRecentFile: mocks.addRecentFile, authorizeImageStorage: mocks.authorizeImageStorage, getFileMetadata: mocks.getFileMetadata }));
vi.mock('../lib/imageUtils', () => ({ preparePendingImagesForSave: mocks.preparePendingImagesForSave, completePendingImagesSave: mocks.completePendingImagesSave, abortPendingImagesSave: mocks.abortPendingImagesSave, discardActiveImageDraft: mocks.discardActiveImageDraft }));
vi.mock('../lib/editor', () => ({ getCurrentSourceMarkdown: mocks.getCurrentSourceMarkdown, hasExternalModification: mocks.hasExternalModification, isDocumentDirty: mocks.isDocumentDirty, markDocumentPersisted: mocks.markDocumentPersisted, resetEditorScroll: mocks.resetEditorScroll, setActiveDocumentPath: mocks.setActiveDocumentPath, setMarkdown: mocks.setMarkdown, getRevision: mocks.getRevision, getLastReadMtime: mocks.getLastReadMtime, getLastReadSize: mocks.getLastReadSize, setLastReadStats: mocks.setLastReadStats, getEditor: mocks.getEditor }));
vi.mock('../lib/editor.source', () => ({ setSourceReadOnly: vi.fn() })); vi.mock('./toast', () => ({ showToast: mocks.showToast })); vi.mock('./fileTree', () => ({ suppressNextWatcherRefresh: vi.fn(), applyFileTreeEvents: vi.fn() })); vi.mock('./outline', () => ({ refreshOutline: vi.fn() })); vi.mock('../lib/logger', () => ({ logException: vi.fn(), logInfo: vi.fn(), logDebug: vi.fn() })); vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save })); vi.mock('./ui/dialog', () => ({ showDialog: mocks.showDialog })); vi.mock('./activeDocument', () => ({ getActiveFilePath: mocks.getActiveFilePath, setActiveFilePath: mocks.setActiveFilePath })); vi.mock('./sidebar.conflict', () => ({ handleActiveDocumentExternalModification: vi.fn() })); vi.mock('../lib/fileSizeTier', () => ({ determineTier: vi.fn(() => 'normal'), formatFileSize: vi.fn() })); vi.mock('./degradationBar', () => ({ showDegradationBar: vi.fn(), hideDegradationBar: vi.fn() })); vi.mock('../lib/store', () => ({ store: { setState: vi.fn() } })); vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('../lib/coreSession', () => ({ getCoreSessionState: mocks.getCoreSessionState, saveCoreSession: mocks.saveCoreSession, openCoreSession: mocks.openCoreSession, closeCoreSession: mocks.closeCoreSession }));
import { confirmDocumentTransition, openFileInEditor, reloadActiveDocumentFromDisk, saveActiveDocument } from './sidebar.fileops';

function prepared(markdown: string, draftId: string | null = null) {
  return {
    markdown,
    draftId,
    transaction: {
      sessionId: 0,
      baseRevision: 0,
      requestId: `req-${draftId ?? 'none'}`,
      documentPath: '/work/guide.md',
      originalMarkdown: '# edited',
      proposedMarkdown: markdown,
      draftId,
      mappings: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.getCurrentSourceMarkdown.mockReturnValue('# edited'); mocks.getRevision.mockReturnValue(4); mocks.getLastReadMtime.mockReturnValue(0); mocks.getLastReadSize.mockReturnValue(0); mocks.hasExternalModification.mockReturnValue(false); mocks.isDocumentDirty.mockReturnValue(false); mocks.writeFile.mockResolvedValue(undefined); mocks.addRecentFile.mockResolvedValue(undefined); mocks.invoke.mockResolvedValue({ mtime: 10, size: 9 }); mocks.preparePendingImagesForSave.mockImplementation(async (markdown: string) => prepared(markdown)); mocks.completePendingImagesSave.mockResolvedValue(undefined); mocks.discardActiveImageDraft.mockResolvedValue(undefined); mocks.authorizeImageStorage.mockResolvedValue('/work/images'); mocks.getCoreSessionState.mockReturnValue({ isActive: false }); mocks.saveCoreSession.mockResolvedValue(4); mocks.openCoreSession.mockResolvedValue({ session_id: 1, revision: 4 }); mocks.closeCoreSession.mockResolvedValue(undefined);
});

describe('active document file operations', () => {
  it('fails closed for an existing file without a Core session', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    await expect(saveActiveDocument()).resolves.toBe('failed');
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.preparePendingImagesForSave).not.toHaveBeenCalled();
    expect(mocks.markDocumentPersisted).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith('保存需要已确认的 Core 会话');
  });
  it('fails closed after selecting a target for a new document without a Core session', async () => {
    mocks.getActiveFilePath.mockReturnValue(null); mocks.save.mockResolvedValue('/work/new.md');
    await expect(saveActiveDocument()).resolves.toBe('failed');
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.preparePendingImagesForSave).not.toHaveBeenCalled();
    expect(mocks.setActiveFilePath).not.toHaveBeenCalled();
    expect(mocks.addRecentFile).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith('保存需要已确认的 Core 会话');
  });
  it('does not migrate pending images before Core save authority exists', async () => {
    mocks.getActiveFilePath.mockReturnValue(null); mocks.save.mockResolvedValue('/work/guide.md');
    const migration = prepared('![](guide-images/img.png)', 'draft-1');
    mocks.preparePendingImagesForSave.mockResolvedValue(migration);
    await expect(saveActiveDocument()).resolves.toBe('failed');
    expect(mocks.preparePendingImagesForSave).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.setMarkdown).not.toHaveBeenCalled();
    expect(mocks.completePendingImagesSave).not.toHaveBeenCalled();
  });
  it('does not start first-save image migration without a Core session', async () => {
    mocks.getActiveFilePath.mockReturnValue(null); mocks.save.mockResolvedValue('/work/guide.md');
    mocks.preparePendingImagesForSave.mockRejectedValue(new Error('migration failed'));
    await expect(saveActiveDocument()).resolves.toBe('failed');
    expect(mocks.preparePendingImagesForSave).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.completePendingImagesSave).not.toHaveBeenCalled();
    expect(mocks.setActiveFilePath).not.toHaveBeenCalled();
  });
  it('does not create migrated draft metadata when the Markdown write path is unavailable', async () => {
    mocks.getActiveFilePath.mockReturnValue(null); mocks.save.mockResolvedValue('/work/guide.md');
    mocks.preparePendingImagesForSave.mockResolvedValue(prepared('![](guide-images/img.png)', 'draft-1'));
    mocks.writeFile.mockRejectedValue(new Error('write failed'));
    await expect(saveActiveDocument()).resolves.toBe('failed');
    expect(mocks.preparePendingImagesForSave).not.toHaveBeenCalled();
    expect(mocks.completePendingImagesSave).not.toHaveBeenCalled();
    expect(mocks.abortPendingImagesSave).not.toHaveBeenCalled();
    expect(mocks.setMarkdown).not.toHaveBeenCalled();
    expect(mocks.setActiveFilePath).not.toHaveBeenCalled();
  });
  it('does not overwrite an externally modified file without confirmation', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md'); mocks.hasExternalModification.mockReturnValue(true); vi.spyOn(window, 'confirm').mockReturnValue(false);
    await expect(saveActiveDocument()).resolves.toBe('skipped');
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith('已取消保存');
  });
  it('blocks document transition when the requested save fails closed', async () => {
    mocks.isDocumentDirty.mockReturnValue(true);
    mocks.showDialog.mockResolvedValue('save');
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    await expect(confirmDocumentTransition()).resolves.toBe(false);
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith('保存需要已确认的 Core 会话');
  });
  it('reloads disk content only when the document is safe to replace', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md'); mocks.readFile.mockResolvedValue('# disk');
    await expect(reloadActiveDocumentFromDisk()).resolves.toBe(true);
    expect(mocks.setMarkdown).toHaveBeenCalledWith('# disk');
    mocks.isDocumentDirty.mockReturnValue(true);
    await expect(reloadActiveDocumentFromDisk()).resolves.toBe(false);
  });
  it('authorizes image storage and cleans the discarded draft before rendering an opened file', async () => {
    mocks.getActiveFilePath.mockReturnValue(null);
    mocks.getFileMetadata.mockResolvedValue({ size: 10, lines: 1 });
    mocks.readFile.mockResolvedValue('# opened');
    await openFileInEditor('/work/opened.md');
    expect(mocks.authorizeImageStorage).toHaveBeenCalledWith('/work/opened.md');
    expect(mocks.discardActiveImageDraft).toHaveBeenCalledOnce();
    expect(mocks.setMarkdown).toHaveBeenCalledWith('# opened');
    expect(mocks.discardActiveImageDraft.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.setMarkdown.mock.invocationCallOrder[0]);
  });
});
