import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readDirPage: vi.fn(),
  readPathEntry: vi.fn(),
}));

vi.mock('../lib/storage', () => ({
  readDirPage: mocks.readDirPage,
  readPathEntry: mocks.readPathEntry,
  setWorkspace: vi.fn(),
  openFileInNewWindow: vi.fn(),
}));
vi.mock('../lib/logger', () => ({ logException: vi.fn(), logInfo: vi.fn() }));

import {
  applyFileTreeEvents, createTreeNode, flushPendingMutations,
  loadDirectoryForTesting, refreshFileTree, resetFileTreeStateForTesting,
} from './fileTree.core';
import { setActiveFilePath } from './activeDocument';
import { store } from '../lib/store';

beforeEach(() => {
  document.body.innerHTML = '<div id="file-tree"></div>';
  resetFileTreeStateForTesting();
  mocks.readDirPage.mockReset();
  mocks.readPathEntry.mockReset();
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
