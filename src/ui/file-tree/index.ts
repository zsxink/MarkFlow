// Entry file — pure re-exports from sub-modules.
// Consumers should continue to import from 'fileTree' (no path change needed).

export {
  getWorkspacePath,
  setWorkspacePath,
  closeWorkspaceFolder,
  resetFileTreeToEmptyState,
  suppressNextWatcherRefresh,
  cancelSuppressedWatcherRefresh,
  isSuppressedPath,
  suppressAllDescendants,
  refreshFileTree,
  initTreeAria,
  collapseAllFolders,
  expandAllFolders,
  insertEntryIntoTree,
  removeEntryFromTree,
  applyFileTreeEvents,
  cleanup,
  flushPendingMutations,
} from './core';

export {
  startInlineRename,
  startInlineCreate,
} from './inline';

export {
  mountTreeHeader,
  resolveCreateTargetDir,
  hasCollapsedFolder,
  toggleAllFolders,
} from './header';
