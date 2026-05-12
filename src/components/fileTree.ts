import { readDirRecursive, setWorkspace as setWorkspaceIPC, type FileEntry } from '../lib/storage';
import { openFileInEditor } from './sidebar';

let workspacePath: string | null = null;

export function getWorkspacePath() {
  return workspacePath;
}

export async function setWorkspacePath(path: string | null) {
  workspacePath = path;
  if (path) {
    try {
      await setWorkspaceIPC(path);
    } catch (e) {
      console.error('Failed to set workspace:', e);
    }
  }
}

export function initFileTree() {
  // HTML skeleton is pre-rendered in index.html — no innerHTML needed
}

export async function refreshFileTree() {
  if (!workspacePath) return;
  try {
    const entries = await readDirRecursive(workspacePath);
    renderFileTree(entries);
  } catch (e) {
    console.error('Failed to refresh file tree:', e);
  }
}

function renderFileTree(entries: FileEntry[]) {
  const fileTree = document.getElementById('file-tree');
  if (!fileTree) return;
  fileTree.innerHTML = '';
  entries.forEach(entry => {
    fileTree.appendChild(createTreeNode(entry, 0));
  });
}

function createTreeNode(entry: FileEntry, depth: number): HTMLElement {
  if (entry.isDir) {
    return createFolderNode(entry, depth);
  }
  return createFileNode(entry, depth);
}

function createFolderNode(entry: FileEntry, depth: number): HTMLElement {
  const container = document.createElement('div');
  const folder = document.createElement('div');
  folder.className = 'tree-folder';
  folder.style.paddingLeft = `${16 + depth * 12}px`;
  folder.innerHTML = `
    <svg class="tree-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    <svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
    <span>${entry.name}</span>
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

  container.appendChild(folder);
  container.appendChild(children);
  return container;
}

function createFileNode(entry: FileEntry, depth: number): HTMLElement {
  const file = document.createElement('div');
  file.className = 'tree-file';
  file.dataset.path = entry.path;
  file.style.paddingLeft = `${28 + depth * 12}px`;
  file.innerHTML = `
    <svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    <span>${entry.name}</span>
  `;

  file.addEventListener('click', (e) => {
    e.stopPropagation();
    openFileInEditor(entry.path);
  });

  // Context menu disabled in V1 (global preventDefault in main.ts)

  return file;
}
