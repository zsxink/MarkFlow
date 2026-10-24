import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isSavingInProgress: vi.fn(),
  isDocumentDirty: vi.fn(),
  getActiveFilePath: vi.fn(),
  saveActiveDocument: vi.fn(),
  store: { getState: vi.fn(), setState: vi.fn() },
  shouldSuppressAutosave: vi.fn(),
}));

vi.mock('../infra/logger', () => ({ logDebug: vi.fn(), logInfo: vi.fn(), logException: vi.fn() }));
vi.mock('../infra/store', () => ({ store: mocks.store }));
vi.mock('../editor', () => ({ initEditor: vi.fn(), isDocumentDirty: mocks.isDocumentDirty, shouldSuppressAutosave: mocks.shouldSuppressAutosave }));
vi.mock('../ui/documents/session', () => ({
  initDocumentSessions: vi.fn(),
  confirmAllDocumentTabsClose: vi.fn(),
  routeDocumentExternalChanges: vi.fn(),
  getActiveTabId: vi.fn(() => null),
}));
vi.mock('../infra/document-operations', () => ({ isDocumentOperationPending: vi.fn(() => false) }));
vi.mock('../ui/document-tabs', () => ({ initDocumentTabs: vi.fn() }));
// The engine/export layers report through `uiPorts` now, so tests register a
// fake port implementation instead of mocking the UI module directly.
const portFakes = vi.hoisted(() => ({ notify: vi.fn, showDiagramContextMenu: vi.fn(), showTableContextMenu: vi.fn(), showImageContextMenu: vi.fn(), refreshFrontmatter: vi.fn(), mountFrontmatter: vi.fn() }));
vi.mock('../infra/ui-ports', () => ({
  uiPorts: portFakes,
  registerUiPorts: vi.fn(),
  resetUiPorts: vi.fn(),
}));
vi.mock('../ui/sidebar/index', () => ({
  initSidebar: vi.fn(),
  isSavingInProgress: mocks.isSavingInProgress,
  getActiveFilePath: mocks.getActiveFilePath,
  saveActiveDocument: mocks.saveActiveDocument,
  switchSidebarTab: vi.fn(),
}));
vi.mock('../ui/file-tree/index', () => ({ setWorkspacePath: vi.fn(), refreshFileTree: vi.fn(), isSuppressedPath: vi.fn(), getWorkspacePath: vi.fn(), applyFileTreeEvents: vi.fn(), closeWorkspaceFolder: vi.fn() }));
vi.mock('../ui/sidebar/conflict', () => ({ handleActiveDocumentExternalModification: vi.fn(), handleExternalDeletion: vi.fn() }));
vi.mock('../ui/status-bar', () => ({ initStatusBar: vi.fn() }));
vi.mock('../ui/toolbar', () => ({ initToolbar: vi.fn() }));
vi.mock('../ui/menu', () => ({ initMenu: vi.fn() }));
vi.mock('../utils/keyboard', () => ({ initKeyboard: vi.fn() }));
vi.mock('../infra/theme', () => ({ initTheme: vi.fn() }));
vi.mock('../infra/storage', () => ({ getWorkspace: vi.fn(), loadSettings: vi.fn(), addRecentFile: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('@tauri-apps/api/webviewWindow', () => ({ getCurrentWebviewWindow: vi.fn() }));

import { runAutoSaveTick } from '../main';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isSavingInProgress.mockReturnValue(false);
  mocks.isDocumentDirty.mockReturnValue(false);
  mocks.getActiveFilePath.mockReturnValue(null);
  mocks.store.getState.mockReturnValue({ autosaveErrorCount: 0 });
  mocks.shouldSuppressAutosave.mockReturnValue(false);
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

  it('does not invoke the production save entry point while reconciliation is conflicted', async () => {
    mocks.isDocumentDirty.mockReturnValue(true);
    mocks.getActiveFilePath.mockReturnValue('/work/note.md');
    mocks.store.getState.mockReturnValue({ autosaveErrorCount: 2, reconcileError: 'stale-source' });
    mocks.shouldSuppressAutosave.mockReturnValue(true);
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
