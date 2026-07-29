// Entry file — pure re-exports from sub-modules.
// Consumers should continue to import from 'fileTree' (no path change needed).

export {
  getWorkspacePath,
  setWorkspacePath,
  suppressNextWatcherRefresh,
  isSuppressedPath,
  suppressAllDescendants,
  refreshFileTree,
  initTreeAria,
  insertEntryIntoTree,
  removeEntryFromTree,
  applyFileTreeEvents,
  cleanup,
  flushPendingMutations,
} from './fileTree.core';

export {
  renameEntryInTree,
} from './fileTree.sort';

export {
  startInlineRename,
  startInlineCreate,
} from './fileTree.inline';
