// ── Directory loading ─────────────────────────────────────────────────
// Paginated directory loads, expanded-state save/restore, and the full-tree
// refresh. Registers itself as the renderer's loader hook so the renderer can
// request loads without importing this module.

import type { FileEntry } from '../../types/file-tree';
import { readDirPage } from '../../infra/storage';
import { logException, logInfo } from '../../infra/logger';
import { store } from '../../infra/store';
import { DEFAULT_SETTINGS } from '../../types/settings';
import {
  getTreeState,
  pendingLoads,
  registerDirectoryLoader,
  setTreeState,
  treeMetrics,
} from './context';
import {
  createFileTreeState,
  markDirectoryState,
  mergeDirectoryPage,
  normalizeTreePath,
} from './state';
import { escapePathSelector } from './dom';
import { getWorkspacePath } from './workspace';
import { initTreeAria, updateSelectedAria } from './aria';
import { renderDirectory } from './render';

export async function refreshFileTree() {
  const wsPath = getWorkspacePath();
  if (!wsPath) return;
  try {
    const container = document.getElementById('file-tree');
    if (container) initTreeAria(container);
    saveExpandedState();
    setTreeState(createFileTreeState());
    treeMetrics.rootRefreshCount++;
    await loadDirectory(wsPath, false);
    await restoreExpandedState();
    updateSelectedAria();
  } catch (e) {
    logException('file-tree.refresh', 'Failed to refresh file tree', e, { path: wsPath });
  }
}

export function saveExpandedState() {
  const paths: string[] = [];
  document.querySelectorAll('.tree-folder').forEach(el => {
    const chevron = el.querySelector('.tree-chevron');
    const children = el.parentElement?.querySelector('.tree-children');
    if (chevron?.classList.contains('expanded') && children) {
      const span = el.querySelector('span');
      if (span) {
        const path = (el as HTMLElement).dataset.path || null;
        if (path) paths.push(path);
      }
    }
  });
  store.setState({ expandedPaths: paths });
}

export async function restoreExpandedState() {
  const maxDepth = store.getState().settings.fileTreeAutoLoadDepth
    ?? DEFAULT_SETTINGS.fileTreeAutoLoadDepth ?? 8;
  for (const path of store.getState().expandedPaths) {
    const fileTree = document.getElementById('file-tree');
    const wsPath = getWorkspacePath();
    if (!fileTree || !wsPath) return;

    let relativePath = path;
    // Compare normalized keys so a persisted expanded path still spelled with an
    // upper-case drive letter resolves against the workspace root (issue #375).
    const workspaceKey = normalizeTreePath(wsPath);
    const pathKey = normalizeTreePath(path);
    if (pathKey === workspaceKey) continue; // the root itself is not a folder to expand
    if (pathKey.startsWith(workspaceKey + '/')) relativePath = pathKey.slice(workspaceKey.length + 1);
    const folders = relativePath.split('/');
    if (folders.length === 0 || folders[0] === '') return;

    let currentContainer: HTMLElement = fileTree;
    for (let i = 0; i < folders.length && i < maxDepth; i++) {
      const folderName = folders[i];
      const folderDivs = currentContainer.querySelectorAll(
        ':scope > .tree-folder, :scope > .tree-folder-wrapper > .tree-folder',
      );
      let found = false;

      for (const folderDiv of Array.from(folderDivs)) {
        const span = folderDiv.querySelector(':scope > span');
        if (span && span.textContent === folderName) {
          const chevron = folderDiv.querySelector('.tree-chevron');
          const children = folderDiv.parentElement?.querySelector(':scope > .tree-children');
          if (chevron && children) {
            chevron.classList.add('expanded');
            (folderDiv as HTMLElement).setAttribute('aria-expanded', 'true');
            (children as HTMLElement).hidden = false;
            await loadDirectory((folderDiv as HTMLElement).dataset.path || '', false);
            currentContainer = children as HTMLElement;
          }
          found = true;
          break;
        }
      }

      if (!found) break;
    }
  }
}

// ── Expand/collapse all ───────────────────────────────────────────────
// Driven by the sidebar hover button (issue #418). Both go through the same
// three DOM signals as a manual chevron click and finish in
// saveExpandedState(), so refresh/watcher recovery can never disagree with
// what the user sees.

export async function collapseAllFolders(): Promise<void> {
  document.querySelectorAll('#file-tree .tree-folder').forEach(folder => {
    const chevron = folder.querySelector('.tree-chevron');
    const children = folder.parentElement?.querySelector(':scope > .tree-children') as HTMLElement | null;
    if (!chevron || !children) return;
    chevron.classList.remove('expanded');
    folder.setAttribute('aria-expanded', 'false');
    children.hidden = true;
  });
  saveExpandedState();
}

export async function expandAllFolders(): Promise<void> {
  const fileTree = document.getElementById('file-tree');
  if (!fileTree) return;
  // Same settings fallback as restoreExpandedState: the cap is shared so both
  // automatic and one-click expansion stop at the same depth.
  const maxDepth = store.getState().settings.fileTreeAutoLoadDepth
    ?? DEFAULT_SETTINGS.fileTreeAutoLoadDepth ?? 8;

  const isCollapsed = (folder: HTMLElement): boolean => {
    const chevron = folder.querySelector('.tree-chevron');
    const children = folder.parentElement?.querySelector(':scope > .tree-children');
    return !!chevron && !!children && !chevron.classList.contains('expanded');
  };
  const directChildFolders = (container: Element): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(
      ':scope > .tree-folder, :scope > .tree-folder-wrapper > .tree-folder',
    ));

  // Round 0 holds every collapsed folder already in the DOM — collapse-all
  // keeps subtrees rendered (just hidden), so those re-expand without extra
  // loads. Each later round lazy-loads one more level of sub-folders, one
  // await at a time (pendingLoads dedupes repeats; no readDirPage stampede).
  const scheduled = new Set<string>();
  let frontier = Array.from(fileTree.querySelectorAll<HTMLElement>('.tree-folder'))
    .filter(isCollapsed);
  let depth = 0;
  while (frontier.length > 0 && depth < maxDepth) {
    const next: HTMLElement[] = [];
    for (const folder of frontier) {
      const path = folder.dataset.path || '';
      if (path && scheduled.has(path)) continue;
      if (path) scheduled.add(path);
      const chevron = folder.querySelector('.tree-chevron');
      const children = folder.parentElement?.querySelector(':scope > .tree-children') as HTMLElement | null;
      if (!chevron || !children) continue;
      chevron.classList.add('expanded');
      folder.setAttribute('aria-expanded', 'true');
      children.hidden = false;
      await loadDirectory(path, false);
      next.push(...directChildFolders(children).filter(child =>
        isCollapsed(child) && !(child.dataset.path && scheduled.has(child.dataset.path))));
    }
    frontier = next;
    depth++;
  }
  saveExpandedState();
}

export async function loadDirectory(path: string, append: boolean): Promise<void> {
  path = normalizeTreePath(path);
  const existing = pendingLoads.get(path);
  if (existing) return existing;
  const loaded = getTreeState().directories.get(path);
  if (!append && loaded?.status === 'loaded') {
    const container = document.getElementById('file-tree');
    const rendered = container?.querySelector(
      `.tree-folder[data-path="${escapePathSelector(path)}"]`,
    )?.parentElement?.querySelector(':scope > .tree-children') as HTMLElement | null;
    const target = path === getWorkspacePath() ? container : rendered;
    if (target && target.childElementCount === 0) renderDirectory(path);
    return;
  }
  const promise = (async () => {
    const current = getTreeState().directories.get(path);
    setTreeState(markDirectoryState(getTreeState(), path, 'loading'));
    try {
      const page = await readDirPage(path, {
        cursor: append ? current?.nextCursor : null,
        generation: append ? current?.generation : null,
        limit: store.getState().settings.fileTreePageSize ?? DEFAULT_SETTINGS.fileTreePageSize,
      });
      setTreeState(mergeDirectoryPage(getTreeState(), path, page.entries, {
        nextCursor: page.nextCursor,
        generation: page.generation,
        append,
      }));
      renderDirectory(path, append ? page.entries : undefined);
      logInfo('file-tree.metrics', 'Loaded shallow directory', {
        path,
        loadedNodes: getTreeState().nodes.size,
        mountedNodes: document.querySelectorAll('#file-tree [data-path]').length,
        rootRefreshCount: treeMetrics.rootRefreshCount,
        incrementalBatchCount: treeMetrics.incrementalBatchCount,
        localPatchCount: treeMetrics.localPatchCount,
        recoveryRescanCount: treeMetrics.recoveryRescanCount,
      });
    } catch (e) {
      setTreeState(markDirectoryState(
        getTreeState(),
        path,
        String(e).includes('DIRECTORY_CHANGED') ? 'stale' : 'error',
      ));
      logException('file-tree.load', 'Failed to load directory', e, { path });
    }
  })().finally(() => pendingLoads.delete(path));
  pendingLoads.set(path, promise);
  return promise;
}

/** @visibleForTesting */
export function loadDirectoryForTesting(path: string, append = false) {
  return loadDirectory(path, append);
}

// The renderer asks for loads through this hook; wiring it here (module load
// order = renderer first, loader second) keeps the two modules acyclic.
registerDirectoryLoader(loadDirectory);

/** Exported for the event applier's stale-directory recovery. */
export function renderEntriesInto(path: string, entries?: FileEntry[]) {
  renderDirectory(path, entries);
}
