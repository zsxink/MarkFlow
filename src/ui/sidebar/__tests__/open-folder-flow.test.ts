import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dialogOpen: vi.fn(),
  setWorkspacePath: vi.fn(),
  refreshFileTree: vi.fn(),
  getWorkspacePath: vi.fn<() => string | null>(() => null),
  showToast: vi.fn(),
  initTreeAria: vi.fn(),
  startInlineCreate: vi.fn(),
  initMouseDrag: vi.fn(),
  initOutline: vi.fn(),
  showContextMenu: vi.fn(),
  saveSettings: vi.fn(),
  logException: vi.fn(),
  saveActiveDocument: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.dialogOpen }));
vi.mock('../../../infra/storage', () => ({ saveSettings: mocks.saveSettings }));
vi.mock('../../../infra/logger', () => ({ logException: mocks.logException }));
vi.mock('../../toast', () => ({ showToast: mocks.showToast }));
vi.mock('../../file-tree/index', () => ({
  setWorkspacePath: mocks.setWorkspacePath,
  refreshFileTree: mocks.refreshFileTree,
  getWorkspacePath: mocks.getWorkspacePath,
  initTreeAria: mocks.initTreeAria,
  startInlineCreate: mocks.startInlineCreate,
}));
vi.mock('../../file-tree/dragdrop', () => ({ initMouseDrag: mocks.initMouseDrag }));
vi.mock('../../outline', () => ({ initOutline: mocks.initOutline }));
vi.mock('../../file-tree-context-menu', () => ({ showContextMenu: mocks.showContextMenu }));
vi.mock('../fileops', () => ({ saveActiveDocument: mocks.saveActiveDocument }));
vi.mock('../conflict', () => ({
  handleExternalDeletion: vi.fn(),
  handleActiveDocumentExternalModification: vi.fn(),
}));
vi.mock('../../active-document', () => ({
  getActiveFilePath: vi.fn(),
  setActiveFilePath: vi.fn(),
  rewriteActiveDocumentPath: vi.fn(),
  clearActiveDocument: vi.fn(),
  clearActiveDocumentIfMatches: vi.fn(),
}));

const { openWorkspaceFolderFlow, activateWorkspaceFolder, switchSidebarTab, revealFilesTab } =
  await import('../index');

function mountSidebar(options: { collapsed?: boolean } = {}): HTMLElement {
  document.body.innerHTML = `
    <button id="sidebar-toggle"></button>
    <aside id="sidebar" class="${options.collapsed ? 'collapsed' : ''}">
      <div class="sidebar-tabs">
        <button class="sidebar-tab" data-tab="files">文件</button>
        <button class="sidebar-tab active" data-tab="outline">大纲</button>
      </div>
      <nav id="file-tree" hidden></nav>
      <nav id="outline-tree"></nav>
      <div id="sidebar-footer" class="sidebar-footer" style="display:none">
        <button id="sidebar-open-btn"></button>
        <button id="sidebar-newfolder-btn"></button>
      </div>
    </aside>
  `;
  return document.getElementById('sidebar') as HTMLElement;
}

function activeTab(): string | undefined {
  return Array.from(document.querySelectorAll('.sidebar-tab'))
    .find(tab => tab.classList.contains('active'))
    ?.getAttribute('data-tab') ?? undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveSettings.mockResolvedValue(undefined);
  mocks.getWorkspacePath.mockReturnValue(null);
});

describe('openWorkspaceFolderFlow', () => {
  it('registers the folder, loads the tree and reveals the files tab', async () => {
    mountSidebar();
    mocks.dialogOpen.mockResolvedValue('C:\\Users\\me\\Notes');
    mocks.getWorkspacePath.mockReturnValue('c:/Users/me/Notes');

    await openWorkspaceFolderFlow();

    expect(mocks.dialogOpen).toHaveBeenCalledWith({ directory: true, multiple: false });
    expect(mocks.setWorkspacePath).toHaveBeenCalledWith('C:\\Users\\me\\Notes');
    expect(mocks.refreshFileTree).toHaveBeenCalledOnce();
    expect(activeTab()).toBe('files');
    expect((document.getElementById('file-tree') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('outline-tree') as HTMLElement).hidden).toBe(true);
    expect(mocks.showToast).toHaveBeenCalledWith('文件夹已打开');
  });

  it('has no side effects when the dialog is cancelled', async () => {
    mountSidebar();
    mocks.dialogOpen.mockResolvedValue(null);

    await openWorkspaceFolderFlow();

    expect(mocks.setWorkspacePath).not.toHaveBeenCalled();
    expect(mocks.refreshFileTree).not.toHaveBeenCalled();
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(activeTab()).toBe('outline');
    expect((document.getElementById('file-tree') as HTMLElement).hidden).toBe(true);
  });

  it('expands a collapsed sidebar through the toggle button', async () => {
    const sidebar = mountSidebar({ collapsed: true });
    const toggle = document.getElementById('sidebar-toggle') as HTMLElement;
    // Mirror the toolbar toggle so the assertion targets the real button, not a spy.
    toggle.addEventListener('click', () => sidebar.classList.remove('collapsed'));
    mocks.dialogOpen.mockResolvedValue('/ws');
    mocks.getWorkspacePath.mockReturnValue('/ws');

    await openWorkspaceFolderFlow();

    expect(sidebar.classList.contains('collapsed')).toBe(false);
    expect(activeTab()).toBe('files');
  });
});

describe('activateWorkspaceFolder', () => {
  it('skips the dialog but still reveals the files tab', async () => {
    mountSidebar();
    mocks.getWorkspacePath.mockReturnValue('/work/notes');
    await activateWorkspaceFolder('/work/notes');

    expect(mocks.dialogOpen).not.toHaveBeenCalled();
    expect(mocks.setWorkspacePath).toHaveBeenCalledWith('/work/notes');
    expect(mocks.refreshFileTree).toHaveBeenCalledOnce();
    expect(activeTab()).toBe('files');
    expect(mocks.showToast).toHaveBeenCalledWith('文件夹已打开');
  });

  it('reports nothing when the backend rejects the workspace path', async () => {
    mountSidebar();
    // setWorkspacePath leaves store.workspacePath untouched when set_workspace
    // fails, so getWorkspacePath stays null and the flow must stop silently.
    mocks.getWorkspacePath.mockReturnValue(null);

    await activateWorkspaceFolder('/nope');

    expect(mocks.refreshFileTree).not.toHaveBeenCalled();
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(activeTab()).toBe('outline');
  });
});

describe('revealFilesTab', () => {
  it('leaves an expanded sidebar untouched and switches to files', () => {
    mountSidebar();
    const toggle = document.getElementById('sidebar-toggle') as HTMLElement;
    const toggleSpy = vi.spyOn(toggle, 'click');

    revealFilesTab();

    expect(toggleSpy).not.toHaveBeenCalled();
    expect(activeTab()).toBe('files');
  });

  it('expands a collapsed sidebar before switching tabs', () => {
    const sidebar = mountSidebar({ collapsed: true });
    const toggle = document.getElementById('sidebar-toggle') as HTMLElement;
    toggle.addEventListener('click', () => sidebar.classList.remove('collapsed'));

    revealFilesTab();

    expect(sidebar.classList.contains('collapsed')).toBe(false);
    expect(activeTab()).toBe('files');
  });

  it('keeps the footer visible only on the files tab', () => {
    mountSidebar();
    switchSidebarTab('files');
    expect((document.getElementById('sidebar-footer') as HTMLElement).style.display).toBe('flex');
    switchSidebarTab('outline');
    expect((document.getElementById('sidebar-footer') as HTMLElement).style.display).toBe('none');
  });
});
