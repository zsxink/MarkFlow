import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
      </div>
      <nav id="file-tree" hidden><div class="tree-header"></div></nav>
      <nav id="outline-tree"></nav>
      <div id="sidebar-footer" class="sidebar-footer">
        <button id="sidebar-open-btn">打开文件夹</button>
      </div>
    </aside>`;
}

beforeEach(() => {
  setupSidebarDom();
  fileTreeMocks.expandAllFolders.mockReset();
  fileTreeMocks.collapseAllFolders.mockReset();
  vi.mocked(saveSettings).mockReset();
});

describe('sidebar file-tree header integration', () => {
  it('hides the whole tree (header included) outside the files tab', () => {
    initSidebar();
    const fileTree = document.getElementById('file-tree') as HTMLElement;

    // The header lives inside #file-tree, so tab switching alone governs its
    // visibility — no separate toggle button to keep in sync anymore.
    expect(fileTree.hidden).toBe(true);
    expect(document.getElementById('tree-toggle-all')).toBeNull();

    switchSidebarTab('files');
    expect(fileTree.hidden).toBe(false);

    switchSidebarTab('outline');
    expect(fileTree.hidden).toBe(true);
  });

  it('keeps the footer visible only on the files tab', () => {
    initSidebar();
    const footer = document.getElementById('sidebar-footer') as HTMLElement;

    switchSidebarTab('files');
    expect(footer.style.display).toBe('flex');
    switchSidebarTab('outline');
    expect(footer.style.display).toBe('none');
  });

  it('persists the tab preference on tab clicks', async () => {
    initSidebar();
    vi.mocked(saveSettings).mockResolvedValue(undefined);
    const filesTab = document.querySelector<HTMLElement>('.sidebar-tab[data-tab="files"]')!;
    filesTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(saveSettings).toHaveBeenCalledWith({ lastSidebarTab: 'files' });
  });
});

describe('static shell contract (issue #424)', () => {
  const readRepoFile = (rel: string) =>
    readFileSync(resolve(process.cwd(), rel), 'utf8');

  it('index.html keeps a single footer action and no tab-row toggle', () => {
    const html = readRepoFile('index.html');
    expect(html).toContain('sidebar-open-btn');
    expect(html).not.toContain('sidebar-newfolder-btn');
    expect(html).not.toContain('tree-toggle-all');
  });

  it('sidebar.css pins the header and reveals actions on hover/focus', () => {
    const css = readRepoFile('src/styles/sidebar.css');
    expect(css).toContain('.tree-header');
    expect(css).toContain('position: sticky');
    // :hover cannot be triggered under happy-dom, so the visibility rules are
    // asserted against the stylesheet itself.
    expect(css).toContain('#file-tree:hover .tree-header-actions');
    expect(css).toContain('.tree-header:focus-within .tree-header-actions');
    expect(css).not.toContain('.sidebar-tree-toggle');
  });
});
