import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setWorkspaceIPC, clearWorkspaceIPC, addRecentFolder, showToast } = vi.hoisted(() => ({
  setWorkspaceIPC: vi.fn(),
  clearWorkspaceIPC: vi.fn(),
  addRecentFolder: vi.fn(),
  showToast: vi.fn(),
}));
vi.mock('../../../infra/storage', () => ({
  setWorkspace: setWorkspaceIPC,
  clearWorkspace: clearWorkspaceIPC,
  addRecentFolder,
}));
vi.mock('../../../infra/logger', () => ({ logException: vi.fn(), logInfo: vi.fn() }));
vi.mock('../../toast', () => ({ showToast }));

import { store } from '../../../infra/store';
import { closeWorkspaceFolder, setWorkspacePath } from '../workspace';
import { getTreeState, setTreeState } from '../context';
import type { FileEntry } from '../../../types/file-tree';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  store.setState({ workspacePath: null });
  setTreeState({ nodes: new Map(), directories: new Map() });
});

function mountFileTree(children: string, hidden = false): HTMLElement {
  const nav = document.createElement('nav');
  nav.id = 'file-tree';
  nav.innerHTML = children;
  nav.hidden = hidden;
  document.body.appendChild(nav);
  return nav;
}

describe('setWorkspacePath(null)', () => {
  it('clears the backend workspace and then the store state', async () => {
    store.setState({ workspacePath: '/work' });
    clearWorkspaceIPC.mockResolvedValue(undefined);

    await setWorkspacePath(null);

    expect(clearWorkspaceIPC).toHaveBeenCalledTimes(1);
    expect(setWorkspaceIPC).not.toHaveBeenCalled();
    expect(store.getState().workspacePath).toBeNull();
  });

  it('keeps the current state when the backend cleanup fails', async () => {
    store.setState({ workspacePath: '/work' });
    clearWorkspaceIPC.mockRejectedValue(new Error('io'));

    await setWorkspacePath(null);

    expect(store.getState().workspacePath).toBe('/work');
  });
});

describe('closeWorkspaceFolder', () => {
  it('resets the tree to the empty state and toasts', async () => {
    const tree = mountFileTree('<div class="tree-folder" data-path="/work/a"><span>a</span></div>');
    store.setState({ workspacePath: '/work' });
    const entry: FileEntry = { name: 'a', path: '/work/a', isDir: true };
    setTreeState({ nodes: new Map([['/work/a', entry]]), directories: new Map() });
    clearWorkspaceIPC.mockResolvedValue(undefined);

    await closeWorkspaceFolder();

    expect(store.getState().workspacePath).toBeNull();
    expect(tree.innerHTML).toBe('<div class="empty-state">请先打开文件夹</div>');
    expect(getTreeState().nodes.size).toBe(0);
    expect(showToast).toHaveBeenCalledWith('工作区已关闭');
  });

  it('does not touch the hidden attribute owned by the sidebar tab logic', async () => {
    const tree = mountFileTree('', true);
    store.setState({ workspacePath: '/work' });
    clearWorkspaceIPC.mockResolvedValue(undefined);

    await closeWorkspaceFolder();

    expect(tree.hidden).toBe(true);
  });

  it('keeps the tree untouched when the backend cleanup fails', async () => {
    mountFileTree('<div class="tree-folder"></div>');
    store.setState({ workspacePath: '/work' });
    clearWorkspaceIPC.mockRejectedValue(new Error('io'));

    await closeWorkspaceFolder();

    expect(store.getState().workspacePath).toBe('/work');
    expect(document.getElementById('file-tree')!.innerHTML).not.toContain('empty-state');
    expect(showToast).not.toHaveBeenCalled();
  });
});
