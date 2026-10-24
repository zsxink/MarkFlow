// ── Workspace path + watcher suppression ──────────────────────────────
// The workspace root and the "we just wrote this path ourselves" suppression
// list. Both are read by the loader, the renderer and the event applier, so
// they live below them.

import {
  setWorkspace as setWorkspaceIPC,
  clearWorkspace as clearWorkspaceIPC,
  addRecentFolder,
} from '../../infra/storage';
import { logException, logInfo } from '../../infra/logger';
import { store } from '../../infra/store';
import { normalizeWorkspacePath } from '../../utils/paths';
import { setTreeState, suppressPaths, SUPPRESS_DURATION_MS } from './context';
import { createFileTreeState } from './state';
import { showToast } from '../toast';

export function getWorkspacePath() {
  return store.getState().workspacePath;
}

export async function setWorkspacePath(path: string | null) {
  const normalized = path ? normalizeWorkspacePath(path) : null;
  if (path) {
    try {
      await setWorkspaceIPC(path);
      store.setState({ workspacePath: normalized });
      try {
        await addRecentFolder(path);
      } catch (e) {
        logException('file-tree.workspace', 'Failed to record recent folder', e, { path });
      }
      logInfo('file-tree.workspace', 'Workspace selected', { path: normalized });
    } catch (e) {
      logException('file-tree.workspace', 'Failed to set workspace', e, { path });
    }
    return;
  }
  // Closing must also stop the backend watcher and drop the persisted
  // last_workspace; on failure the state stays put so both sides cannot
  // disagree about whether a workspace is open (mirrors the path branch).
  try {
    await clearWorkspaceIPC();
    store.setState({ workspacePath: null });
    logInfo('file-tree.workspace', 'Workspace closed');
  } catch (e) {
    logException('file-tree.workspace', 'Failed to clear workspace', e);
  }
}

/** Restore the pristine "请先打开文件夹" DOM and an empty tree model. */
export function resetFileTreeToEmptyState() {
  const container = document.getElementById('file-tree');
  if (container) container.innerHTML = '<div class="empty-state">请先打开文件夹</div>';
  setTreeState(createFileTreeState());
}

/**
 * Close the current workspace folder: clear backend + frontend workspace
 * state, then reset the tree to its empty state. Open document tabs are
 * deliberately untouched (spec: workspace-close).
 */
export async function closeWorkspaceFolder() {
  await setWorkspacePath(null);
  // setWorkspacePath logs and swallows backend failures; resetting the tree on
  // top of a workspace that is still open would strand the user (guard
  // philosophy shared with activateWorkspaceFolder).
  if (getWorkspacePath()) return;
  resetFileTreeToEmptyState();
  showToast('文件夹已关闭');
}

export function suppressNextWatcherRefresh(path: string) {
  suppressPaths.set(path, Date.now());
}

/** Remove a just-created suppression when its local write does not complete. */
export function cancelSuppressedWatcherRefresh(path: string) {
  suppressPaths.delete(path);
}

export function isSuppressedPath(path: string): boolean {
  const now = Date.now();
  for (const [suppressed, addedAt] of suppressPaths) {
    if (now - addedAt > SUPPRESS_DURATION_MS) {
      suppressPaths.delete(suppressed);
      continue;
    }
    if (path === suppressed || path.startsWith(suppressed + '/')) return true;
  }
  return false;
}

export function suppressAllDescendants(path: string) {
  const now = Date.now();
  suppressPaths.set(path, now);
  suppressPaths.set(path + '/', now);
}
