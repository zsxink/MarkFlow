import { readDirRecursive, setWorkspace as setWorkspaceIPC, openFileInNewWindow, type FileEntry } from '../lib/storage';
import { openFileInEditor, getActiveFilePath } from './sidebar';
import { showContextMenu } from './contextMenu';
import { logException, logInfo } from '../lib/logger';

// --- Drag state (shared with fileTree.dragdrop.ts) ---

export const dragState: { srcPath: string | null; srcEl: HTMLElement | null; isDragging: boolean } = {
  srcPath: null,
  srcEl: null,
  isDragging: false,
};

// --- Module-level state ---

export let workspacePath: string | null = null;
const dbClickTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
const expandedPaths: Set<string> = new Set();
const suppressPaths: Map<string, number> = new Map();
const SUPPRESS_DURATION_MS = 3000;

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
  return workspacePath;
}

export async function setWorkspacePath(path: string | null) {
  workspacePath = path ? path.replace(/\\/g, '/') : null;
  if (path) {
    try {
      await setWorkspaceIPC(path);
      logInfo('file-tree.workspace', 'Workspace selected', { path: workspacePath });
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
  if (!workspacePath) return;
  try {
    saveExpandedState();
    const entries = await readDirRecursive(workspacePath);
    renderFileTree(entries);
    restoreExpandedState();
  } catch (e) {
    logException('file-tree.refresh', 'Failed to refresh file tree', e, { path: workspacePath });
  }
}

function saveExpandedState() {
  expandedPaths.clear();
  document.querySelectorAll('.tree-folder').forEach(el => {
    const chevron = el.querySelector('.tree-chevron');
    const children = el.parentElement?.querySelector('.tree-children');
    if (chevron?.classList.contains('expanded') && children) {
      const span = el.querySelector('span');
      if (span) {
        const path = buildPathFromNode(el);
        if (path) expandedPaths.add(path);
      }
    }
  });
}

function buildPathFromNode(folderEl: Element): string | null {
  const parts: string[] = [];
  let current: Element | null = folderEl;

  while (current) {
    if (current.classList.contains('tree-folder')) {
      const span = current.querySelector(':scope > span');
      if (span) parts.unshift(span.textContent || '');
    }
    const treeChildren: Element | null = current.parentElement;
    if (!treeChildren || !treeChildren.classList.contains('tree-children')) break;
    current = treeChildren.parentElement;
    if (!current) break;
  }

  if (parts.length === 0 || !workspacePath) return null;
  return `${workspacePath}/${parts.join('/')}`;
}

function restoreExpandedState() {
  expandedPaths.forEach(path => {
    const fileTree = document.getElementById('file-tree');
    if (!fileTree || !workspacePath) return;

    let relativePath = path;
    if (relativePath.startsWith(workspacePath)) {
      relativePath = relativePath.substring(workspacePath.length);
      if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);
    }
    const folders = relativePath.split('/');
    if (folders.length === 0 || folders[0] === '') return;

    let currentContainer = fileTree;
    for (let i = 0; i < folders.length; i++) {
      const folderName = folders[i];
      const folderDivs = currentContainer.querySelectorAll(':scope > .tree-folder');
      let found = false;

      for (const folderDiv of Array.from(folderDivs)) {
        const span = folderDiv.querySelector(':scope > span');
        if (span && span.textContent === folderName) {
          const chevron = folderDiv.querySelector('.tree-chevron');
          const children = folderDiv.parentElement?.querySelector(':scope > .tree-children');
          if (chevron && children) {
            chevron.classList.add('expanded');
            (children as HTMLElement).hidden = false;
            currentContainer = children as HTMLElement;
          }
          found = true;
          break;
        }
      }

      if (!found) break;
    }
  });
}

function renderFileTree(entries: FileEntry[]) {
  const fileTree = document.getElementById('file-tree');
  if (!fileTree) return;
  fileTree.innerHTML = '';
  entries.forEach(entry => {
    fileTree.appendChild(createTreeNode(entry, 0));
  });
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
  if (!workspacePath) return null;
  if (parentPath === workspacePath) {
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

  const depth = getDepth(container);
  let resolvedEntry = entry;
  if (entry.isDir && !entry.children) {
    try {
      const children = await readDirRecursive(entry.path);
      resolvedEntry = { ...entry, children };
    } catch (e) {
      logException('file-tree.refresh', 'Failed to read folder children', e, { path: entry.path });
    }
  }
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

  if (parentPath !== workspacePath) {
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
