import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readDirPage: vi.fn(),
  readPathEntry: vi.fn(),
  renamePath: vi.fn(),
  refreshFileTree: vi.fn(),
  expandAllFolders: vi.fn(),
  collapseAllFolders: vi.fn(),
  startInlineCreate: vi.fn(),
}));

// Real loader is partially kept: `loadDirectory` stays genuine so the
// root-render → header-mount wiring can be exercised; only the bulk actions
// header.ts wires are replaced (same shape as lazy.test.ts mocks).
vi.mock('../loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../loader')>();
  return {
    ...actual,
    refreshFileTree: mocks.refreshFileTree,
    expandAllFolders: mocks.expandAllFolders,
    collapseAllFolders: mocks.collapseAllFolders,
  };
});
vi.mock('../inline', () => ({ startInlineCreate: mocks.startInlineCreate }));
vi.mock('../../../infra/storage', () => ({
  readDirPage: mocks.readDirPage,
  readPathEntry: mocks.readPathEntry,
  renamePath: mocks.renamePath,
  setWorkspace: vi.fn(),
  clearWorkspace: vi.fn(),
  addRecentFolder: vi.fn(),
  createFile: vi.fn(),
  createDir: vi.fn(),
  readSingleDir: vi.fn(),
}));
vi.mock('../../../infra/logger', () => ({ logException: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }));

import { mountTreeHeader, resolveCreateTargetDir, hasCollapsedFolder } from '../header';
import { registerTreeHeaderMounter } from '../context';
import { loadDirectoryForTesting, resetFileTreeStateForTesting } from '../core';
import { store } from '../../../infra/store';
import { DEFAULT_SETTINGS } from '../../../types/settings';

beforeEach(() => {
  document.body.innerHTML = '<div id="file-tree"></div>';
  resetFileTreeStateForTesting();
  mocks.readDirPage.mockReset();
  mocks.readPathEntry.mockReset();
  mocks.renamePath.mockReset();
  mocks.refreshFileTree.mockReset();
  mocks.expandAllFolders.mockReset();
  mocks.collapseAllFolders.mockReset();
  mocks.startInlineCreate.mockReset();
  store.setState({
    workspacePath: '/ws',
    expandedPaths: [],
    activeFilePath: null,
    settings: { ...DEFAULT_SETTINGS },
  });
});

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

function mountHeaderAndGet(): HTMLElement {
  mountTreeHeader();
  return document.querySelector('.tree-header') as HTMLElement;
}

describe('tree header rendering', () => {
  it('mounts the sticky header at the top of the tree with the root folder name', () => {
    appendFolder('/ws/a', false);
    const header = mountHeaderAndGet();

    expect(document.getElementById('file-tree')!.firstElementChild).toBe(header);
    expect(header.className).toBe('tree-header');
    expect(header.querySelector('.tree-header-name')!.textContent).toBe('ws');
    const buttons = header.querySelectorAll('.tree-header-action');
    expect(buttons.length).toBe(4);
    expect(Array.from(buttons).map(b => b.getAttribute('aria-label'))).toEqual([
      '新建文件', '新建文件夹', '刷新', '展开所有文件夹',
    ]);
  });

  it('derives the root name from Windows-style separators too', () => {
    store.setState({ workspacePath: 'C:\\Users\\me\\Notes' });
    expect(mountHeaderAndGet().querySelector('.tree-header-name')!.textContent).toBe('Notes');
  });

  it('renders nothing without a workspace and removes a stale header', () => {
    store.setState({ workspacePath: null });
    mountTreeHeader();
    expect(document.querySelector('.tree-header')).toBeNull();

    store.setState({ workspacePath: '/ws' });
    mountTreeHeader();
    expect(document.querySelector('.tree-header')).not.toBeNull();

    store.setState({ workspacePath: null });
    mountTreeHeader();
    expect(document.querySelector('.tree-header')).toBeNull();
  });

  it('refreshes the name and keeps the first position on re-mount', () => {
    appendFolder('/ws/a', false);
    const first = mountHeaderAndGet();
    store.setState({ workspacePath: '/other' });
    mountTreeHeader();

    const refreshed = document.querySelector('.tree-header') as HTMLElement;
    expect(refreshed).toBe(first);
    expect(refreshed.querySelector('.tree-header-name')!.textContent).toBe('other');
    expect(document.getElementById('file-tree')!.firstElementChild).toBe(refreshed);
  });

  it('is re-mounted by the loader after a root render wipes the tree', async () => {
    mountTreeHeader();
    const mounter = vi.fn(() => mountTreeHeader());
    registerTreeHeaderMounter(mounter);
    mocks.readDirPage.mockResolvedValue({
      entries: [{ name: 'a', path: '/ws/a', isDir: true }],
      nextCursor: null,
      generation: '1',
      truncated: false,
    });

    await loadDirectoryForTesting('/ws');

    // Root render clears #file-tree (dropping the header) then pulls the
    // mount hook, so the header ends up on top again.
    expect(mounter).toHaveBeenCalledTimes(1);
    const tree = document.getElementById('file-tree')!;
    expect(tree.querySelector('.tree-header')).not.toBeNull();
    expect(tree.firstElementChild!.classList.contains('tree-header')).toBe(true);
  });
});

describe('resolveCreateTargetDir', () => {
  it('creates inside the selected folder', () => {
    const folder = document.createElement('div');
    folder.className = 'tree-folder';
    folder.dataset.path = '/ws/docs';
    folder.setAttribute('aria-selected', 'true');
    document.getElementById('file-tree')!.appendChild(folder);

    expect(resolveCreateTargetDir()).toBe('/ws/docs');
  });

  it('creates beside the selected file (same directory)', () => {
    const file = document.createElement('div');
    file.className = 'tree-file active';
    file.dataset.path = '/ws/notes/todo.md';
    document.getElementById('file-tree')!.appendChild(file);

    expect(resolveCreateTargetDir()).toBe('/ws/notes');
  });

  it('falls back to the workspace root without a selection', () => {
    expect(resolveCreateTargetDir()).toBe('/ws');
  });

  it('returns null so callers can bail out without a workspace', () => {
    store.setState({ workspacePath: null });
    expect(resolveCreateTargetDir()).toBeNull();
  });
});

describe('tree header actions', () => {
  function clickAction(label: string): void {
    mountTreeHeader();
    document.querySelector(`.tree-header-action[aria-label="${label}"]`)!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
  }

  it('new file / new folder create in the directory following the selection', () => {
    const file = document.createElement('div');
    file.className = 'tree-file active';
    file.dataset.path = '/ws/docs/readme.md';
    document.getElementById('file-tree')!.appendChild(file);

    clickAction('新建文件');
    expect(mocks.startInlineCreate).toHaveBeenCalledWith('file', '/ws/docs');
    clickAction('新建文件夹');
    expect(mocks.startInlineCreate).toHaveBeenCalledWith('folder', '/ws/docs');
  });

  it('refresh triggers refreshFileTree', () => {
    clickAction('刷新');
    expect(mocks.refreshFileTree).toHaveBeenCalledTimes(1);
  });

  it('toggle expands everything while any rendered folder is still collapsed', () => {
    appendFolder('/ws/a', true);
    appendFolder('/ws/b', false);
    clickAction('展开所有文件夹');

    expect(mocks.expandAllFolders).toHaveBeenCalledTimes(1);
    expect(mocks.collapseAllFolders).not.toHaveBeenCalled();
  });

  it('toggle collapses everything when every rendered folder is expanded', () => {
    appendFolder('/ws/a', true);
    appendFolder('/ws/b', true);
    clickAction('收起所有文件夹');

    expect(mocks.collapseAllFolders).toHaveBeenCalledTimes(1);
    expect(mocks.expandAllFolders).not.toHaveBeenCalled();
  });

  it('toggle collapses on an empty tree as a no-op fold', () => {
    // No folders at all → nothing to expand, so the button offers folding.
    clickAction('收起所有文件夹');
    expect(mocks.collapseAllFolders).toHaveBeenCalledTimes(1);
  });

  it('the toggle button icon and label mirror the action it would perform next', async () => {
    appendFolder('/ws/a', false);
    mountTreeHeader();
    const button = document.querySelector('.tree-header-toggle') as HTMLButtonElement;

    expect(button.getAttribute('aria-label')).toBe('展开所有文件夹');
    expect(button.querySelector('svg')!.innerHTML).toContain('m7 9 5-5 5 5');

    // Fully expanded → folding icon/label; clicking flips back after the toggle.
    appendFolder('/ws/b', true);
    document.querySelector('[data-path="/ws/a"] .tree-chevron')!.classList.add('expanded');
    mountTreeHeader();
    expect(button.getAttribute('aria-label')).toBe('收起所有文件夹');
    expect(button.querySelector('svg')!.innerHTML).toContain('m7 4 5 5 5-5');

    // Click with a folded tree runs the expand action; the mocked loader
    // leaves the DOM folded, so the post-toggle refresh still reads the
    // expanding state (real expandAllFolders would flip it to folding).
    document.querySelector('[data-path="/ws/a"] .tree-chevron')!.classList.remove('expanded');
    mountTreeHeader();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.expandAllFolders).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-label')).toBe('展开所有文件夹');
  });

  it('the collapse chevron and the folder name fold the whole tree', () => {
    mountTreeHeader();
    document.querySelector('.tree-chevron-btn')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(mocks.collapseAllFolders).toHaveBeenCalledTimes(1);

    document.querySelector('.tree-header-name')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(mocks.collapseAllFolders).toHaveBeenCalledTimes(2);
  });

  it('hasCollapsedFolder only counts folders with rendered children', () => {
    appendFolder('/ws/a', false);
    expect(hasCollapsedFolder()).toBe(true);

    // A folder without a children container is not foldable and must not count.
    const bare = document.createElement('div');
    bare.className = 'tree-folder';
    bare.innerHTML = '<svg class="tree-chevron"></svg>';
    document.getElementById('file-tree')!.appendChild(bare);
    expect(hasCollapsedFolder()).toBe(true);

    document.querySelector('[data-path="/ws/a"] .tree-chevron')!.classList.add('expanded');
    expect(hasCollapsedFolder()).toBe(false);
  });
});
