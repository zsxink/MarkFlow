import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(), writeFile: vi.fn(), writeFileIfUnchanged: vi.fn(), addRecentFile: vi.fn(), getFileMetadata: vi.fn(),
  authorizeImageStorage: vi.fn(), preparePendingImagesForSave: vi.fn(), completePendingImagesSave: vi.fn(), abortPendingImagesSave: vi.fn(), discardActiveImageDraft: vi.fn(),
  getMarkdownResult: vi.fn(), getSavePlan: vi.fn(), hasExternalModification: vi.fn(), isDocumentDirty: vi.fn(), markDocumentPersisted: vi.fn(), markExternalModification: vi.fn(), resetEditorScroll: vi.fn(), setActiveDocumentPath: vi.fn(), setMarkdown: vi.fn(), getRevision: vi.fn(), getSourceRevision: vi.fn(), getLastReadMtime: vi.fn(), getLastReadSize: vi.fn(), hasLastReadStats: vi.fn(), clearLastReadStats: vi.fn(), setLastReadStats: vi.fn(), getEditor: vi.fn(), getPipelineMode: vi.fn(), shouldUseReconcileBoundary: vi.fn(),
  save: vi.fn(), showToast: vi.fn(), getActiveFilePath: vi.fn(), setActiveFilePath: vi.fn(), invoke: vi.fn(),
}));
vi.mock('../lib/storage', () => ({ readFile: mocks.readFile, writeFile: mocks.writeFile, writeFileIfUnchanged: mocks.writeFileIfUnchanged, addRecentFile: mocks.addRecentFile, authorizeImageStorage: mocks.authorizeImageStorage, getFileMetadata: mocks.getFileMetadata }));
vi.mock('../lib/imageUtils', () => ({ preparePendingImagesForSave: mocks.preparePendingImagesForSave, completePendingImagesSave: mocks.completePendingImagesSave, abortPendingImagesSave: mocks.abortPendingImagesSave, discardActiveImageDraft: mocks.discardActiveImageDraft }));
vi.mock('../lib/editor', () => ({ getMarkdownResult: mocks.getMarkdownResult, getSavePlan: mocks.getSavePlan, hasExternalModification: mocks.hasExternalModification, isDocumentDirty: mocks.isDocumentDirty, markDocumentPersisted: mocks.markDocumentPersisted, markExternalModification: mocks.markExternalModification, resetEditorScroll: mocks.resetEditorScroll, setActiveDocumentPath: mocks.setActiveDocumentPath, setMarkdown: mocks.setMarkdown, getRevision: mocks.getRevision, getSourceRevision: mocks.getSourceRevision, getLastReadMtime: mocks.getLastReadMtime, getLastReadSize: mocks.getLastReadSize, hasLastReadStats: mocks.hasLastReadStats, clearLastReadStats: mocks.clearLastReadStats, setLastReadStats: mocks.setLastReadStats, getEditor: mocks.getEditor, getPipelineMode: mocks.getPipelineMode }));
vi.mock('../lib/editor.save.reconcile', () => ({ shouldUseReconcileBoundary: mocks.shouldUseReconcileBoundary }));
vi.mock('../lib/editor.source', () => ({ setSourceReadOnly: vi.fn() })); vi.mock('./toast', () => ({ showToast: mocks.showToast })); vi.mock('./fileTree', () => ({ suppressNextWatcherRefresh: vi.fn(), cancelSuppressedWatcherRefresh: vi.fn(), applyFileTreeEvents: vi.fn() })); vi.mock('./outline', () => ({ refreshOutline: vi.fn() })); vi.mock('../lib/logger', () => ({ logException: vi.fn(), logInfo: vi.fn(), logDebug: vi.fn() })); vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save })); vi.mock('./ui/dialog', () => ({ showDialog: vi.fn() })); vi.mock('./activeDocument', () => ({ getActiveFilePath: mocks.getActiveFilePath, setActiveFilePath: mocks.setActiveFilePath })); vi.mock('./sidebar.conflict', () => ({ handleActiveDocumentExternalModification: vi.fn() })); vi.mock('../lib/fileSizeTier', () => ({ determineTier: vi.fn(() => 'normal'), formatFileSize: vi.fn() })); vi.mock('./degradationBar', () => ({ showDegradationBar: vi.fn(), hideDegradationBar: vi.fn() })); vi.mock('../lib/store', () => ({ store: { setState: vi.fn() } })); vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
import { openFileInEditor, reloadActiveDocumentFromDisk, saveActiveDocument } from './sidebar.fileops';

beforeEach(() => {
  vi.clearAllMocks(); mocks.getMarkdownResult.mockReturnValue({ ok: true, markdown: '# edited' }); mocks.getSavePlan.mockReturnValue({ kind: 'legacy' }); mocks.getRevision.mockReturnValue(4); mocks.getSourceRevision.mockReturnValue(7); mocks.getLastReadMtime.mockReturnValue(0); mocks.getLastReadSize.mockReturnValue(0); mocks.hasLastReadStats.mockReturnValue(false); mocks.shouldUseReconcileBoundary.mockReturnValue(false); mocks.hasExternalModification.mockReturnValue(false); mocks.isDocumentDirty.mockReturnValue(false); mocks.writeFile.mockResolvedValue(undefined); mocks.writeFileIfUnchanged.mockResolvedValue(undefined); mocks.addRecentFile.mockResolvedValue(undefined); mocks.invoke.mockResolvedValue({ mtime: 10, size: 9 }); mocks.preparePendingImagesForSave.mockImplementation(async (markdown: string) => ({ markdown, draftId: null })); mocks.completePendingImagesSave.mockResolvedValue(undefined); mocks.discardActiveImageDraft.mockResolvedValue(undefined); mocks.authorizeImageStorage.mockResolvedValue('/work/images');
});

describe('active document file operations', () => {
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
  it('does not write to disk when Markdown serialization has no safe candidate', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.getMarkdownResult.mockReturnValue({ ok: false, error: { stage: 'serialize', code: 'unknown-node' } });
    await expect(saveActiveDocument()).resolves.toBe('failed');
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith('Markdown 转换失败，未写入文件');
  });
  it('suppresses the write and keeps dirty on a reconcile conflict (8.5)', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.getSavePlan.mockReturnValue({ kind: 'conflict', write: false, code: 'stale-source' });
    // Even though serialization yields a candidate, the reconcile gate must win.
    mocks.getMarkdownResult.mockReturnValue({ ok: true, markdown: '# edited' });
    await expect(saveActiveDocument()).resolves.toBe('failed');
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.completePendingImagesSave).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith('保存被阻止：文档存在冲突，未写入磁盘');
  });
  it('skips the write entirely on an unchanged reconcile result (8.3)', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.getSavePlan.mockReturnValue({ kind: 'unchanged', write: false });
    mocks.getMarkdownResult.mockReturnValue({ ok: true, markdown: '# edited' });
    await expect(saveActiveDocument()).resolves.toBe('saved');
    expect(mocks.writeFile).not.toHaveBeenCalled(); // exact source already on disk
    expect(mocks.showToast).toHaveBeenCalledWith('内容无变化，未重复写入');
  });
  it('writes a pending Source-admission reconcile candidate instead of skipping it', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    const sourceB = '<!-- source B -->\n\n# Title\n\n';
    mocks.getSavePlan.mockReturnValue({ kind: 'safe-edit', write: true, markdown: sourceB });
    mocks.getMarkdownResult.mockReturnValue({ ok: true, markdown: sourceB });
    await expect(saveActiveDocument()).resolves.toBe('saved');
    expect(mocks.writeFile).toHaveBeenCalledWith('/work/note.md', sourceB);
  });

  it.each([0, 1, 2, 3])('writes the exact WYS safe-edit EOF candidate (%i newline(s))', async (eofNewlines) => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    const markdown = '# edited' + '\n'.repeat(eofNewlines);
    mocks.getSavePlan.mockReturnValue({ kind: 'safe-edit', write: true, markdown });
    mocks.getMarkdownResult.mockReturnValue({ ok: true, markdown: '# serializer formatting is ignored by plan' });
    await expect(saveActiveDocument()).resolves.toBe('saved');
    expect(mocks.writeFile).toHaveBeenCalledWith('/work/note.md', markdown);
    expect(mocks.markDocumentPersisted).toHaveBeenCalledWith(markdown, 4);
  });

  it('uses backend compare-and-write for a verified existing document', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.shouldUseReconcileBoundary.mockReturnValue(true);
    mocks.getPipelineMode.mockReturnValue('opaque');
    mocks.hasLastReadStats.mockReturnValue(true);
    mocks.getLastReadMtime.mockReturnValue(123);
    mocks.getLastReadSize.mockReturnValue(45);
    mocks.invoke.mockResolvedValue({ mtime: 123, size: 45 });
    mocks.getSavePlan.mockReturnValue({ kind: 'safe-edit', write: true, markdown: '# verified' });
    await expect(saveActiveDocument()).resolves.toBe('saved');
    expect(mocks.writeFileIfUnchanged).toHaveBeenCalledWith('/work/note.md', '# verified', 123, 45);
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.markDocumentPersisted).toHaveBeenCalledWith('# verified', 4);
  });

  it('uses the latest observed identity after a confirmed external overwrite', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.shouldUseReconcileBoundary.mockReturnValue(true);
    mocks.getPipelineMode.mockReturnValue('opaque');
    mocks.hasLastReadStats.mockReturnValue(true);
    mocks.getLastReadMtime.mockReturnValue(123);
    mocks.getLastReadSize.mockReturnValue(45);
    mocks.invoke.mockResolvedValueOnce({ mtime: 124, size: 46 }).mockResolvedValue({ mtime: 125, size: 11 });
    mocks.getSavePlan.mockReturnValue({ kind: 'safe-edit', write: true, markdown: '# verified' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await expect(saveActiveDocument()).resolves.toBe('saved');
    expect(mocks.getSavePlan).toHaveBeenCalledWith({ allowConfirmedExternalOverwrite: true });
    expect(mocks.writeFileIfUnchanged).toHaveBeenCalledWith('/work/note.md', '# verified', 124, 46);
  });

  it('turns an atomic compare-and-write conflict into a dirty reconcile failure', async () => {
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.shouldUseReconcileBoundary.mockReturnValue(true);
    mocks.getPipelineMode.mockReturnValue('opaque');
    mocks.hasLastReadStats.mockReturnValue(true);
    mocks.getLastReadMtime.mockReturnValue(123);
    mocks.getLastReadSize.mockReturnValue(45);
    mocks.invoke.mockResolvedValue({ mtime: 123, size: 45 });
    mocks.getSavePlan.mockReturnValue({ kind: 'safe-edit', write: true, markdown: '# verified' });
    mocks.writeFileIfUnchanged.mockRejectedValue(new Error('FILE_CHANGED_DURING_SAVE'));
    await expect(saveActiveDocument({ interactive: false })).resolves.toBe('failed');
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.markDocumentPersisted).not.toHaveBeenCalled();
    expect(mocks.markExternalModification).toHaveBeenCalled();
    // The second production boundary call records stale-source/reconcileError.
    expect(mocks.getSavePlan).toHaveBeenCalledTimes(2);
  });
});
