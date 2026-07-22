import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isSavingInProgress: vi.fn(),
  isDocumentDirty: vi.fn(),
  getActiveFilePath: vi.fn(),
  saveActiveDocument: vi.fn(),
  store: { getState: vi.fn(), setState: vi.fn() },
}));

vi.mock('./lib/logger', () => ({ logDebug: vi.fn(), logInfo: vi.fn(), logException: vi.fn() }));
vi.mock('./lib/store', () => ({ store: mocks.store }));
vi.mock('./components/toast', () => ({ showToast: vi.fn() }));
vi.mock('./components/sidebar', () => ({
  initSidebar: vi.fn(),
  isSavingInProgress: mocks.isSavingInProgress,
  getActiveFilePath: mocks.getActiveFilePath,
  saveActiveDocument: mocks.saveActiveDocument,
  switchSidebarTab: vi.fn(),
}));
vi.mock('./lib/editor', () => ({ isDocumentDirty: mocks.isDocumentDirty, initEditor: vi.fn(), markExternalModification: vi.fn() }));
vi.mock('./components/fileTree', () => ({ setWorkspacePath: vi.fn(), refreshFileTree: vi.fn(), isSuppressedPath: vi.fn(), getWorkspacePath: vi.fn(), applyFileTreeEvents: vi.fn() }));
vi.mock('./components/sidebar.conflict', () => ({ handleActiveDocumentExternalModification: vi.fn(), handleExternalDeletion: vi.fn() }));
vi.mock('./components/statusbar', () => ({ initStatusBar: vi.fn() }));
vi.mock('./components/toolbar', () => ({ initToolbar: vi.fn() }));
vi.mock('./components/menu', () => ({ initMenu: vi.fn() }));
vi.mock('./utils/keyboard', () => ({ initKeyboard: vi.fn() }));
vi.mock('./lib/theme', () => ({ initTheme: vi.fn() }));
vi.mock('./lib/storage', () => ({ getWorkspace: vi.fn(), loadSettings: vi.fn(), addRecentFile: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('@tauri-apps/api/webviewWindow', () => ({ getCurrentWebviewWindow: vi.fn() }));

import { runAutoSaveTick } from './main';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isSavingInProgress.mockReturnValue(false);
  mocks.isDocumentDirty.mockReturnValue(false);
  mocks.getActiveFilePath.mockReturnValue(null);
  mocks.store.getState.mockReturnValue({ autosaveErrorCount: 0 });
});

describe('autosave tick', () => {
  it('skips when saving is in progress', async () => {
    mocks.isSavingInProgress.mockReturnValue(true);
    await runAutoSaveTick();
    expect(mocks.saveActiveDocument).not.toHaveBeenCalled();
  });

  it('skips when document is not dirty', async () => {
    mocks.isDocumentDirty.mockReturnValue(false);
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    await runAutoSaveTick();
    expect(mocks.saveActiveDocument).not.toHaveBeenCalled();
  });

  it('saves when document is dirty and has a file path', async () => {
    mocks.isDocumentDirty.mockReturnValue(true);
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.saveActiveDocument.mockResolvedValue('saved');
    mocks.store.getState.mockReturnValue({ autosaveErrorCount: 0 });
    await runAutoSaveTick();
    expect(mocks.saveActiveDocument).toHaveBeenCalledWith({ interactive: false });
  });

  it('resets error count on successful save', async () => {
    mocks.isDocumentDirty.mockReturnValue(true);
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.saveActiveDocument.mockResolvedValue('saved');
    mocks.store.getState.mockReturnValue({ autosaveErrorCount: 3 });
    await runAutoSaveTick();
    expect(mocks.store.setState).toHaveBeenCalledWith({ autosaveErrorCount: 0 });
  });

  it('increments error count on failed save', async () => {
    mocks.isDocumentDirty.mockReturnValue(true);
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.saveActiveDocument.mockResolvedValue('failed');
    mocks.store.getState.mockReturnValue({ autosaveErrorCount: 1 });
    await runAutoSaveTick();
    expect(mocks.store.setState).toHaveBeenCalledWith({ autosaveErrorCount: 2 });
  });

  it('does not change error count on skipped save', async () => {
    mocks.isDocumentDirty.mockReturnValue(true);
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.saveActiveDocument.mockResolvedValue('skipped');
    mocks.store.getState.mockReturnValue({ autosaveErrorCount: 2 });
    await runAutoSaveTick();
    expect(mocks.store.setState).not.toHaveBeenCalled();
  });

  it('does not save when no active file path', async () => {
    mocks.isDocumentDirty.mockReturnValue(true);
    mocks.getActiveFilePath.mockReturnValue(null);
    await runAutoSaveTick();
    expect(mocks.saveActiveDocument).not.toHaveBeenCalled();
  });
});
