import { beforeEach, describe, expect, it, vi } from 'vitest';

const fileTreeMocks = vi.hoisted(() => ({
  refreshFileTree: vi.fn(),
  initTreeAria: vi.fn(),
  setWorkspacePath: vi.fn(),
  getWorkspacePath: vi.fn(() => '/ws'),
  startInlineCreate: vi.fn(),
  collapseAllFolders: vi.fn(),
  expandAllFolders: vi.fn(),
}));

vi.mock('../file-tree/index', () => fileTreeMocks);
vi.mock('../file-tree/dragdrop', () => ({ initMouseDrag: vi.fn() }));
vi.mock('../outline', () => ({ initOutline: vi.fn() }));
vi.mock('../file-tree-context-menu', () => ({ showContextMenu: vi.fn() }));
vi.mock('../toast', () => ({ showToast: vi.fn() }));
vi.mock('../../infra/storage', () => ({ saveSettings: vi.fn() }));
vi.mock('../../infra/logger', () => ({ logException: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../sidebar/fileops', () => ({
  saveActiveDocument: vi.fn(),
  reloadActiveDocumentFromDisk: vi.fn(),
  openFileInEditor: vi.fn(),
  confirmDocumentTransition: vi.fn(),
  isSavingInProgress: vi.fn(),
}));
vi.mock('../sidebar/conflict', () => ({
  handleExternalDeletion: vi.fn(),
  handleActiveDocumentExternalModification: vi.fn(),
}));

import { initSidebar, switchSidebarTab } from '../sidebar';
import { saveSettings } from '../../infra/storage';

function setupSidebarDom(): void {
  document.body.innerHTML = `
    <aside id="sidebar">
      <div class="sidebar-tabs">
        <button class="sidebar-tab" data-tab="files">文件</button>
        <button class="sidebar-tab active" data-tab="outline">大纲</button>
        <button id="tree-toggle-all" class="sidebar-tree-toggle" type="button" hidden></button>
      </div>
      <nav id="file-tree" hidden></nav>
      <nav id="outline-tree"></nav>
      <div id="sidebar-footer" class="sidebar-footer"></div>
    </aside>`;
}

/** Minimal folder node: wrapper > [.tree-folder + .tree-children], as render.ts builds. */
function appendFolder(path: string, expanded: boolean): void {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-folder-wrapper';
  const folder = document.createElement('div');
  folder.className = 'tree-folder';
  folder.dataset.path = path;
  folder.innerHTML = '<svg class="tree-chevron"></svg><span>name</span>';
  if (expanded) folder.querySelector('.tree-chevron')!.classList.add('expanded');
  const children = document.createElement('div');
  children.className = 'tree-children';
  children.hidden = !expanded;
  wrapper.append(folder, children);
  document.getElementById('file-tree')!.appendChild(wrapper);
}

beforeEach(() => {
  setupSidebarDom();
  fileTreeMocks.expandAllFolders.mockReset();
  fileTreeMocks.collapseAllFolders.mockReset();
  vi.mocked(saveSettings).mockReset();
});

describe('sidebar tree-toggle-all button', () => {
  it('follows the files tab visibility', () => {
    initSidebar();
    const toggle = document.getElementById('tree-toggle-all') as HTMLElement;
    expect(toggle.hidden).toBe(true);

    switchSidebarTab('files');
    expect(toggle.hidden).toBe(false);

    switchSidebarTab('outline');
    expect(toggle.hidden).toBe(true);
  });

  it('expands everything while any rendered folder is still collapsed', () => {
    initSidebar();
    switchSidebarTab('files');
    appendFolder('/ws/a', true);
    appendFolder('/ws/b', false);

    document.getElementById('tree-toggle-all')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(fileTreeMocks.expandAllFolders).toHaveBeenCalledTimes(1);
    expect(fileTreeMocks.collapseAllFolders).not.toHaveBeenCalled();
    // The button sits in the tab row but must not behave like a tab click.
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('collapses everything when every rendered folder is expanded', () => {
    initSidebar();
    switchSidebarTab('files');
    appendFolder('/ws/a', true);
    appendFolder('/ws/b', true);

    document.getElementById('tree-toggle-all')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(fileTreeMocks.collapseAllFolders).toHaveBeenCalledTimes(1);
    expect(fileTreeMocks.expandAllFolders).not.toHaveBeenCalled();
  });

  it('collapses on an empty tree as a no-op fold', () => {
    initSidebar();
    switchSidebarTab('files');

    document.getElementById('tree-toggle-all')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(fileTreeMocks.collapseAllFolders).toHaveBeenCalledTimes(1);
  });
});
