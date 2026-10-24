import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readDirPage: vi.fn(),
  readPathEntry: vi.fn(),
  renamePath: vi.fn(),
}));

vi.mock('../../../infra/storage', () => ({
  readDirPage: mocks.readDirPage,
  readPathEntry: mocks.readPathEntry,
  renamePath: mocks.renamePath,
  setWorkspace: vi.fn(),
  openFileInNewWindow: vi.fn(),
}));
vi.mock('../../../infra/logger', () => ({ logException: vi.fn(), logInfo: vi.fn() }));

import {
  applyFileTreeEvents, createTreeNode, flushPendingMutations,
  loadDirectoryForTesting, refreshFileTree, resetFileTreeStateForTesting,
  restoreExpandedState,
} from '../core';
import { startInlineRename } from '../inline';
import { setActiveFilePath } from '../../active-document';
import { store } from '../../../infra/store';

beforeEach(() => {
  document.body.innerHTML = '<div id="file-tree"></div>';
  resetFileTreeStateForTesting();
  mocks.readDirPage.mockReset();
  mocks.readPathEntry.mockReset();
  mocks.renamePath.mockReset();
  store.setState({ workspacePath: '/ws', expandedPaths: [], activeFilePath: null });
});

describe('lazy file tree loading', () => {
  it('deduplicates concurrent loads for the same directory', async () => {
    let resolve!: (value: unknown) => void;
    mocks.readDirPage.mockReturnValue(new Promise(r => { resolve = r; }));
    const first = loadDirectoryForTesting('/ws');
    const second = loadDirectoryForTesting('/ws');
    expect(mocks.readDirPage).toHaveBeenCalledTimes(1);
    resolve({ entries: [], nextCursor: null, generation: '1', truncated: false });
    await Promise.all([first, second]);
  });

  it('allows retry after a load error', async () => {
    mocks.readDirPage
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ entries: [], nextCursor: null, generation: '2', truncated: false });
    await loadDirectoryForTesting('/ws');
    await loadDirectoryForTesting('/ws');
    expect(mocks.readDirPage).toHaveBeenCalledTimes(2);
  });

  it('appends a page without replacing an expanded existing folder DOM', async () => {
    mocks.readDirPage
      .mockResolvedValueOnce({ entries: [{ name: 'folder', path: '/ws/folder', isDir: true }], nextCursor: 'next', generation: '1', truncated: true })
      .mockResolvedValueOnce({ entries: [{ name: 'z.md', path: '/ws/z.md', isDir: false }], nextCursor: null, generation: '1', truncated: false });
    await loadDirectoryForTesting('/ws');
    const folder = document.querySelector('[data-path="/ws/folder"]')!;
    folder.querySelector('.tree-chevron')!.classList.add('expanded');
    await loadDirectoryForTesting('/ws', true);
    expect(document.querySelector('[data-path="/ws/folder"]')).toBe(folder);
    expect(folder.querySelector('.tree-chevron')?.classList.contains('expanded')).toBe(true);
    expect(document.querySelector('[data-path="/ws/z.md"]')).not.toBeNull();
  });

  it('marks an unloaded directory stale without reading it', async () => {
    mocks.readDirPage.mockResolvedValueOnce({ entries: [{ name: 'folder', path: '/ws/folder', isDir: true }], nextCursor: null, generation: '1', truncated: false });
    await loadDirectoryForTesting('/ws');
    await applyFileTreeEvents([{ path: '/ws/folder', kind: 'rescan', timestamp: 1, reason: 'overflow' }]);
    expect(mocks.readDirPage).toHaveBeenCalledTimes(1);
  });

  it('restores expanded descendants after a controlled root refresh', async () => {
    const initial = createTreeNode({ name: 'folder', path: '/ws/folder', isDir: true }, 0);
    document.getElementById('file-tree')!.appendChild(initial);
    initial.querySelector('.tree-chevron')!.classList.add('expanded');
    (initial.querySelector('.tree-children') as HTMLElement).hidden = false;
    mocks.readDirPage.mockImplementation((path: string) => Promise.resolve(path === '/ws'
      ? { entries: [{ name: 'folder', path: '/ws/folder', isDir: true }], nextCursor: null, generation: '1', truncated: false }
      : { entries: [{ name: 'a.md', path: '/ws/folder/a.md', isDir: false }], nextCursor: null, generation: '2', truncated: false }));
    await refreshFileTree();
    const folder = document.querySelector('[data-path="/ws/folder"]')!;
    expect(folder.querySelector('.tree-chevron')?.classList.contains('expanded')).toBe(true);
    expect(document.querySelector('[data-path="/ws/folder/a.md"]')).not.toBeNull();
  });

  it('renders the root when a persisted Windows root keeps its upper-case drive', async () => {
    // A workspace root persisted before the normalization fix is spelled
    // `C:/Notes` while every tree node key is lower-cased. The renderer used to
    // drop the root directory silently, leaving the sidebar empty (issue #375).
    store.setState({ workspacePath: 'C:/Notes', expandedPaths: [] });
    mocks.readDirPage.mockResolvedValue({
      entries: [{ name: 'folder', path: 'c:/Notes/folder', isDir: true }],
      nextCursor: null, generation: '1', truncated: false,
    });

    await refreshFileTree();

    expect(document.querySelector('[data-path="c:/Notes/folder"]')).not.toBeNull();
  });

  it('restores a persisted expanded path spelled with an upper-case drive', async () => {
    store.setState({ workspacePath: 'C:/Notes', expandedPaths: ['C:/Notes/folder'] });
    mocks.readDirPage.mockImplementation((path: string) => Promise.resolve(path === 'c:/Notes'
      ? { entries: [{ name: 'folder', path: 'c:/Notes/folder', isDir: true }], nextCursor: null, generation: '1', truncated: false }
      : { entries: [{ name: 'a.md', path: 'c:/Notes/folder/a.md', isDir: false }], nextCursor: null, generation: '2', truncated: false }));

    await loadDirectoryForTesting('c:/Notes');
    await restoreExpandedState();

    const folder = document.querySelector('[data-path="c:/Notes/folder"]');
    expect(folder?.querySelector('.tree-chevron')?.classList.contains('expanded')).toBe(true);
    expect(document.querySelector('[data-path="c:/Notes/folder/a.md"]')).not.toBeNull();
  });
});

describe('incremental rename state', () => {
  it('migrates DOM descendants, active path and expanded paths', async () => {
    const folder = createTreeNode({
      name: 'old', path: '/ws/old', isDir: true,
      children: [{ name: 'active.md', path: '/ws/old/active.md', isDir: false }],
    }, 0);
    document.getElementById('file-tree')!.appendChild(folder);
    store.setState({ expandedPaths: ['/ws/old'], workspacePath: '/ws' });
    setActiveFilePath('/ws/old/active.md');
    await applyFileTreeEvents([{ path: '/ws/old', toPath: '/ws/new', kind: 'rename', timestamp: 1 }]);
    flushPendingMutations();
    expect(document.querySelector('[data-path="/ws/new/active.md"]')).not.toBeNull();
    expect(store.getState().activeFilePath).toBe('/ws/new/active.md');
    expect(store.getState().expandedPaths).toEqual(['/ws/new']);
  });
});

describe('inline rename re-sort', () => {
  it('moves a file renamed to a last-sorting name above the load-more button', async () => {
    // Issue #419: the re-sort used to appendChild the node, landing a
    // last-sorting rename behind the pagination button / out of order.
    const root = document.getElementById('file-tree')!;
    root.appendChild(createTreeNode({ name: 'archive', path: '/ws/archive', isDir: true }, 0));
    root.appendChild(createTreeNode({ name: 'a.md', path: '/ws/a.md', isDir: false }, 0));
    root.appendChild(createTreeNode({ name: 'b.md', path: '/ws/b.md', isDir: false }, 0));
    const more = document.createElement('button');
    more.className = 'tree-load-more';
    more.textContent = '继续加载';
    root.appendChild(more);
    mocks.renamePath.mockResolvedValue(undefined);

    startInlineRename('/ws/b.md');
    const input = document.querySelector('.tree-inline-input') as HTMLInputElement;
    input.value = 'zz.md';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    await vi.waitFor(() => {
      expect(document.querySelector('[data-path="/ws/zz.md"]')).not.toBeNull();
    });
    expect(mocks.renamePath).toHaveBeenCalledWith('/ws/b.md', '/ws/zz.md');

    const labels = Array.from(root.children).map(child => {
      if (child.classList.contains('tree-load-more')) return '(load-more)';
      const span = child.querySelector(':scope > span, :scope > .tree-folder > span') as HTMLElement | null;
      return span?.textContent || '';
    });
    // Matches a full refresh ordered by compareEntries: folders first, then
    // files by name, pagination button always last.
    expect(labels).toEqual(['archive', 'a.md', 'zz.md', '(load-more)']);
  });
});
