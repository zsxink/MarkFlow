import type { FileEntry, DragState } from '../types/fileTree';
import { readDirPage, readPathEntry, setWorkspace as setWorkspaceIPC, openFileInNewWindow } from '../lib/storage';
import { openFileInEditor } from './sidebar';
import { getActiveFilePath, rewriteActiveDocumentPath } from './activeDocument';
import { showContextMenu } from './contextMenu';
import { logException, logInfo } from '../lib/logger';
import { store } from '../lib/store';
import { applyTreeEvent, createFileTreeState, markDirectoryState, mergeDirectoryPage, normalizeTreePath, upsertTreeEntry } from './fileTree.state';
import type { FileChangeEvent } from '../types/events';
import { DEFAULT_SETTINGS } from '../types/settings';

// --- Drag state (shared with fileTree.dragdrop.ts) ---

export const dragState: DragState = {
  srcPath: null,
  srcEl: null,
  isDragging: false,
};

// --- Module-level state ---

const dbClickTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
const suppressPaths: Map<string, number> = new Map();
const SUPPRESS_DURATION_MS = 3000;
let treeState = createFileTreeState();
const pendingLoads = new Map<string, Promise<void>>();
let rootRefreshCount = 0;
let incrementalBatchCount = 0;
let localPatchCount = 0;
let recoveryRescanCount = 0;

// --- Utility functions ---

export function escapePathSelector(path: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(path);
  }
  return path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Public API: workspace path ---

export function getWorkspacePath() {
  return store.getState().workspacePath;
}

export async function setWorkspacePath(path: string | null) {
  const normalized = path ? path.replace(/\\/g, '/') : null;
  store.setState({ workspacePath: normalized });
  if (path) {
    try {
      await setWorkspaceIPC(path);
      logInfo('file-tree.workspace', 'Workspace selected', { path: normalized });
    } catch (e) {
      logException('file-tree.workspace', 'Failed to set workspace', e, { path });
    }
  }
}

// --- Suppression helpers ---

export function suppressNextWatcherRefresh(path: string) {
  suppressPaths.set(path, Date.now());
}

export function isSuppressedPath(path: string): boolean {
  const now = Date.now();
  for (const [suppressed, addedAt] of suppressPaths) {
    if (now - addedAt > SUPPRESS_DURATION_MS) {
      suppressPaths.delete(suppressed);
      continue;
    }
    if (path === suppressed || path.startsWith(suppressed + '/')) {
      return true;
    }
  }
  return false;
}

export function suppressAllDescendants(path: string) {
  const now = Date.now();
  suppressPaths.set(path, now);
  suppressPaths.set(path + '/', now);
}

// --- Tree rendering ---

export async function refreshFileTree() {
  const wsPath = getWorkspacePath();
  if (!wsPath) return;
  try {
    saveExpandedState();
    treeState = createFileTreeState();
    rootRefreshCount++;
    await loadDirectory(wsPath, false);
    await restoreExpandedState();
  } catch (e) {
    logException('file-tree.refresh', 'Failed to refresh file tree', e, { path: wsPath });
  }
}

function saveExpandedState() {
  const paths: string[] = [];
  document.querySelectorAll('.tree-folder').forEach(el => {
    const chevron = el.querySelector('.tree-chevron');
    const children = el.parentElement?.querySelector('.tree-children');
    if (chevron?.classList.contains('expanded') && children) {
      const span = el.querySelector('span');
      if (span) {
        const path = buildPathFromNode(el);
        if (path) paths.push(path);
      }
    }
  });
  store.setState({ expandedPaths: paths });
}

function buildPathFromNode(folderEl: Element): string | null {
  return (folderEl as HTMLElement).dataset.path || null;
}

async function restoreExpandedState() {
  const maxDepth = store.getState().settings.fileTreeAutoLoadDepth ?? DEFAULT_SETTINGS.fileTreeAutoLoadDepth ?? 8;
  for (const path of store.getState().expandedPaths) {
    const fileTree = document.getElementById('file-tree');
    const wsPath = getWorkspacePath();
    if (!fileTree || !wsPath) return;

    let relativePath = path;
    if (relativePath.startsWith(wsPath)) {
      relativePath = relativePath.substring(wsPath.length);
      if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);
    }
    const folders = relativePath.split('/');
    if (folders.length === 0 || folders[0] === '') return;

    let currentContainer = fileTree;
    for (let i = 0; i < folders.length && i < maxDepth; i++) {
      const folderName = folders[i];
      const folderDivs = currentContainer.querySelectorAll(':scope > .tree-folder, :scope > .tree-folder-wrapper > .tree-folder');
      let found = false;

      for (const folderDiv of Array.from(folderDivs)) {
        const span = folderDiv.querySelector(':scope > span');
        if (span && span.textContent === folderName) {
          const chevron = folderDiv.querySelector('.tree-chevron');
          const children = folderDiv.parentElement?.querySelector(':scope > .tree-children');
          if (chevron && children) {
            chevron.classList.add('expanded');
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

async function loadDirectory(path: string, append: boolean): Promise<void> {
  path = normalizeTreePath(path);
  const existing = pendingLoads.get(path);
  if (existing) return existing;
  const loaded = treeState.directories.get(path);
  if (!append && loaded?.status === 'loaded') {
    const container = getChildrenContainer(path);
    if (container && container.childElementCount === 0) renderDirectory(path);
    return;
  }
  const promise = (async () => {
    const current = treeState.directories.get(path);
    treeState = markDirectoryState(treeState, path, 'loading');
    try {
      const page = await readDirPage(path, {
        cursor: append ? current?.nextCursor : null,
        generation: append ? current?.generation : null,
        limit: store.getState().settings.fileTreePageSize ?? DEFAULT_SETTINGS.fileTreePageSize,
      });
      treeState = mergeDirectoryPage(treeState, path, page.entries, {
        nextCursor: page.nextCursor, generation: page.generation, append,
      });
      renderDirectory(path, append ? page.entries : undefined);
      logInfo('file-tree.metrics', 'Loaded shallow directory', {
        path, loadedNodes: treeState.nodes.size, mountedNodes: document.querySelectorAll('#file-tree [data-path]').length,
        rootRefreshCount, incrementalBatchCount, localPatchCount, recoveryRescanCount,
      });
    } catch (e) {
      treeState = markDirectoryState(treeState, path, String(e).includes('DIRECTORY_CHANGED') ? 'stale' : 'error');
      logException('file-tree.load', 'Failed to load directory', e, { path });
    }
  })().finally(() => pendingLoads.delete(path));
  pendingLoads.set(path, promise);
  return promise;
}

function renderDirectory(path: string, appendedEntries?: FileEntry[]) {
  const container = getChildrenContainer(path);
  const directory = treeState.directories.get(normalizeTreePath(path));
  if (!container || !directory) return;
  const depth = getDepth(container);
  if (appendedEntries) {
    container.querySelector(':scope > .tree-load-more')?.remove();
    for (const entry of appendedEntries) {
      if (container.querySelector(`[data-path="${escapePathSelector(entry.path)}"]`)) continue;
      insertSorted(container, createTreeNode(entry, depth), entry.isDir);
    }
  } else {
    container.innerHTML = '';
    for (const childPath of directory.children) {
      const entry = treeState.nodes.get(childPath);
      if (entry) container.appendChild(createTreeNode(entry, depth));
    }
  }
  if (directory.nextCursor) {
    const more = document.createElement('button');
    more.className = 'tree-load-more';
    more.textContent = '继续加载';
    more.addEventListener('click', (event) => { event.stopPropagation(); void loadDirectory(path, true); });
    container.appendChild(more);
  }
}

export function createTreeNode(entry: FileEntry, depth: number): HTMLElement {
  if (entry.isDir) {
    return createFolderNode(entry, depth);
  }
  return createFileNode(entry, depth);
}

function createFolderNode(entry: FileEntry, depth: number): HTMLElement {
  const container = document.createElement('div');
  container.className = 'tree-folder-wrapper';
  const folder = document.createElement('div');
  folder.className = 'tree-folder';
  folder.dataset.path = entry.path;
  folder.style.paddingLeft = `${16 + depth * 12}px`;
  folder.innerHTML = `
    <svg class="tree-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    <svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
    <span>${escapeHtml(entry.name)}</span>
  `;

  const children = document.createElement('div');
  children.className = 'tree-children';
  children.hidden = true;
  if (entry.children) {
    entry.children.forEach(child => {
      children.appendChild(createTreeNode(child, depth + 1));
    });
  }

  folder.addEventListener('click', (e) => {
    e.stopPropagation();
    const chevron = folder.querySelector('.tree-chevron');
    chevron?.classList.toggle('expanded');
    children.hidden = !children.hidden;
    if (!children.hidden) void loadDirectory(entry.path, false);
  });

  folder.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const path = folder.dataset.path;
    showContextMenu(e.clientX, e.clientY, path || null, 'folder');
  });

  // Mouse-drag: folder as drag source
  folder.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragState.srcPath = folder.dataset.path || null;
    dragState.srcEl = folder;
    dragState.isDragging = false;
  });

  container.appendChild(folder);
  container.appendChild(children);
  return container;
}

function createFileNode(entry: FileEntry, depth: number): HTMLElement {
  const file = document.createElement('div');
  file.className = 'tree-file';
  if (entry.path === getActiveFilePath()) {
    file.classList.add('active');
  }
  file.dataset.path = entry.path;
  file.style.paddingLeft = `${28 + depth * 12}px`;
  file.innerHTML = `
    <svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    <span>${escapeHtml(entry.name)}</span>
  `;

  file.addEventListener('click', (e) => {
    e.stopPropagation();
    const path = file.dataset.path;
    if (!path) return;
    const existing = dbClickTimers.get(file);
    if (existing) {
      clearTimeout(existing);
      dbClickTimers.delete(file);
      return;
    }
    const timer = setTimeout(() => {
      dbClickTimers.delete(file);
      openFileInEditor(path);
    }, 250);
    dbClickTimers.set(file, timer);
  });

  file.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    const path = file.dataset.path;
    if (!path) return;
    const existing = dbClickTimers.get(file);
    if (existing) {
      clearTimeout(existing);
      dbClickTimers.delete(file);
    }
    openFileInNewWindow(path);
  });

  file.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const path = file.dataset.path;
    showContextMenu(e.clientX, e.clientY, path || null, 'file');
  });

  // Mouse-drag: file as drag source
  file.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragState.srcPath = file.dataset.path || null;
    dragState.srcEl = file;
    dragState.isDragging = false;
  });

  return file;
}

// --- Surgical DOM operations ---

function getChildrenContainer(parentPath: string): HTMLElement | null {
  if (!getWorkspacePath()) return null;
  if (parentPath === getWorkspacePath()) {
    return document.getElementById('file-tree');
  }
  const folderEl = document.querySelector(`.tree-folder[data-path="${escapePathSelector(parentPath)}"]`);
  if (!folderEl) return null;
  return folderEl.parentElement?.querySelector(':scope > .tree-children') as HTMLElement | null;
}

function getDepth(container: HTMLElement): number {
  let depth = 0;
  let el: HTMLElement | null = container;
  while (el) {
    if (el.classList.contains('tree-children')) depth++;
    el = el.parentElement;
  }
  return depth;
}

export async function insertEntryIntoTree(parentPath: string, entry: FileEntry) {
  const container = getChildrenContainer(parentPath);
  if (!container) return;
  if (container.querySelector(`[data-path="${escapePathSelector(entry.path)}"]`)) return;

  const depth = getDepth(container);
  const resolvedEntry = entry;
  const node = createTreeNode(resolvedEntry, depth);

  const children = Array.from(container.children);
  let inserted = false;
  for (const child of children) {
    const isDir = child.classList.contains('tree-folder') ||
      child.querySelector(':scope > .tree-folder') !== null;
    const nameEl = child.querySelector(':scope > span, :scope > .tree-folder > span');
    const name = nameEl?.textContent || '';

    if (resolvedEntry.isDir && !isDir) continue;
    if (!resolvedEntry.isDir && isDir) { container.insertBefore(node, child); inserted = true; break; }
    if (name.localeCompare(resolvedEntry.name) >= 0) { container.insertBefore(node, child); inserted = true; break; }
  }
  if (!inserted) container.appendChild(node);

  if (parentPath !== getWorkspacePath()) {
    const folderEl = document.querySelector(`.tree-folder[data-path="${escapePathSelector(parentPath)}"]`);
    if (folderEl) {
      const chevron = folderEl.querySelector('.tree-chevron');
      const childrenEl = folderEl.parentElement?.querySelector(':scope > .tree-children') as HTMLElement;
      if (chevron && childrenEl && !chevron.classList.contains('expanded')) {
        chevron.classList.add('expanded');
        childrenEl.hidden = false;
      }
    }
  }
}

export async function applyFileTreeEvents(events: FileChangeEvent[]) {
  incrementalBatchCount++;
  for (const event of events) {
    if (isSuppressedPath(event.path)) continue;
    const path = normalizeTreePath(event.path);
    const parent = path.slice(0, path.lastIndexOf('/'));
    if (event.kind === 'create') {
      if (treeState.directories.get(parent)?.status === 'loaded') {
        try {
          const entry = await readPathEntry(path);
          treeState = upsertTreeEntry(treeState, parent, entry);
          await insertEntryIntoTree(parent, entry);
          localPatchCount++;
        } catch (error) {
          treeState = markDirectoryState(treeState, parent, 'stale');
          logException('file-tree.incremental', 'Failed to insert created path', error, { path });
        }
      } else {
        treeState = markDirectoryState(treeState, parent, 'stale');
      }
      continue;
    }
    if (event.kind === 'delete') {
      treeState = applyTreeEvent(treeState, event);
      removeEntryFromTree(path);
      localPatchCount++;
      continue;
    }
    if (event.kind === 'rename' && event.toPath) {
      treeState = applyTreeEvent(treeState, event);
      const newPath = normalizeTreePath(event.toPath);
      renamePathDom(path, newPath);
      rewriteActiveDocumentPath(path, newPath);
      store.setState({ expandedPaths: store.getState().expandedPaths.map(expanded => {
        const normalized = normalizeTreePath(expanded);
        return normalized === path || normalized.startsWith(path + '/') ? newPath + normalized.slice(path.length) : expanded;
      }) });
      localPatchCount++;
      continue;
    }
    if (event.kind === 'rescan') {
      recoveryRescanCount++;
      const direct = treeState.directories.get(path);
      if (!direct) {
        let ancestor = path;
        while (ancestor.includes('/')) {
          ancestor = ancestor.slice(0, ancestor.lastIndexOf('/'));
          const candidate = treeState.directories.get(ancestor);
          if (!candidate) continue;
          if (candidate.status === 'loaded') {
            saveExpandedState();
            treeState = markDirectoryState(treeState, ancestor, 'stale');
            await loadDirectory(ancestor, false);
            await restoreExpandedState();
          } else {
            treeState = markDirectoryState(treeState, ancestor, 'stale');
          }
          break;
        }
        continue;
      }
      if (direct.status !== 'loaded') {
        treeState = markDirectoryState(treeState, path, 'stale');
        continue;
      }
      saveExpandedState();
      treeState = markDirectoryState(treeState, path, 'stale');
      await loadDirectory(path, false);
      await restoreExpandedState();
    }
  }
  logInfo('file-tree.metrics', 'Applied incremental event batch', {
    events: events.length, loadedNodes: treeState.nodes.size, mountedNodes: document.querySelectorAll('#file-tree [data-path]').length,
    incrementalBatchCount, rootRefreshCount, localPatchCount, recoveryRescanCount,
    recoveryReasons: events.filter(event => event.kind === 'rescan').map(event => event.reason || 'unknown'),
  });
}

/** @visibleForTesting */
export function renamePathDom(oldPath: string, newPath: string) {
  const element = document.querySelector(`[data-path="${escapePathSelector(oldPath)}"]`) as HTMLElement | null;
  if (!element) return;
  const isDir = element.classList.contains('tree-folder');
  const node = isDir ? element.parentElement as HTMLElement : element;
  node.querySelectorAll<HTMLElement>('[data-path]').forEach(child => {
    const childPath = normalizeTreePath(child.dataset.path || '');
    if (childPath === oldPath || childPath.startsWith(oldPath + '/')) child.dataset.path = newPath + childPath.slice(oldPath.length);
  });
  const label = element.querySelector(':scope > span');
  if (label) label.textContent = newPath.slice(newPath.lastIndexOf('/') + 1);
  const newParent = newPath.slice(0, newPath.lastIndexOf('/'));
  const container = getChildrenContainer(newParent);
  if (container) insertSorted(container, node, isDir);
  else node.remove();
}

/** @visibleForTesting */
export function resetFileTreeStateForTesting() {
  treeState = createFileTreeState();
  pendingLoads.clear();
  rootRefreshCount = 0;
  incrementalBatchCount = 0;
  localPatchCount = 0;
  recoveryRescanCount = 0;
}

/** @visibleForTesting */
export function loadDirectoryForTesting(path: string, append = false) {
  return loadDirectory(path, append);
}

export function removeEntryFromTree(path: string) {
  const el = document.querySelector(`[data-path="${escapePathSelector(path)}"]`);
  if (!el) return;
  if (el.classList.contains('tree-file')) {
    el.remove();
  } else {
    el.parentElement?.remove();
  }
}

// --- Sorting ---

export function insertSorted(container: HTMLElement, node: HTMLElement, isDir: boolean) {
  const children = Array.from(container.children);
  const newName = (node.querySelector(':scope > span') as HTMLElement)?.textContent || '';
  let inserted = false;
  for (const child of children) {
    if (child === node) continue;
    const childIsDir = child.classList.contains('tree-folder') ||
      child.querySelector(':scope > .tree-folder') !== null;
    if (isDir && !childIsDir) continue;
    if (!isDir && childIsDir) { container.insertBefore(node, child); inserted = true; break; }
    const childName = (child.querySelector(':scope > span, :scope > .tree-folder > span') as HTMLElement)?.textContent || '';
    if (newName.localeCompare(childName) < 0) { container.insertBefore(node, child); inserted = true; break; }
  }
  if (!inserted) container.appendChild(node);
}

export function renameEntryInTree(oldPath: string, newName: string) {
  const el = document.querySelector(`[data-path="${escapePathSelector(oldPath)}"]`) as HTMLElement;
  if (!el) return;

  const span = el.querySelector(':scope > span') as HTMLElement;
  if (span) span.textContent = newName;

  const parentDir = oldPath.substring(0, Math.max(oldPath.lastIndexOf('/'), oldPath.lastIndexOf('\\')));
  const newPath = `${parentDir}/${newName}`;
  el.dataset.path = newPath;

  const container = el.classList.contains('tree-file') ? el.parentElement : el.parentElement?.parentElement;
  if (!container) return;

  const isDir = el.classList.contains('tree-folder');
  const siblings = Array.from(container.children).filter(c => c !== el && c !== el.parentElement);
  let target: Element | null = null;
  for (const sib of siblings) {
    const sibIsDir = sib.classList.contains('tree-folder') || sib.querySelector(':scope > .tree-folder') !== null;
    const sibName = (sib.querySelector(':scope > span, :scope > .tree-folder > span') as HTMLElement)?.textContent || '';
    if (isDir && !sibIsDir) continue;
    if (!isDir && sibIsDir) { target = sib; break; }
    if (sibName.localeCompare(newName) >= 0) { target = sib; break; }
  }

  const node = el.classList.contains('tree-file') ? el : el.parentElement!;
  if (target) {
    container.insertBefore(node, target);
  } else {
    container.appendChild(node);
  }
}
