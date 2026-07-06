import { workspacePath, escapePathSelector, createTreeNode, insertSorted, suppressNextWatcherRefresh, suppressAllDescendants, refreshFileTree } from './fileTree.core';
import { readSingleDir, createFile, createDir, renamePath } from '../lib/storage';
import { openFileInEditor, rewriteActiveDocumentPath } from './sidebar';
import { showToast } from './toast';

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
          if (isFolder && !sibIsDir) continue;
          if (!isFolder && sibIsDir) { target = sib; break; }
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

  let container: HTMLElement | null;
  let depth: number;

  if (targetDir === workspacePath) {
    container = document.getElementById('file-tree');
    depth = 0;
  } else {
    const folderEl = document.querySelector(`.tree-folder[data-path="${escapePathSelector(targetDir)}"]`) as HTMLElement;
    if (!folderEl) return;

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

  requestAnimationFrame(() => {
    input.focus();
    if (input.value) {
      const dotIdx = input.value.lastIndexOf('.');
      if (dotIdx > 0) {
        input.setSelectionRange(0, dotIdx);
      } else {
        input.select();
      }
    }
  });
}
