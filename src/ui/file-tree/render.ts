// ── File tree node rendering ─────────────────────────────────────────
// Builds the DOM for files/folders, handles their click/dblclick/contextmenu
// events, and applies the surgical insert/remove/rename reorders. It never
// loads a directory itself — it asks the loader through the injected hook so
// this module and the loader stay acyclic.

import type { FileEntry } from '../../types/file-tree';
import { getActiveFilePath } from '../active-document';
import { uiPorts } from '../../infra/ui-ports';
import { logWarn } from '../../infra/logger';
import { treeContextMenuHooks } from './hooks';
import { dragState, getTreeState, loadDirectoryThroughHook } from './context';
import {
  escapeHtml,
  escapePathSelector,
  findChildrenContainer,
  getDepth,
  insertSorted,
} from './dom';
import { updateSelectedAria } from './aria';
import { getWorkspacePath } from './workspace';

export { escapePathSelector, escapeHtml, insertSorted };

const dbClickTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

export function createTreeNode(entry: FileEntry, depth: number): HTMLElement {
  return entry.isDir ? createFolderNode(entry, depth) : createFileNode(entry, depth);
}

function createFolderNode(entry: FileEntry, depth: number): HTMLElement {
  const container = document.createElement('div');
  container.className = 'tree-folder-wrapper';
  const folder = document.createElement('div');
  folder.className = 'tree-folder';
  folder.dataset.path = entry.path;
  folder.dataset.testid = 'file-tree-item';
  folder.style.paddingLeft = `${16 + depth * 12}px`;
  folder.setAttribute('role', 'treeitem');
  folder.setAttribute('aria-expanded', 'true');
  folder.setAttribute('tabindex', '-1');
  folder.innerHTML = `
    <svg class="tree-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    <svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
    <span>${escapeHtml(entry.name)}</span>
  `;

  const children = document.createElement('div');
  children.className = 'tree-children';
  children.setAttribute('role', 'group');
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
    folder.setAttribute('aria-expanded', String(!children.hidden));
    if (!children.hidden) void loadDirectoryThroughHook(entry.path, false);
  });

  folder.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const path = folder.dataset.path;
    treeContextMenuHooks.showContextMenu(e.clientX, e.clientY, path || null, 'folder');
  });

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
    file.setAttribute('aria-selected', 'true');
  }
  file.setAttribute('role', 'treeitem');
  file.setAttribute('tabindex', '-1');
  file.dataset.path = entry.path;
  file.dataset.testid = 'file-tree-item';
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
      void uiPorts.openDocument(path);
      updateSelectedAria();
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
    void uiPorts.openDocument(path);
  });

  file.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const path = file.dataset.path;
    treeContextMenuHooks.showContextMenu(e.clientX, e.clientY, path || null, 'file');
  });

  file.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragState.srcPath = file.dataset.path || null;
    dragState.srcEl = file;
    dragState.isDragging = false;
  });

  return file;
}

/** Render one directory's children into its container (full rebuild or append). */
export function renderDirectory(path: string, appendedEntries?: FileEntry[]): void {
  const state = getTreeState();
  const directory = state.directories.get(path);
  if (!directory) return;
  const workspacePath = getWorkspacePath();
  const container = findChildrenContainer(path, workspacePath);
  if (!container) {
    // A missing container means the whole subtree stays invisible while the
    // directory itself loaded fine, so log it instead of dropping the render.
    logWarn('file-tree.render', 'No container for directory render', { path, workspacePath });
    return;
  }
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
      const entry = state.nodes.get(childPath);
      if (entry) container.appendChild(createTreeNode(entry, depth));
    }
  }
  if (directory.nextCursor) {
    const more = document.createElement('button');
    more.className = 'tree-load-more';
    more.textContent = '继续加载';
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      void loadDirectoryThroughHook(path, true);
    });
    container.appendChild(more);
  }
}

/** Insert a freshly created entry into its parent's rendered list. */
export function insertEntryIntoTree(parentPath: string, entry: FileEntry): void {
  const workspacePath = getWorkspacePath();
  const container = findChildrenContainer(parentPath, workspacePath);
  if (!container) return;
  if (container.querySelector(`[data-path="${escapePathSelector(entry.path)}"]`)) return;

  const depth = getDepth(container);
  const node = createTreeNode(entry, depth);
  insertSorted(container, node, entry.isDir);

  if (parentPath !== workspacePath) {
    const folderEl = document.querySelector(
      `.tree-folder[data-path="${escapePathSelector(parentPath)}"]`,
    );
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

export function removeEntryFromTree(path: string): void {
  const el = document.querySelector(`[data-path="${escapePathSelector(path)}"]`);
  if (!el) return;
  if (el.classList.contains('tree-file')) el.remove();
  else el.parentElement?.remove();
}

/** Retarget a renamed path subtree and re-sort it into its parent. */
export function renamePathDom(oldPath: string, newPath: string): void {
  const element = document.querySelector(
    `[data-path="${escapePathSelector(oldPath)}"]`,
  ) as HTMLElement | null;
  if (!element) return;
  const isDir = element.classList.contains('tree-folder');
  const node = isDir ? element.parentElement as HTMLElement : element;
  node.querySelectorAll<HTMLElement>('[data-path]').forEach(child => {
    const childPath = child.dataset.path || '';
    if (childPath === oldPath || childPath.startsWith(oldPath + '/')) {
      child.dataset.path = newPath + childPath.slice(oldPath.length);
    }
  });
  const label = element.querySelector(':scope > span');
  if (label) label.textContent = newPath.slice(newPath.lastIndexOf('/') + 1);
  const newParent = newPath.slice(0, newPath.lastIndexOf('/'));
  const workspacePath = getWorkspacePath();
  const container = findChildrenContainer(newParent, workspacePath);
  if (container) insertSorted(container, node, isDir);
  else node.remove();
}