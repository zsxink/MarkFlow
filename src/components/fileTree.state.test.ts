import { describe, expect, it } from 'vitest';
import { applyTreeEvent, createFileTreeState, markDirectoryState, mergeDirectoryPage, renameTreePath, upsertTreeEntry } from './fileTree.state';

describe('file tree normalized state', () => {
  it('merges pages without duplicates and keeps directories first', () => {
    let state = createFileTreeState();
    state = mergeDirectoryPage(state, '/ws', [
      { name: 'z.md', path: '/ws/z.md', isDir: false },
      { name: 'folder', path: '/ws/folder', isDir: true },
    ], { nextCursor: 'next', generation: '1', append: false });
    state = mergeDirectoryPage(state, '/ws', [
      { name: 'z.md', path: '/ws/z.md', isDir: false },
      { name: 'a.md', path: '/ws/a.md', isDir: false },
    ], { nextCursor: null, generation: '1', append: true });
    expect(state.directories.get('/ws')?.children).toEqual(['/ws/folder', '/ws/a.md', '/ws/z.md']);
  });

  it('moves a renamed subtree between parent child lists', () => {
    let state = createFileTreeState();
    state = markDirectoryState(state, '/ws/a', 'loaded');
    state = markDirectoryState(state, '/ws/b', 'loaded');
    state = upsertTreeEntry(state, '/ws/a', { name: 'folder', path: '/ws/a/folder', isDir: true });
    state = upsertTreeEntry(state, '/ws/a/folder', { name: 'file.md', path: '/ws/a/folder/file.md', isDir: false });
    state = renameTreePath(state, '/ws/a/folder', '/ws/b/renamed');
    expect(state.directories.get('/ws/a')?.children).toEqual([]);
    expect(state.directories.get('/ws/b')?.children).toEqual(['/ws/b/renamed']);
    expect(state.nodes.has('/ws/b/renamed/file.md')).toBe(true);
  });

  it('deletes a subtree without invalidating unrelated nodes', () => {
    let state = createFileTreeState();
    state = markDirectoryState(state, '/ws', 'loaded');
    state = upsertTreeEntry(state, '/ws', { name: 'folder', path: '/ws/folder', isDir: true });
    state = upsertTreeEntry(state, '/ws/folder', { name: 'a.md', path: '/ws/folder/a.md', isDir: false });
    state = upsertTreeEntry(state, '/ws', { name: 'keep.md', path: '/ws/keep.md', isDir: false });
    state = applyTreeEvent(state, { path: '/ws/folder', kind: 'delete', timestamp: 1 });
    expect(state.nodes.has('/ws/folder')).toBe(false);
    expect(state.nodes.has('/ws/folder/a.md')).toBe(false);
    expect(state.nodes.has('/ws/keep.md')).toBe(true);
  });

  it('re-sorts siblings after a same-parent rename', () => {
    let state = createFileTreeState();
    state = markDirectoryState(state, '/ws', 'loaded');
    state = upsertTreeEntry(state, '/ws', { name: 'a.md', path: '/ws/a.md', isDir: false });
    state = upsertTreeEntry(state, '/ws', { name: 'b.md', path: '/ws/b.md', isDir: false });
    state = renameTreePath(state, '/ws/a.md', '/ws/z.md');
    expect(state.directories.get('/ws')?.children).toEqual(['/ws/b.md', '/ws/z.md']);
  });
});
