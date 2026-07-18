// Entry file — pure re-exports from sub-modules.
// Consumers should continue to import from 'fileTree' (no path change needed).

export {
  getWorkspacePath,
  setWorkspacePath,
  suppressNextWatcherRefresh,
  isSuppressedPath,
  suppressAllDescendants,
  refreshFileTree,
  insertEntryIntoTree,
  removeEntryFromTree,
  renameEntryInTree,
  applyFileTreeEvents,
} from './fileTree.core';

export {
  startInlineRename,
  startInlineCreate,
} from './fileTree.inline';
