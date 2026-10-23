// ── Incremental file-tree events ──────────────────────────────────────
// Applies watcher events (create/delete/rename/rescan) to the tree state and
// schedules the matching DOM mutations in one animation frame.

import { readPathEntry } from '../../infra/storage';
import { logException, logInfo } from '../../infra/logger';
import { store } from '../../infra/store';
import type { FileChangeEvent } from '../../types/events';
import { rewriteActiveDocumentPath } from '../active-document';
import {
  getTreeState,
  queueMutation,
  scheduleRafFlush,
  setTreeState,
  treeMetrics,
} from './context';
import {
  applyTreeEvent,
  markDirectoryState,
  normalizeTreePath,
  upsertTreeEntry,
} from './state';
import { isSuppressedPath } from './workspace';
import { loadDirectory, restoreExpandedState, saveExpandedState } from './loader';
import { insertEntryIntoTree, removeEntryFromTree, renamePathDom } from './render';

export async function applyFileTreeEvents(events: FileChangeEvent[]) {
  treeMetrics.incrementalBatchCount++;
  for (const event of events) {
    if (isSuppressedPath(event.path)) continue;
    const path = normalizeTreePath(event.path);
    const parent = path.slice(0, path.lastIndexOf('/'));
    if (event.kind === 'create') {
      if (getTreeState().directories.get(parent)?.status === 'loaded') {
        try {
          const entry = await readPathEntry(path);
          setTreeState(upsertTreeEntry(getTreeState(), parent, entry));
          queueMutation(() => insertEntryIntoTree(parent, entry));
          treeMetrics.localPatchCount++;
        } catch (error) {
          setTreeState(markDirectoryState(getTreeState(), parent, 'stale'));
          logException('file-tree.incremental', 'Failed to insert created path', error, { path });
        }
      } else {
        setTreeState(markDirectoryState(getTreeState(), parent, 'stale'));
      }
      continue;
    }
    if (event.kind === 'delete') {
      setTreeState(applyTreeEvent(getTreeState(), event));
      queueMutation(() => removeEntryFromTree(path));
      treeMetrics.localPatchCount++;
      continue;
    }
    if (event.kind === 'rename' && event.toPath) {
      setTreeState(applyTreeEvent(getTreeState(), event));
      const newPath = normalizeTreePath(event.toPath);
      queueMutation(() => {
        renamePathDom(path, newPath);
        rewriteActiveDocumentPath(path, newPath);
        store.setState({
          expandedPaths: store.getState().expandedPaths.map(expanded => {
            const normalized = normalizeTreePath(expanded);
            return normalized === path || normalized.startsWith(path + '/')
              ? newPath + normalized.slice(path.length)
              : expanded;
          }),
        });
      });
      treeMetrics.localPatchCount++;
      continue;
    }
    if (event.kind === 'rescan') {
      treeMetrics.recoveryRescanCount++;
      applyRescan(path);
    }
  }
  scheduleRafFlush();
  logInfo('file-tree.metrics', 'Applied incremental event batch', {
    events: events.length,
    loadedNodes: getTreeState().nodes.size,
    mountedNodes: document.querySelectorAll('#file-tree [data-path]').length,
    incrementalBatchCount: treeMetrics.incrementalBatchCount,
    rootRefreshCount: treeMetrics.rootRefreshCount,
    localPatchCount: treeMetrics.localPatchCount,
    recoveryRescanCount: treeMetrics.recoveryRescanCount,
    recoveryReasons: events.filter(event => event.kind === 'rescan').map(event => event.reason || 'unknown'),
  });
}

/** A rescan for an unloaded path marks the nearest loaded ancestor stale. */
function applyRescan(path: string): void {
  const direct = getTreeState().directories.get(path);
  if (!direct) {
    let ancestor = path;
    while (ancestor.includes('/')) {
      ancestor = ancestor.slice(0, ancestor.lastIndexOf('/'));
      const candidate = getTreeState().directories.get(ancestor);
      if (!candidate) continue;
      if (candidate.status === 'loaded') {
        saveExpandedState();
        setTreeState(markDirectoryState(getTreeState(), ancestor, 'stale'));
        queueMutation(async () => {
          await loadDirectory(ancestor, false);
          await restoreExpandedState();
        });
      } else {
        setTreeState(markDirectoryState(getTreeState(), ancestor, 'stale'));
      }
      break;
    }
    return;
  }
  if (direct.status !== 'loaded') {
    setTreeState(markDirectoryState(getTreeState(), path, 'stale'));
    return;
  }
  saveExpandedState();
  setTreeState(markDirectoryState(getTreeState(), path, 'stale'));
  queueMutation(async () => {
    await loadDirectory(path, false);
    await restoreExpandedState();
  });
}
