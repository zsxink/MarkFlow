import { dragState, getWorkspacePath, suppressNextWatcherRefresh, suppressAllDescendants, refreshFileTree, removeEntryFromTree, insertEntryIntoTree } from './fileTree.core';
import { getFileName } from '../lib/pathUtils';
import { renamePath, readSingleDir } from '../lib/storage';
import { rewriteActiveDocumentPath } from './sidebar';
import { showToast } from './toast';

export function initMouseDrag() {
  let dragoverTimer: ReturnType<typeof setTimeout> | null = null;
  let dragGhost: HTMLElement | null = null;

  document.addEventListener('mousemove', (e) => {
    if (!dragState.srcEl || !dragState.srcPath) return;

    const dx = e.clientX - dragState.srcEl.getBoundingClientRect().left;
    const dy = e.clientY - dragState.srcEl.getBoundingClientRect().top;

    // Start drag after 5px movement
    if (!dragState.isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      dragState.isDragging = true;
      dragState.srcEl.classList.add('dragging');

      // Create ghost element
      dragGhost = dragState.srcEl.cloneNode(true) as HTMLElement;
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

    if (dragState.isDragging && dragGhost) {
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
    if (!dragState.isDragging || !dragState.srcPath) {
      dragState.srcPath = null;
      dragState.srcEl?.classList.remove('dragging');
      dragState.srcEl = null;
      dragState.isDragging = false;
      dragGhost?.remove();
      dragGhost = null;
      return;
    }

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const wrapper = target?.closest('.tree-folder-wrapper') as HTMLElement | null;
    const fileTree = document.getElementById('file-tree');

    let destDir: string | null = null;

    if (wrapper && !wrapper.querySelector('.dragging')) {
      const folderEl = wrapper.querySelector('.tree-folder') as HTMLElement | null;
      if (folderEl) destDir = folderEl.dataset.path || null;
    } else if (target === fileTree || target?.closest('#file-tree') === fileTree) {
      destDir = getWorkspacePath();
    }

    const srcIsFolder = dragState.srcEl?.classList.contains('tree-folder') === true;

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
    if (destDir && dragState.srcPath) {
      const srcPath = dragState.srcPath;
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

    dragState.srcPath = null;
    dragState.srcEl = null;
    dragState.isDragging = false;
  });
}
