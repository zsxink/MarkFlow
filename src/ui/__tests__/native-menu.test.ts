import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  create: vi.fn(),
  close: vi.fn(),
  active: vi.fn<() => string | null>(() => 'tab'),
  reopen: vi.fn(),
  cycle: vi.fn(),
  closeAll: vi.fn(),
  confirmAll: vi.fn(),
  tabsChanged: vi.fn(),
  loadSettings: vi.fn(),
  clearHistory: vi.fn(),
  recentChanged: vi.fn(),
  openFile: vi.fn(),
  save: vi.fn(),
  saveAs: vi.fn(),
  switchSidebarTab: vi.fn(),
  openWorkspaceFolderFlow: vi.fn(),
  activateWorkspaceFolder: vi.fn(),
  setWorkspacePath: vi.fn(),
  refreshFileTree: vi.fn(),
  getWorkspacePath: vi.fn<() => string | null>(() => null),
  showNewFileDialog: vi.fn(),
  showLinkDialog: vi.fn(),
  showImageInsertDialog: vi.fn(),
  showSettings: vi.fn(),
  exportDocument: vi.fn(),
  cycleTheme: vi.fn(),
  shellOpen: vi.fn(),
  dialogOpen: vi.fn(),
  getEditor: vi.fn<() => unknown>(() => null),
  getMode: vi.fn<() => string>(() => 'wysiwyg'),
  getSourceView: vi.fn<() => unknown>(() => null),
  logException: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('@tauri-apps/plugin-shell', () => ({ open: mocks.shellOpen }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.dialogOpen }));
vi.mock('../documents/session', () => ({
  newDocumentTab: mocks.create,
  closeDocumentTab: mocks.close,
  getActiveTabId: mocks.active,
  reopenClosedDocumentTab: mocks.reopen,
  cycleDocumentTab: mocks.cycle,
  closeAllDocumentTabs: mocks.closeAll,
  confirmAllDocumentTabsClose: mocks.confirmAll,
  onDocumentTabsChanged: mocks.tabsChanged,
}));
vi.mock('../../infra/storage', () => ({
  loadSettings: mocks.loadSettings,
  clearRecentHistory: mocks.clearHistory,
  onRecentHistoryChanged: mocks.recentChanged,
}));
vi.mock('../../editor', () => ({
  getEditor: mocks.getEditor,
  getMode: mocks.getMode,
  getSourceView: mocks.getSourceView,
}));
vi.mock('../../infra/theme', () => ({ cycleTheme: mocks.cycleTheme }));
vi.mock('../../infra/store', () => ({ store: { on: vi.fn() } }));
vi.mock('../../infra/logger', () => ({ logException: mocks.logException }));
vi.mock('../file-tree/index', () => ({
  getWorkspacePath: mocks.getWorkspacePath,
}));
vi.mock('../sidebar/index', () => ({
  openFileInEditor: mocks.openFile,
  saveActiveDocument: mocks.save,
  switchSidebarTab: mocks.switchSidebarTab,
  openWorkspaceFolderFlow: mocks.openWorkspaceFolderFlow,
  activateWorkspaceFolder: mocks.activateWorkspaceFolder,
}));
vi.mock('../sidebar/fileops', () => ({ saveActiveDocumentAsNewFile: mocks.saveAs }));
vi.mock('../new-file-dialog', () => ({ showNewFileDialog: mocks.showNewFileDialog }));
vi.mock('../link-dialog', () => ({ showLinkDialog: mocks.showLinkDialog }));
vi.mock('../toolbar', () => ({
  exportCurrentDocument: mocks.exportDocument,
  showImageInsertDialog: mocks.showImageInsertDialog,
}));
vi.mock('../settings/panel', () => ({ showSettings: mocks.showSettings }));
vi.mock('../toast', () => ({ showToast: mocks.showToast }));

const {
  dispatchNativeMenuAction,
  syncNativeMenuState,
  initNativeMenu,
  resetNativeMenuStateCache,
} = await import('../native-menu');

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  mocks.active.mockReturnValue('tab');
  mocks.getWorkspacePath.mockReturnValue(null);
  mocks.loadSettings.mockResolvedValue({ recentFiles: [], recentFolders: [] });
  mocks.invoke.mockResolvedValue(undefined);
  resetNativeMenuStateCache();
});

function addButton(id: string): HTMLElement {
  const button = document.createElement('button');
  button.id = id;
  document.body.appendChild(button);
  return button;
}

describe('native menu dispatcher: tab commands', () => {
  it('routes tab operations through the document session API', async () => {
    expect(await dispatchNativeMenuAction('new-tab')).toBe(true);
    expect(await dispatchNativeMenuAction('close-tab')).toBe(true);
    expect(await dispatchNativeMenuAction('reopen-tab')).toBe(true);
    expect(await dispatchNativeMenuAction('next-tab')).toBe(true);
    expect(await dispatchNativeMenuAction('previous-tab')).toBe(true);
    expect(await dispatchNativeMenuAction('close-all-tabs')).toBe(true);

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledWith('tab');
    expect(mocks.reopen).toHaveBeenCalledOnce();
    expect(mocks.cycle).toHaveBeenNthCalledWith(1, 1);
    expect(mocks.cycle).toHaveBeenNthCalledWith(2, -1);
    expect(mocks.closeAll).toHaveBeenCalledOnce();
  });

  it('does not close a tab when there is no active document', async () => {
    mocks.active.mockReturnValue(null);
    expect(await dispatchNativeMenuAction('close-tab')).toBe(true);
    expect(mocks.close).not.toHaveBeenCalled();
  });
});

describe('native menu dispatcher: document and view commands', () => {
  it('calls the exported document commands directly', async () => {
    mocks.getWorkspacePath.mockReturnValue('/workspace');

    expect(await dispatchNativeMenuAction('new-file')).toBe(true);
    expect(mocks.showNewFileDialog).toHaveBeenCalledWith('file', '/workspace');

    await dispatchNativeMenuAction('new-folder');
    expect(mocks.showNewFileDialog).toHaveBeenCalledWith('folder', '/workspace');

    await dispatchNativeMenuAction('save');
    expect(mocks.save).toHaveBeenCalledOnce();

    await dispatchNativeMenuAction('save-as');
    expect(mocks.saveAs).toHaveBeenCalledOnce();

    await dispatchNativeMenuAction('export-pdf');
    await dispatchNativeMenuAction('export-word');
    await dispatchNativeMenuAction('export-html');
    expect(mocks.exportDocument.mock.calls).toEqual([['pdf'], ['word'], ['html']]);

    await dispatchNativeMenuAction('insert-link');
    expect(mocks.showLinkDialog).toHaveBeenCalledOnce();

    await dispatchNativeMenuAction('insert-image');
    expect(mocks.showImageInsertDialog).toHaveBeenCalledOnce();

    await dispatchNativeMenuAction('toggle-theme');
    expect(mocks.cycleTheme).toHaveBeenCalledOnce();
  });

  it('clicks existing toolbar buttons for simple view actions', async () => {
    const sidebarToggle = addButton('sidebar-toggle');
    const focus = addButton('btn-focus');
    const sidebarToggleSpy = vi.spyOn(sidebarToggle, 'click');
    const focusSpy = vi.spyOn(focus, 'click');
    const sidebar = document.createElement('aside');
    sidebar.id = 'sidebar';
    sidebar.classList.add('collapsed');
    document.body.appendChild(sidebar);

    expect(await dispatchNativeMenuAction('toggle-sidebar')).toBe(true);
    expect(sidebarToggleSpy).toHaveBeenCalledOnce();
    expect(await dispatchNativeMenuAction('focus-mode')).toBe(true);
    expect(focusSpy).toHaveBeenCalledOnce();

    // A collapsed sidebar is expanded through the toggle button so the button
    // icon and aria-pressed stay consistent with the visible sidebar.
    await dispatchNativeMenuAction('show-outline');
    expect(sidebarToggleSpy).toHaveBeenCalledTimes(2);
    expect(mocks.switchSidebarTab).toHaveBeenCalledWith('outline');

    // An already-expanded sidebar must not be collapsed by a second toggle.
    sidebar.classList.remove('collapsed');
    await dispatchNativeMenuAction('show-tree');
    expect(sidebarToggleSpy).toHaveBeenCalledTimes(2);
    expect(mocks.switchSidebarTab).toHaveBeenCalledWith('files');
  });

  it('switches editor mode by clicking the opposite mode button', async () => {
    const source = addButton('btn-source');
    const wysiwyg = addButton('btn-wysiwyg');
    const sourceSpy = vi.spyOn(source, 'click');
    const wysiwygSpy = vi.spyOn(wysiwyg, 'click');

    mocks.getMode.mockReturnValue('wysiwyg');
    await dispatchNativeMenuAction('toggle-mode');
    expect(sourceSpy).toHaveBeenCalledOnce();

    mocks.getMode.mockReturnValue('source');
    await dispatchNativeMenuAction('toggle-mode');
    expect(wysiwygSpy).toHaveBeenCalledOnce();
  });

  it('opens the log directory and the feedback issue tracker', async () => {
    mocks.invoke.mockResolvedValue('/logs');
    await dispatchNativeMenuAction('open-logs');
    expect(mocks.invoke).toHaveBeenCalledWith('get_log_dir');
    expect(mocks.shellOpen).toHaveBeenCalledWith('/logs');

    await dispatchNativeMenuAction('feedback');
    expect(mocks.shellOpen).toHaveBeenCalledWith('https://github.com/zsxink/MarkFlow/issues');
  });

  it('confirms unsaved documents before quitting', async () => {
    mocks.confirmAll.mockResolvedValue(true);
    await dispatchNativeMenuAction('quit');
    expect(mocks.invoke).toHaveBeenCalledWith('quit_app');

    vi.clearAllMocks();
    mocks.confirmAll.mockResolvedValue(false);
    await dispatchNativeMenuAction('quit');
    expect(mocks.invoke).not.toHaveBeenCalledWith('quit_app');
  });

  it('confirms unsaved documents before closing the window', async () => {
    mocks.confirmAll.mockResolvedValue(true);
    await dispatchNativeMenuAction('close-window');
    expect(mocks.invoke).toHaveBeenCalledWith('confirm_window_close');

    vi.clearAllMocks();
    mocks.confirmAll.mockResolvedValue(false);
    await dispatchNativeMenuAction('close-window');
    expect(mocks.invoke).not.toHaveBeenCalledWith('confirm_window_close');
  });

  it('opens the settings dialog for the settings menu item', async () => {
    await dispatchNativeMenuAction('settings');
    expect(mocks.showSettings).toHaveBeenCalledOnce();
  });

  it('clears recent history', async () => {
    await dispatchNativeMenuAction('clear-history');
    expect(mocks.clearHistory).toHaveBeenCalledOnce();
    expect(mocks.showToast).toHaveBeenCalledWith('历史记录已清除');
  });
});

describe('native menu dispatcher: open dialogs and editor commands', () => {
  it('opens files and folders through the dialog plugin', async () => {
    mocks.dialogOpen.mockResolvedValue('/workspace/note.md');
    await dispatchNativeMenuAction('open-file');
    expect(mocks.dialogOpen).toHaveBeenCalledWith({
      multiple: false,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    expect(mocks.openFile).toHaveBeenCalledWith('/workspace/note.md');

    // Folder opening owns the dialog, the workspace switch and the sidebar tab
    // inside the shared sidebar flow, so the menu only delegates to it.
    await dispatchNativeMenuAction('open-folder');
    expect(mocks.openWorkspaceFolderFlow).toHaveBeenCalledOnce();
  });

  it('ignores cancelled dialogs', async () => {
    mocks.dialogOpen.mockResolvedValue(null);
    await dispatchNativeMenuAction('open-file');
    expect(mocks.openFile).not.toHaveBeenCalled();
  });

  it('runs heading and inline formatting through the editor chain', async () => {
    const run = vi.fn();
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.focus = vi.fn(() => chain);
    chain.run = run;
    for (const command of ['toggleHeading', 'toggleBold', 'toggleItalic', 'toggleCode', 'toggleStrike', 'setParagraph']) {
      chain[command] = vi.fn(() => chain);
    }
    mocks.getEditor.mockReturnValue({ chain: () => chain });

    for (const action of [
      'heading-1',
      'heading-2',
      'heading-3',
      'paragraph',
      'bold',
      'italic',
      'inline-code',
      'strike',
    ]) {
      expect(await dispatchNativeMenuAction(action)).toBe(true);
    }

    expect(chain.toggleHeading.mock.calls).toEqual([[{ level: 1 }], [{ level: 2 }], [{ level: 3 }]]);
    expect(chain.setParagraph).toHaveBeenCalledOnce();
    expect(chain.toggleBold).toHaveBeenCalledOnce();
    expect(chain.toggleItalic).toHaveBeenCalledOnce();
    expect(chain.toggleCode).toHaveBeenCalledOnce();
    expect(chain.toggleStrike).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledTimes(8);
  });

  it('inserts tables and lists with editor commands in WYSIWYG mode', async () => {
    const run = vi.fn();
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.focus = vi.fn(() => chain);
    chain.run = run;
    for (const command of ['insertTable', 'toggleBulletList', 'toggleOrderedList', 'toggleTaskList']) {
      chain[command] = vi.fn(() => chain);
    }
    mocks.getMode.mockReturnValue('wysiwyg');
    mocks.getEditor.mockReturnValue({ chain: () => chain });

    await dispatchNativeMenuAction('insert-table');
    expect(chain.insertTable).toHaveBeenCalledWith({ rows: 3, cols: 2, withHeaderRow: true });
    await dispatchNativeMenuAction('insert-ul');
    expect(chain.toggleBulletList).toHaveBeenCalledOnce();
    await dispatchNativeMenuAction('insert-ol');
    expect(chain.toggleOrderedList).toHaveBeenCalledOnce();
    await dispatchNativeMenuAction('insert-task-list');
    expect(chain.toggleTaskList).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('inserts literal markdown placeholders in source mode', async () => {
    const dispatch = vi.fn();
    mocks.getMode.mockReturnValue('source');
    mocks.getSourceView.mockReturnValue({
      state: { selection: { main: { from: 5, to: 5 } } },
      dispatch,
      focus: vi.fn(),
    });

    await dispatchNativeMenuAction('insert-math-block');
    expect(dispatch.mock.calls[0][0].changes).toEqual({ from: 5, to: 5, insert: '$$公式$$' });
    expect(dispatch.mock.calls[0][0].selection).toEqual({ anchor: 7, head: 9 });

    await dispatchNativeMenuAction('inline-math');
    expect(dispatch.mock.calls[1][0].changes.insert).toBe('$公式$');

    await dispatchNativeMenuAction('insert-ul');
    expect(dispatch.mock.calls[2][0].changes.insert).toBe('- 列表项');
  });
});

describe('native menu dispatcher: recent history ids', () => {
  it('opens recent files and folders parsed from the action id', async () => {
    expect(await dispatchNativeMenuAction('recent-file:/work/notes/a.md')).toBe(true);
    expect(mocks.openFile).toHaveBeenCalledWith('/work/notes/a.md');

    // Recent folders skip the dialog but reuse the same reveal-the-tree flow.
    await dispatchNativeMenuAction('recent-folder:/work/notes');
    expect(mocks.activateWorkspaceFolder).toHaveBeenCalledWith('/work/notes');
  });

  it('keeps windows-style paths intact', async () => {
    await dispatchNativeMenuAction('recent-file:C:\\Users\\me\\note.md');
    expect(mocks.openFile).toHaveBeenCalledWith('C:\\Users\\me\\note.md');
  });
});

describe('native menu dispatcher: unknown ids and modal protection', () => {
  it('rejects unknown identifiers without side effects', async () => {
    expect(await dispatchNativeMenuAction('not-a-menu-action')).toBe(false);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.showNewFileDialog).not.toHaveBeenCalled();
  });

  it('suppresses document, tab and formatting actions while a modal is open', async () => {
    mocks.getWorkspacePath.mockReturnValue('/workspace');
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    mocks.getEditor.mockReturnValue({
      chain: () => ({ focus: () => ({ toggleBold: () => ({ run: vi.fn() }) }) }),
    });

    for (const action of [
      'new-tab',
      'close-tab',
      'next-tab',
      'new-file',
      'open-file',
      'save',
      'save-as',
      'export-pdf',
      'bold',
      'insert-link',
      'heading-1',
      'recent-file:/work/a.md',
    ]) {
      expect(await dispatchNativeMenuAction(action)).toBe(true);
    }

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
    expect(mocks.cycle).not.toHaveBeenCalled();
    expect(mocks.showNewFileDialog).not.toHaveBeenCalled();
    expect(mocks.dialogOpen).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.saveAs).not.toHaveBeenCalled();
    expect(mocks.exportDocument).not.toHaveBeenCalled();
    expect(mocks.showLinkDialog).not.toHaveBeenCalled();
    expect(mocks.openFile).not.toHaveBeenCalled();
  });

  it('still allows inherently safe actions while a modal is open', async () => {
    mocks.invoke.mockResolvedValue('/logs');
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';

    await dispatchNativeMenuAction('open-logs');
    expect(mocks.invoke).toHaveBeenCalledWith('get_log_dir');
    expect(mocks.shellOpen).toHaveBeenCalledWith('/logs');

    await dispatchNativeMenuAction('feedback');
    expect(mocks.shellOpen).toHaveBeenCalledWith('https://github.com/zsxink/MarkFlow/issues');
  });
});

describe('native menu dispatcher: issue #362 action coverage', () => {
  it('recognises every implemented (✅) menu action id', async () => {
    mocks.getEditor.mockReturnValue(null);
    mocks.getMode.mockReturnValue('wysiwyg');
    mocks.loadSettings.mockResolvedValue({ recentFiles: [], recentFolders: [] });
    mocks.confirmAll.mockResolvedValue(false);
    const implemented = [
      // 文件
      'new-file', 'new-tab', 'new-folder', 'open-file', 'open-folder', 'save', 'save-as',
      'export-html', 'export-pdf', 'export-word', 'clear-history', 'close-tab', 'close-window',
      'settings', 'quit',
      // 插入
      'insert-link', 'insert-code-block', 'insert-math-block', 'insert-table', 'insert-ul',
      'insert-ol', 'insert-task-list', 'insert-image',
      // 格式
      'heading-1', 'heading-2', 'heading-3', 'paragraph', 'bold', 'italic', 'inline-code',
      'strike', 'inline-math',
      // 视图
      'toggle-mode', 'toggle-sidebar', 'show-tree', 'show-outline', 'focus-mode', 'toggle-theme',
      // `devtools` is handled in Rust (native inspector API), so it never reaches
      // this dispatcher.
      // 窗口
      'next-tab', 'previous-tab', 'reopen-tab', 'close-all-tabs',
      // 帮助
      'open-logs', 'feedback',
    ];
    for (const action of implemented) {
      expect(await dispatchNativeMenuAction(action), action).toBe(true);
    }
  });

  it('rejects the disabled (⬜) placeholder ids', async () => {
    for (const action of [
      'check-updates',
      'quick-switch',
      'find',
      'replace',
      'insert-markdown-link',
      'insert-callout',
      'insert-footnote',
      'insert-fold',
      'heading-4',
      'heading-5',
      'heading-6',
      'highlight',
      'comment',
      'zoom-in',
      'zoom-out',
      'zoom-reset',
      'shortcuts',
    ]) {
      expect(await dispatchNativeMenuAction(action), action).toBe(false);
    }
  });
});

describe('native menu state sync', () => {
  it('reports workspace, document and recent history state to the backend', async () => {
    mocks.getWorkspacePath.mockReturnValue('/workspace');
    mocks.active.mockReturnValue('document-3');
    mocks.loadSettings.mockResolvedValue({
      recentFiles: ['/workspace/a.md'],
      recentFolders: ['/workspace'],
    });

    await syncNativeMenuState();

    expect(mocks.invoke).toHaveBeenCalledWith('update_menu_state', {
      hasWorkspace: true,
      hasDocument: true,
      recentFiles: ['/workspace/a.md'],
      recentFolders: ['/workspace'],
    });
  });

  it('reports empty state when nothing is open', async () => {
    mocks.getWorkspacePath.mockReturnValue(null);
    mocks.active.mockReturnValue(null);

    await syncNativeMenuState();

    expect(mocks.invoke).toHaveBeenCalledWith('update_menu_state', {
      hasWorkspace: false,
      hasDocument: false,
      recentFiles: [],
      recentFolders: [],
    });
  });

  it('subscribes to the menu event and syncs on init', async () => {
    await initNativeMenu();

    expect(mocks.listen).toHaveBeenCalledWith('menu:action', expect.any(Function));
    expect(mocks.tabsChanged).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.recentChanged).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.invoke).toHaveBeenCalledWith('update_menu_state', expect.any(Object));
  });

  it('re-syncs after dispatching an action', async () => {
    mocks.getWorkspacePath.mockReturnValue('/workspace');
    await dispatchNativeMenuAction('new-tab');
    expect(mocks.invoke).toHaveBeenCalledWith('update_menu_state', expect.any(Object));
  });

  it('does not re-report an unchanged state payload', async () => {
    // Document tab listeners fire on every dirty flip, which happens on each
    // edit; the menu state is unchanged, so no IPC round-trip is warranted.
    mocks.getWorkspacePath.mockReturnValue('/workspace');
    await syncNativeMenuState();
    await syncNativeMenuState();
    await syncNativeMenuState();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    // A real change reports again.
    mocks.getWorkspacePath.mockReturnValue(null);
    await syncNativeMenuState();
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('recovers the state cache after a failed report', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('ipc down'));
    await syncNativeMenuState();
    expect(mocks.logException).toHaveBeenCalledWith(
      'native-menu',
      'Failed to sync native menu state',
      expect.any(Error),
    );

    // The failed payload was not cached, so the next sync retries it.
    await syncNativeMenuState();
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('does not abort application boot when the menu bridge is unavailable', async () => {
    mocks.listen.mockRejectedValueOnce(new Error('no tauri runtime'));

    await expect(initNativeMenu()).resolves.toBeUndefined();
    expect(mocks.logException).toHaveBeenCalledWith(
      'native-menu',
      'Failed to subscribe to native menu actions',
      expect.any(Error),
    );
    // Nothing half-wired: no state sync when the event bridge never attached.
    expect(mocks.invoke).not.toHaveBeenCalledWith('update_menu_state', expect.any(Object));
  });
});
