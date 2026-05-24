import { readDirRecursive, setWorkspace as setWorkspaceIPC, createFile, createDir, renamePath, readSingleDir, type FileEntry } from '../lib/storage';
import { getFileName } from '../lib/pathUtils';
import { openFileInEditor, getActiveFilePath, rewriteActiveDocumentPath } from './sidebar';
import { showContextMenu } from './contextMenu';
import { showToast } from './toast';

let workspacePath: string | null = null;
let expandedPaths: Set<string> = new Set();
const suppressPaths: Map<string, number> = new Map();
const SUPPRESS_DURATION_MS = 3000;

function escapePathSelector(path: string): string {
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

// Mouse-drag state
let dragSrcPath: string | null = null;
let dragSrcEl: HTMLElement | null = null;
let isDragging = false;

export function getWorkspacePath() {
  return workspacePath;
}

export async function setWorkspacePath(path: string | null) {
  workspacePath = path ? path.replace(/\\/g, '/') : null;
  if (path) {
    try {
      await setWorkspaceIPC(path);
    } catch (e) {
      console.error('Failed to set workspace:', e);
    }
  }
}

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

export function initFileTree() {
  // HTML skeleton is pre-rendered in index.html — no innerHTML needed
  initMouseDrag();
}

export async function refreshFileTree() {
  if (!workspacePath) return;
  try {
    saveExpandedState();
    const entries = await readDirRecursive(workspacePath);
    renderFileTree(entries);
    restoreExpandedState();
  } catch (e) {
    console.error('Failed to refresh file tree:', e);
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

    // Strip workspace prefix to get relative folder segments
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

function createTreeNode(entry: FileEntry, depth: number): HTMLElement {
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
    showContextMenu(e.clientX, e.clientY, entry.path, 'folder');
  });

  // Mouse-drag: folder as drag source
  folder.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragSrcPath = entry.path;
    dragSrcEl = folder;
    isDragging = false;
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
    openFileInEditor(entry.path);
  });

  file.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, entry.path, 'file');
  });

  // Mouse-drag: file as drag source
  file.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragSrcPath = entry.path;
    dragSrcEl = file;
    isDragging = false;
  });

  return file;
}

// --- Global mouse-drag handlers (attached once in initFileTree) ---

function initMouseDrag() {
  let dragoverTimer: ReturnType<typeof setTimeout> | null = null;
  let dragGhost: HTMLElement | null = null;

  document.addEventListener('mousemove', (e) => {
    if (!dragSrcEl || !dragSrcPath) return;

    const dx = e.clientX - dragSrcEl.getBoundingClientRect().left;
    const dy = e.clientY - dragSrcEl.getBoundingClientRect().top;

    // Start drag after 5px movement
    if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      isDragging = true;
      dragSrcEl.classList.add('dragging');

      // Create ghost element
      dragGhost = dragSrcEl.cloneNode(true) as HTMLElement;
      dragGhost.style.cssText = `
        position: fixed;
        pointer-events: none;
        opacity: 0.7;
        z-index: 9999;
        left: ${e.clientX - 4}px;
        top: ${e.clientY - 4}px;
      `;
      document.body.appendChild(dragGhost);
    }

    if (isDragging && dragGhost) {
      dragGhost.style.left = `${e.clientX - 4}px`;
      dragGhost.style.top = `${e.clientY - 4}px`;

      // Highlight drop target under cursor
      document.querySelectorAll('.dragover').forEach(el => el.classList.remove('dragover'));

      const target = document.elementFromPoint(e.clientX, e.clientY);
      const wrapper = target?.closest('.tree-folder-wrapper') as HTMLElement | null;
      if (wrapper && !wrapper.querySelector('.dragging')) {
        wrapper.classList.add('dragover');

        // Auto-expand collapsed folder
        const folderEl = wrapper.querySelector('.tree-folder') as HTMLElement | null;
        if (folderEl) {
          const chevron = folderEl.querySelector('.tree-chevron');
          const children = folderEl.parentElement?.querySelector('.tree-children') as HTMLElement | null;
          if (chevron && children && !chevron.classList.contains('expanded')) {
            if (!dragoverTimer) {
              dragoverTimer = setTimeout(() => {
                chevron.classList.add('expanded');
                children.hidden = false;
                dragoverTimer = null;
              }, 500);
            }
          }
        }
      }
    }
  });

  document.addEventListener('mouseup', async (e) => {
    if (!isDragging || !dragSrcPath) {
      dragSrcPath = null;
      dragSrcEl?.classList.remove('dragging');
      dragSrcEl = null;
      isDragging = false;
      dragGhost?.remove();
      dragGhost = null;
      return;
    }

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const wrapper = target?.closest('.tree-folder-wrapper') as HTMLElement | null;
    const fileTree = document.getElementById('file-tree');

    let destDir: string | null = null;

    if (wrapper && !wrapper.querySelector('.dragging')) {
      // Dropped on a folder wrapper
      const folderEl = wrapper.querySelector('.tree-folder') as HTMLElement | null;
      if (folderEl) destDir = folderEl.dataset.path || null;
    } else if (target === fileTree || target?.closest('#file-tree') === fileTree) {
      // Dropped on workspace root (empty area)
      destDir = workspacePath;
    }

    const srcIsFolder = dragSrcEl?.classList.contains('tree-folder') === true;

    // Clean up visual state
    document.querySelectorAll('.dragover').forEach(el => el.classList.remove('dragover'));
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    dragGhost?.remove();
    dragGhost = null;

    if (dragoverTimer) {
      clearTimeout(dragoverTimer);
      dragoverTimer = null;
    }

    // Perform move if valid target
    if (destDir && dragSrcPath) {
      const srcPath = dragSrcPath;
      const srcName = getFileName(srcPath);
      const srcParent = srcPath.substring(0, Math.max(srcPath.lastIndexOf('/'), srcPath.lastIndexOf('\\')));
      const destPath = `${destDir}/${srcName}`;

      if (srcPath !== destPath && srcParent !== destDir) {
        try {
          suppressNextWatcherRefresh(srcPath);
          suppressNextWatcherRefresh(destPath);
          suppressAllDescendants(srcPath);
          await renamePath(srcPath, destPath);
          rewriteActiveDocumentPath(srcPath, destPath);
          removeEntryFromTree(srcPath);

          if (srcIsFolder) {
            suppressAllDescendants(destPath);
            await refreshFileTree();
          } else {
            const entries = await readSingleDir(destDir);
            const movedEntry = entries.find(e => e.path === destPath);
            if (movedEntry) insertEntryIntoTree(destDir, movedEntry);
          }
          showToast('已移动');
        } catch (err) {
          showToast(`移动失败: ${err}`);
        }
      }
    }

    dragSrcPath = null;
    dragSrcEl = null;
    isDragging = false;
  });
}


// --- Inline rename ---

export function startInlineRename(path: string) {
  const el = document.querySelector(`[data-path="${escapePathSelector(path)}"]`) as HTMLElement;
  if (!el) return;

  const span = el.querySelector(':scope > span') as HTMLElement;
  if (!span) return;

  const oldName = span.textContent || '';
  const input = createInlineInput(oldName, oldName);
  const isFolder = el.classList.contains('tree-folder');

  const finishRename = async (newName: string) => {
    if (!newName || newName === oldName) {
      span.textContent = oldName;
      span.style.display = '';
      input.remove();
      return;
    }

    const parentDir = path.substring(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')));
    const newPath = `${parentDir}/${newName}`;

    try {
      suppressNextWatcherRefresh(path);
      suppressNextWatcherRefresh(newPath);
      if (isFolder) {
        suppressAllDescendants(path);
        suppressAllDescendants(newPath);
      }
      await renamePath(path, newPath);
      rewriteActiveDocumentPath(path, newPath);
      span.textContent = newName;
      span.style.display = '';
      input.remove();
      el.dataset.path = newPath;

      if (isFolder) {
        await refreshFileTree();
        showToast('已重命名');
        return;
      }

      // Re-sort within parent container
      const container = el.classList.contains('tree-file') ? el.parentElement : el.parentElement?.parentElement;
      if (container) {
        const siblings = Array.from(container.children).filter(c => c !== el && c !== el.parentElement);
        let target: Element | null = null;
        for (const sib of siblings) {
          const sibIsDir = sib.classList.contains('tree-folder') || sib.querySelector(':scope > .tree-folder') !== null;
          const sibName = (sib.querySelector(':scope > span, :scope > .tree-folder > span') as HTMLElement)?.textContent || '';
          if (sibIsDir) { target = sib; break; }
          if (sibName.localeCompare(newName) >= 0) { target = sib; break; }
        }
        const node = el.classList.contains('tree-file') ? el : el.parentElement!;
        if (target) {
          container.insertBefore(node, target);
        } else {
          container.appendChild(node);
        }
      }

      showToast('已重命名');
    } catch (e) {
      span.textContent = oldName;
      span.style.display = '';
      input.remove();
      showToast(`重命名失败: ${e}`);
    }
  };

  span.style.display = 'none';
  span.parentElement!.appendChild(input);
  setupInlineInput(input, finishRename);
}

// --- Inline create ---

export function startInlineCreate(type: 'file' | 'folder', targetDir: string) {
  if (!workspacePath) {
    showToast('请先打开工作区');
    return;
  }

  // Find and auto-expand the target folder
  let container: HTMLElement | null;
  let depth: number;

  if (targetDir === workspacePath) {
    container = document.getElementById('file-tree');
    depth = 0;
  } else {
    const folderEl = document.querySelector(`.tree-folder[data-path="${escapePathSelector(targetDir)}"]`) as HTMLElement;
    if (!folderEl) return;

    // Auto-expand if collapsed
    const chevron = folderEl.querySelector('.tree-chevron');
    const childrenEl = folderEl.parentElement?.querySelector(':scope > .tree-children') as HTMLElement;
    if (chevron && childrenEl && !chevron.classList.contains('expanded')) {
      chevron.classList.add('expanded');
      childrenEl.hidden = false;
    }
    container = childrenEl;
    depth = 0;
    let el: HTMLElement | null = childrenEl;
    while (el) {
      if (el.classList.contains('tree-children')) depth++;
      el = el.parentElement;
    }
  }

  if (!container) return;

  // Create temp node with input
  const placeholder = type === 'file' ? '文件名.md' : '文件夹名';
  const input = createInlineInput('', placeholder);

  const tempNode = document.createElement('div');
  tempNode.className = type === 'file' ? 'tree-file' : 'tree-folder';
  tempNode.style.paddingLeft = `${(type === 'file' ? 28 : 16) + depth * 12}px`;
  if (type === 'file') {
    tempNode.innerHTML = `
      <svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    `;
  } else {
    tempNode.innerHTML = `
      <svg class="tree-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      <svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
    `;
  }
  tempNode.appendChild(input);

  // Insert at sorted position
  insertSorted(container, tempNode, type === 'folder');

  const finishCreate = async (name: string) => {
    if (!name.trim()) {
      tempNode.remove();
      return;
    }

    const sanitizedName = name.trim().replace(/[<>:"/\\|?*]/g, '_');

    try {
      if (type === 'file') {
        const fileName = sanitizedName.endsWith('.md') ? sanitizedName : `${sanitizedName}.md`;
        const fullPath = `${targetDir}/${fileName}`;

        suppressNextWatcherRefresh(fullPath);
        await createFile(fullPath, '');

        const entries = await readSingleDir(targetDir);
        const newEntry = entries.find(e => e.path === fullPath);
        if (newEntry) {
          const realNode = createTreeNode(newEntry, depth);
          tempNode.replaceWith(realNode);
        } else {
          tempNode.remove();
        }
        await openFileInEditor(fullPath);
        showToast('文件已创建');
      } else {
        const fullPath = `${targetDir}/${sanitizedName}`;

        suppressNextWatcherRefresh(fullPath);
        await createDir(fullPath);

        const entries = await readSingleDir(targetDir);
        const newEntry = entries.find(e => e.path === fullPath);
        if (newEntry) {
          const realNode = createTreeNode(newEntry, depth);
          tempNode.replaceWith(realNode);
        } else {
          tempNode.remove();
        }
        showToast('文件夹已创建');
      }
    } catch (e) {
      tempNode.remove();
      showToast(`创建失败: ${e}`);
    }
  };

  setupInlineInput(input, finishCreate);
}

function insertSorted(container: HTMLElement, node: HTMLElement, isDir: boolean) {
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

// --- Inline input helpers ---

function createInlineInput(initialValue: string, placeholder: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tree-inline-input';
  input.value = initialValue;
  input.placeholder = placeholder;
  input.spellcheck = false;
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'off');
  return input;
}

function setupInlineInput(input: HTMLInputElement, onConfirm: (value: string) => void) {
  const finalize = (commit: boolean) => {
    if (commit) {
      onConfirm(input.value);
    }
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      finalize(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finalize(false);
      // For rename, the caller handles restoring the span.
      // For create, the temp node is removed by the caller on empty value.
      input.value = '';
      input.blur();
    }
  });

  input.addEventListener('blur', () => {
    if (input.parentElement) {
      finalize(true);
    }
  });

  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());
  input.addEventListener('contextmenu', (e) => { e.stopPropagation(); e.preventDefault(); });

  // Focus and select after DOM insertion
  requestAnimationFrame(() => {
    input.focus();
    if (input.value) {
      // Select filename without extension
      const dotIdx = input.value.lastIndexOf('.');
      if (dotIdx > 0) {
        input.setSelectionRange(0, dotIdx);
      } else {
        input.select();
      }
    }
  });
}

// --- Surgical DOM operations (no full rebuild) ---

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
      console.error('Failed to read folder children:', e);
    }
  }
  const node = createTreeNode(resolvedEntry, depth);

  // Insert in sorted position: dirs first, then alphabetical
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

  // Auto-expand parent folder if collapsed
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
    // Folder: remove the wrapper div (parent of .tree-folder)
    el.parentElement?.remove();
  }
}

export function renameEntryInTree(oldPath: string, newName: string) {
  const el = document.querySelector(`[data-path="${escapePathSelector(oldPath)}"]`) as HTMLElement;
  if (!el) return;

  const span = el.querySelector(':scope > span') as HTMLElement;
  if (span) span.textContent = newName;

  const parentDir = oldPath.substring(0, Math.max(oldPath.lastIndexOf('/'), oldPath.lastIndexOf('\\')));
  const newPath = `${parentDir}/${newName}`;
  el.dataset.path = newPath;

  // Re-sort within parent container
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
