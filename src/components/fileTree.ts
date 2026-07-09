// Entry file -- re-exports all public APIs from sub-modules.
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
  initFileTree,
} from './fileTree.core';

export {
  startInlineRename,
  startInlineCreate,
} from './fileTree.inline';
