// ── File tree barrel ──────────────────────────────────────────────────
// Public surface of the file-tree module. Implementations live in `aria.ts`
// (keyboard/ARIA), `render.ts` (DOM), `loader.ts` (paged loads), `events.ts`
// (watcher deltas), `workspace.ts` (root + suppression) and `state.ts` (pure
// tree model). `inline.ts` and `dragdrop.ts` build on this surface.

export {
  getWorkspacePath,
  setWorkspacePath,
  closeWorkspaceFolder,
  resetFileTreeToEmptyState,
  suppressNextWatcherRefresh,
  cancelSuppressedWatcherRefresh,
  isSuppressedPath,
  suppressAllDescendants,
} from './workspace';

export { initTreeAria, updateSelectedAria } from './aria';

export {
  createTreeNode,
  insertEntryIntoTree,
  removeEntryFromTree,
  renamePathDom,
  renderDirectory,
  insertSorted,
  escapePathSelector,
} from './render';

export {
  refreshFileTree,
  loadDirectory,
  loadDirectoryForTesting,
  saveExpandedState,
  restoreExpandedState,
} from './loader';

export { applyFileTreeEvents } from './events';

export { dragState, flushPendingMutations } from './context';

import { cancelScheduledFlush, pendingLoads, resetTreeMetrics } from './context';
import { createFileTreeState } from './state';
import { setTreeState } from './context';
import { suppressPaths } from './context';

/** @visibleForTesting */
export function resetFileTreeStateForTesting() {
  setTreeState(createFileTreeState());
  pendingLoads.clear();
  cancelScheduledFlush();
  suppressPaths.clear();
  resetTreeMetrics();
}

export function cleanup() {
  cancelScheduledFlush();
  pendingLoads.clear();
  suppressPaths.clear();
}
