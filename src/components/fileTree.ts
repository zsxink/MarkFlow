// Entry file — re-exports all public APIs from sub-modules.
// Consumers should continue to import from 'fileTree' (no path change needed).
// initFileTree is here rather than in core.ts to avoid circular dependency
// (core.ts → dragdrop → core.ts).

import { initMouseDrag } from './fileTree.dragdrop';

export {
  workspacePath,
  getWorkspacePath,
  setWorkspacePath,
  suppressNextWatcherRefresh,
  isSuppressedPath,
  suppressAllDescendants,
  refreshFileTree,
  insertEntryIntoTree,
  removeEntryFromTree,
  renameEntryInTree,
} from './fileTree.core';

export {
  startInlineRename,
  startInlineCreate,
} from './fileTree.inline';

export function initFileTree() {
  initMouseDrag();
}
