// ── Workspace path + watcher suppression ──────────────────────────────
// The workspace root and the "we just wrote this path ourselves" suppression
// list. Both are read by the loader, the renderer and the event applier, so
// they live below them.

import { setWorkspace as setWorkspaceIPC, addRecentFolder } from '../../infra/storage';
import { logException, logInfo } from '../../infra/logger';
import { store } from '../../infra/store';
import { normalizeWorkspacePath } from '../../utils/paths';
import { suppressPaths, SUPPRESS_DURATION_MS } from './context';

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
  store.setState({ workspacePath: null });
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
