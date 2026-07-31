import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(), writeFile: vi.fn(), addRecentFile: vi.fn(), getFileMetadata: vi.fn(),
  authorizeImageStorage: vi.fn(), preparePendingImagesForSave: vi.fn(), completePendingImagesSave: vi.fn(), abortPendingImagesSave: vi.fn(), discardActiveImageDraft: vi.fn(),
  getCurrentSourceMarkdown: vi.fn(), hasExternalModification: vi.fn(), isDocumentDirty: vi.fn(), markDocumentPersisted: vi.fn(), resetEditorScroll: vi.fn(), setActiveDocumentPath: vi.fn(), setMarkdown: vi.fn(), getRevision: vi.fn(), getLastReadMtime: vi.fn(), getLastReadSize: vi.fn(), setLastReadStats: vi.fn(), getEditor: vi.fn(),
  save: vi.fn(), showToast: vi.fn(), getActiveFilePath: vi.fn(), setActiveFilePath: vi.fn(), invoke: vi.fn(),
  getCoreSessionState: vi.fn(), saveCoreSession: vi.fn(),
}));

vi.mock('./storage', () => ({ readFile: mocks.readFile, writeFile: mocks.writeFile, addRecentFile: mocks.addRecentFile, authorizeImageStorage: mocks.authorizeImageStorage, getFileMetadata: mocks.getFileMetadata }));
vi.mock('./imageUtils', () => ({ preparePendingImagesForSave: mocks.preparePendingImagesForSave, completePendingImagesSave: mocks.completePendingImagesSave, abortPendingImagesSave: mocks.abortPendingImagesSave, discardActiveImageDraft: mocks.discardActiveImageDraft }));
vi.mock('./editor', () => ({ getCurrentSourceMarkdown: mocks.getCurrentSourceMarkdown, hasExternalModification: mocks.hasExternalModification, isDocumentDirty: mocks.isDocumentDirty, markDocumentPersisted: mocks.markDocumentPersisted, resetEditorScroll: mocks.resetEditorScroll, setActiveDocumentPath: mocks.setActiveDocumentPath, setMarkdown: mocks.setMarkdown, getRevision: mocks.getRevision, getLastReadMtime: mocks.getLastReadMtime, getLastReadSize: mocks.getLastReadSize, setLastReadStats: mocks.setLastReadStats, getEditor: mocks.getEditor }));
vi.mock('./editor.source', () => ({ setSourceReadOnly: vi.fn() }));
vi.mock('../components/toast', () => ({ showToast: mocks.showToast }));
vi.mock('../components/fileTree', () => ({ suppressNextWatcherRefresh: vi.fn(), applyFileTreeEvents: vi.fn() }));
vi.mock('../components/outline', () => ({ refreshOutline: vi.fn() }));
vi.mock('./logger', () => ({ logException: vi.fn(), logInfo: vi.fn(), logDebug: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('../components/ui/dialog', () => ({ showDialog: vi.fn() }));
vi.mock('../components/activeDocument', () => ({ getActiveFilePath: mocks.getActiveFilePath, setActiveFilePath: mocks.setActiveFilePath }));
vi.mock('../components/sidebar.conflict', () => ({ handleActiveDocumentExternalModification: vi.fn() }));
vi.mock('./fileSizeTier', () => ({ determineTier: vi.fn(() => 'normal'), formatFileSize: vi.fn() }));
vi.mock('../components/degradationBar', () => ({ showDegradationBar: vi.fn(), hideDegradationBar: vi.fn() }));
vi.mock('./store', () => ({ store: { setState: vi.fn() } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('./coreSession', () => ({ getCoreSessionState: mocks.getCoreSessionState, saveCoreSession: mocks.saveCoreSession }));

import { saveActiveDocument } from '../components/sidebar.fileops';

function prepared(markdown: string, draftId: string | null = null) {
  return {
    markdown,
    draftId,
    transaction: {
      sessionId: 0,
      baseRevision: 0,
      requestId: `req-${draftId ?? 'none'}`,
      documentPath: '/work/note.md',
      originalMarkdown: '# edited',
      proposedMarkdown: markdown,
      draftId,
      mappings: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentSourceMarkdown.mockReturnValue('# edited');
  mocks.getRevision.mockReturnValue(4);
  mocks.getLastReadMtime.mockReturnValue(0);
  mocks.getLastReadSize.mockReturnValue(0);
  mocks.hasExternalModification.mockReturnValue(false);
  mocks.isDocumentDirty.mockReturnValue(false);
  mocks.writeFile.mockResolvedValue(undefined);
  mocks.addRecentFile.mockResolvedValue(undefined);
  mocks.invoke.mockResolvedValue({ mtime: 10, size: 9 });
  mocks.preparePendingImagesForSave.mockImplementation(async (markdown: string) => prepared(markdown));
  mocks.completePendingImagesSave.mockResolvedValue(undefined);
  mocks.saveCoreSession.mockResolvedValue(5);
});

describe('Core-backed vs legacy save path routing', () => {
  it('core_backed_save_uses_source_mirror_for_dirty_state_sync', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.getCoreSessionState.mockReturnValue({ isActive: true });

    await expect(saveActiveDocument()).resolves.toBe('saved');

    expect(mocks.getCurrentSourceMarkdown).toHaveBeenCalledTimes(1);
    expect(mocks.markDocumentPersisted).toHaveBeenCalledWith('# edited', 5);
    // Core save path should call saveCoreSession
    expect(mocks.saveCoreSession).toHaveBeenCalledOnce();
    expect(mocks.saveCoreSession).toHaveBeenCalledWith({ interactive: true });
  });

  it('non_core_save_fails_without_legacy_serializer_fallback', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.getCoreSessionState.mockReturnValue({ isActive: false });

    await expect(saveActiveDocument()).resolves.toBe('failed');

    expect(mocks.getCurrentSourceMarkdown).not.toHaveBeenCalled();
    expect(mocks.saveCoreSession).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  // 6.3: Core-backed save does NOT call writeFile (the legacy path)
  it('core_backed_save_does_not_call_write_file', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.getCoreSessionState.mockReturnValue({ isActive: true });

    await expect(saveActiveDocument()).resolves.toBe('saved');

    // Core save path should NOT call legacy writeFile
    expect(mocks.writeFile).not.toHaveBeenCalled();
    // Core save path should call saveCoreSession
    expect(mocks.saveCoreSession).toHaveBeenCalledOnce();
  });
});
