import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(), writeFile: vi.fn(), addRecentFile: vi.fn(), getFileMetadata: vi.fn(),
  authorizeImageStorage: vi.fn(), preparePendingImagesForSave: vi.fn(), completePendingImagesSave: vi.fn(), abortPendingImagesSave: vi.fn(), discardActiveImageDraft: vi.fn(),
  getMarkdown: vi.fn(), hasExternalModification: vi.fn(), isDocumentDirty: vi.fn(), markDocumentPersisted: vi.fn(), resetEditorScroll: vi.fn(), setActiveDocumentPath: vi.fn(), setMarkdown: vi.fn(), getRevision: vi.fn(), getDocumentGeneration: vi.fn(), getLastReadMtime: vi.fn(), getLastReadSize: vi.fn(), setLastReadStats: vi.fn(), getEditor: vi.fn(), hasUnpersistedUserChanges: vi.fn(),
  save: vi.fn(), showDialog: vi.fn(), showToast: vi.fn(), getActiveFilePath: vi.fn(), setActiveFilePath: vi.fn(), invoke: vi.fn(),
}));
vi.mock('../lib/storage', () => ({ readFile: mocks.readFile, writeFile: mocks.writeFile, addRecentFile: mocks.addRecentFile, authorizeImageStorage: mocks.authorizeImageStorage, getFileMetadata: mocks.getFileMetadata }));
vi.mock('../lib/imageUtils', () => ({ preparePendingImagesForSave: mocks.preparePendingImagesForSave, completePendingImagesSave: mocks.completePendingImagesSave, abortPendingImagesSave: mocks.abortPendingImagesSave, discardActiveImageDraft: mocks.discardActiveImageDraft }));
vi.mock('../lib/editor', () => ({ getMarkdown: mocks.getMarkdown, hasExternalModification: mocks.hasExternalModification, isDocumentDirty: mocks.isDocumentDirty, markDocumentPersisted: mocks.markDocumentPersisted, resetEditorScroll: mocks.resetEditorScroll, setActiveDocumentPath: mocks.setActiveDocumentPath, setMarkdown: mocks.setMarkdown, getRevision: mocks.getRevision, getDocumentGeneration: mocks.getDocumentGeneration, getLastReadMtime: mocks.getLastReadMtime, getLastReadSize: mocks.getLastReadSize, setLastReadStats: mocks.setLastReadStats, getEditor: mocks.getEditor, hasUnpersistedUserChanges: mocks.hasUnpersistedUserChanges }));
vi.mock('../lib/editor.source', () => ({ setSourceReadOnly: vi.fn() })); vi.mock('./toast', () => ({ showToast: mocks.showToast })); vi.mock('./fileTree', () => ({ suppressNextWatcherRefresh: vi.fn(), applyFileTreeEvents: vi.fn() })); vi.mock('./outline', () => ({ refreshOutline: vi.fn() })); vi.mock('../lib/logger', () => ({ logException: vi.fn(), logInfo: vi.fn(), logDebug: vi.fn() })); vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save })); vi.mock('./ui/dialog', () => ({ showDialog: mocks.showDialog })); vi.mock('./activeDocument', () => ({ getActiveFilePath: mocks.getActiveFilePath, setActiveFilePath: mocks.setActiveFilePath })); vi.mock('./sidebar.conflict', () => ({ handleActiveDocumentExternalModification: vi.fn() })); vi.mock('../lib/fileSizeTier', () => ({ determineTier: vi.fn(() => 'normal'), formatFileSize: vi.fn() })); vi.mock('./degradationBar', () => ({ showDegradationBar: vi.fn(), hideDegradationBar: vi.fn() })); vi.mock('../lib/store', () => ({ store: { setState: vi.fn() } })); vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
import { confirmDocumentTransition, openFileInEditor, reloadActiveDocumentFromDisk, saveActiveDocument } from './sidebar.fileops';

beforeEach(() => {
  vi.clearAllMocks(); mocks.getMarkdown.mockReturnValue('# edited'); mocks.getRevision.mockReturnValue(4); mocks.getDocumentGeneration.mockReturnValue(1); mocks.hasUnpersistedUserChanges.mockReturnValue(true); mocks.getLastReadMtime.mockReturnValue(0); mocks.getLastReadSize.mockReturnValue(0); mocks.hasExternalModification.mockReturnValue(false); mocks.isDocumentDirty.mockReturnValue(false); mocks.writeFile.mockResolvedValue(undefined); mocks.addRecentFile.mockResolvedValue(undefined); mocks.invoke.mockResolvedValue({ mtime: 10, size: 9 }); mocks.preparePendingImagesForSave.mockImplementation(async (markdown: string) => ({ markdown, draftId: null })); mocks.completePendingImagesSave.mockResolvedValue(undefined); mocks.discardActiveImageDraft.mockResolvedValue(undefined); mocks.authorizeImageStorage.mockResolvedValue('/work/images');
});

describe('document transition save result', () => {
  it('continues only after an actual saved result', async () => {
    mocks.isDocumentDirty.mockReturnValue(true);
    mocks.showDialog.mockResolvedValue('save');
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');

    await expect(confirmDocumentTransition()).resolves.toBe(true);
    expect(mocks.writeFile).toHaveBeenCalledOnce();
  });

  it('blocks transition when save is skipped', async () => {
    mocks.isDocumentDirty.mockReturnValue(true);
    mocks.showDialog.mockResolvedValue('save');
    mocks.hasUnpersistedUserChanges.mockReturnValue(false);

    await expect(confirmDocumentTransition()).resolves.toBe(false);
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('blocks transition when save fails', async () => {
    mocks.isDocumentDirty.mockReturnValue(true);
    mocks.showDialog.mockResolvedValue('save');
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.writeFile.mockRejectedValue(new Error('write failed'));

    await expect(confirmDocumentTransition()).resolves.toBe(false);
  });
});

describe('active document file operations', () => {
  it('clean-session guard: zero unpersisted user edits → skipped, no serializer/write (P0S)', async () => {
    // UI/store wrongly reports dirty=true but the revision model says clean.
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.isDocumentDirty.mockReturnValue(true);
    mocks.hasUnpersistedUserChanges.mockReturnValue(false);
    mocks.getMarkdown.mockClear();
    mocks.writeFile.mockClear();
    await expect(saveActiveDocument()).resolves.toBe('skipped');
    expect(mocks.getMarkdown).not.toHaveBeenCalled(); // no serializer call
    expect(mocks.writeFile).not.toHaveBeenCalled();   // no write
    expect(mocks.markDocumentPersisted).not.toHaveBeenCalled();
  });

  it('clean Ctrl+S path: interactive save of clean doc is skipped (P0S)', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.hasUnpersistedUserChanges.mockReturnValue(false);
    await expect(saveActiveDocument()).resolves.toBe('skipped');
    expect(mocks.getMarkdown).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.showToast).not.toHaveBeenCalledWith('已保存');
  });

  it('saves an existing file and records its persisted revision', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    await expect(saveActiveDocument()).resolves.toBe('saved');
    expect(mocks.writeFile).toHaveBeenCalledWith('/work/note.md', '# edited');
    expect(mocks.markDocumentPersisted).toHaveBeenCalledWith('# edited', 4);
    expect(mocks.showToast).toHaveBeenCalledWith('已保存');
  });
  it('prompts for a target when saving a new document', async () => {
    mocks.getActiveFilePath.mockReturnValue(null); mocks.save.mockResolvedValue('/work/new.md');
    await expect(saveActiveDocument()).resolves.toBe('saved');
    expect(mocks.writeFile).toHaveBeenCalledWith('/work/new.md', '# edited');
    expect(mocks.setActiveFilePath).toHaveBeenCalledWith('/work/new.md');
    expect(mocks.addRecentFile).toHaveBeenCalledWith('/work/new.md');
  });
  it('migrates pending images before the first Markdown write and cleans afterward', async () => {
    mocks.getActiveFilePath.mockReturnValue(null); mocks.save.mockResolvedValue('/work/guide.md');
    mocks.preparePendingImagesForSave.mockResolvedValue({ markdown: '![](guide-images/img.png)', draftId: 'draft-1' });
    await expect(saveActiveDocument()).resolves.toBe('saved');
    expect(mocks.preparePendingImagesForSave).toHaveBeenCalledWith('# edited', '/work/guide.md');
    expect(mocks.writeFile).toHaveBeenCalledWith('/work/guide.md', '![](guide-images/img.png)');
    expect(mocks.setMarkdown).toHaveBeenCalledWith('![](guide-images/img.png)');
    expect(mocks.completePendingImagesSave).toHaveBeenCalledWith('draft-1');
    expect(mocks.writeFile.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.completePendingImagesSave.mock.invocationCallOrder[0]);
  });
  it('aborts first save and preserves the draft when migration fails', async () => {
    mocks.getActiveFilePath.mockReturnValue(null); mocks.save.mockResolvedValue('/work/guide.md');
    mocks.preparePendingImagesForSave.mockRejectedValue(new Error('migration failed'));
    await expect(saveActiveDocument()).resolves.toBe('failed');
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.completePendingImagesSave).not.toHaveBeenCalled();
    expect(mocks.setActiveFilePath).not.toHaveBeenCalled();
  });
  it('preserves migrated draft metadata when the Markdown write fails', async () => {
    mocks.getActiveFilePath.mockReturnValue(null); mocks.save.mockResolvedValue('/work/guide.md');
    mocks.preparePendingImagesForSave.mockResolvedValue({ markdown: '![](guide-images/img.png)', draftId: 'draft-1' });
    mocks.writeFile.mockRejectedValue(new Error('write failed'));
    await expect(saveActiveDocument()).resolves.toBe('failed');
    expect(mocks.completePendingImagesSave).not.toHaveBeenCalled();
    expect(mocks.abortPendingImagesSave).toHaveBeenCalledOnce();
    expect(mocks.setMarkdown).not.toHaveBeenCalled();
    expect(mocks.setActiveFilePath).not.toHaveBeenCalled();
  });
  it('does not overwrite an externally modified file without confirmation', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md'); mocks.hasExternalModification.mockReturnValue(true); vi.spyOn(window, 'confirm').mockReturnValue(false);
    await expect(saveActiveDocument()).resolves.toBe('skipped');
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith('已取消保存');
  });
  it('P0 corrective: in-flight save completing after a document switch does not mark the new document clean', async () => {
    // A save starts on generation 1. While writeFile is in flight the user
    // discards A and opens/edits B (generation bumps to 2, revision back to 1).
    // When A's write completes, B must keep its dirty state and file stats.
    mocks.getActiveFilePath.mockReturnValue('/work/A.md');
    mocks.getDocumentGeneration.mockReturnValueOnce(1) // captured at save-start
      .mockReturnValueOnce(1) // pre-write path guard
      .mockReturnValue(2);    // completion — generation changed (active doc is B)
    let resolveWrite: (() => void) | undefined;
    mocks.writeFile.mockImplementation(() => new Promise<void>((resolve) => { resolveWrite = resolve; }));
    // lastRead stats match on-disk stats (mtime 10 / size 9), so no confirm path
    mocks.getLastReadMtime.mockReturnValue(10);
    mocks.getLastReadSize.mockReturnValue(9);

    const savePromise = saveActiveDocument();
    await vi.waitFor(() => expect(mocks.writeFile).toHaveBeenCalled());
    // Discard A → open B: generation bumps, revision 1 (B has an unpersisted edit)
    mocks.getActiveFilePath.mockReturnValue('/work/B.md');
    mocks.getRevision.mockReturnValue(1);
    resolveWrite!();
    const result = await savePromise;

    expect(result).toBe('saved'); // the WRITE itself succeeded
    expect(mocks.setLastReadStats).not.toHaveBeenCalled();  // B's file stats untouched
    expect(mocks.markDocumentPersisted).not.toHaveBeenCalled(); // B NOT marked clean
  });
  it('P1 corrective: second save is skipped while the first is awaiting its pre-save stat check', async () => {
    // The save lock must be occupied before ANY await. A first save blocked on
    // get_file_stats (delayed stat) must cause a second save to be skipped.
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.getLastReadMtime.mockReturnValue(10);
    mocks.getLastReadSize.mockReturnValue(9);
    let releaseStat: ((value: { mtime: number; size: number }) => void) | undefined;
    mocks.invoke.mockImplementationOnce(
      () => new Promise<{ mtime: number; size: number }>((resolve) => { releaseStat = resolve; }),
    );
    mocks.invoke.mockResolvedValue({ mtime: 11, size: 9 }); // post-write stat resolves normally
    const first = saveActiveDocument();
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
    await expect(saveActiveDocument()).resolves.toBe('skipped'); // lock already held
    releaseStat!({ mtime: 10, size: 9 }); // pre-save stat matches lastRead → proceed
    await expect(first).resolves.toBe('saved');
    expect(mocks.writeFile).toHaveBeenCalledOnce(); // only one write
  });
  it('reloads disk content only when the document is safe to replace', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md'); mocks.readFile.mockResolvedValue('# disk');
    await expect(reloadActiveDocumentFromDisk()).resolves.toBe(true);
    expect(mocks.setMarkdown).toHaveBeenCalledWith('# disk', 'reloadSync');
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
