import { deletePath, copyFile, readSingleDir } from '../lib/storage';
import { getWorkspacePath, removeEntryFromTree, insertEntryIntoTree, startInlineRename, startInlineCreate } from './fileTree';
import { showToast } from './toast';
import { getFileName, getParentDir } from '../lib/pathUtils';
import { open } from '@tauri-apps/plugin-shell';
import { ask } from '@tauri-apps/plugin-dialog';

type TargetType = 'file' | 'folder' | 'empty';

let currentPath: string | null = null;
let currentType: TargetType = 'empty';

export function showContextMenu(x: number, y: number, path: string | null, type: TargetType) {
  currentPath = path;
  currentType = type;
  const menu = document.getElementById('context-menu');
  if (!menu) return;

  const items: string[] = [];

  // New file / New folder — always available when workspace exists
  const workspacePath = getWorkspacePath();
  if (workspacePath) {
    items.push(`<button class="context-menu-item" data-action="new-file">新建文件</button>`);
    items.push(`<button class="context-menu-item" data-action="new-folder">新建文件夹</button>`);
  }

  if (type === 'file' || type === 'folder') {
    items.push(`<button class="context-menu-item" data-action="rename">重命名</button>`);
    items.push(`<button class="context-menu-item" data-action="duplicate">复制(副本)</button>`);
    items.push(`<button class="context-menu-item danger" data-action="delete">删除</button>`);
    items.push(`<hr style="border:none;border-top:1px solid var(--border);margin:4px 0">`);
    items.push(`<button class="context-menu-item" data-action="copy-relative">复制文件路径</button>`);
    items.push(`<button class="context-menu-item" data-action="copy-absolute">复制绝对路径</button>`);
  } else {
    // Empty space — copy workspace path
    if (workspacePath) {
      items.push(`<hr style="border:none;border-top:1px solid var(--border);margin:4px 0">`);
      items.push(`<button class="context-menu-item" data-action="copy-workspace">复制工作区路径</button>`);
    }
  }

  // Reveal in explorer — always available when path or workspace exists
  if (path || workspacePath) {
    items.push(`<button class="context-menu-item" data-action="reveal">在文件资源管理器中显示</button>`);
  }

  menu.innerHTML = items.join('');

  // Position menu, keep within viewport
  menu.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - 300)}px`;
  menu.hidden = false;

  menu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = (item as HTMLElement).dataset.action;
      const savedPath = currentPath;
      const savedType = currentType;
      hideContextMenu();
      await handleAction(action!, savedPath, savedType);
    });
  });
}

export function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  if (menu) menu.hidden = true;
  currentPath = null;
  currentType = 'empty';
}


function getTargetDir(path: string | null, type: TargetType): string {
  if (!path) {
    return getWorkspacePath() || '';
  }
  if (type === 'folder') {
    return path;
  }
  return getParentDir(path);
}


async function handleAction(action: string, path: string | null, type: TargetType) {
  try {
    switch (action) {
      case 'new-file': {
        const dir = getTargetDir(path, type);
        if (dir) startInlineCreate('file', dir);
        break;
      }
      case 'new-folder': {
        const dir = getTargetDir(path, type);
        if (dir) startInlineCreate('folder', dir);
        break;
      }
      case 'rename': {
        if (!path) return;
        startInlineRename(path);
        break;
      }
      case 'duplicate': {
        if (!path) return;
        const name = getFileName(path);
        const parent = getParentDir(path);
        const dotIdx = name.lastIndexOf('.');
        const baseName = dotIdx > 0 ? name.substring(0, dotIdx) : name;
        const ext = dotIdx > 0 ? name.substring(dotIdx) : '';
        const newPath = `${parent}/${baseName} (副本)${ext}`;
        await copyFile(path, newPath);
        const entries = await readSingleDir(parent);
        const newEntry = entries.find(e => e.path === newPath);
        if (newEntry) insertEntryIntoTree(parent, newEntry);
        showToast('已复制');
        break;
      }
      case 'delete': {
        if (!path) return;
        const name = getFileName(path);
        const confirmed = await ask(`确定删除 "${name}"？`, {
          title: '确认删除',
          kind: 'warning',
        });
        if (confirmed) {
          await deletePath(path);
          removeEntryFromTree(path);
          showToast('已删除');
        }
        break;
      }
      case 'copy-relative': {
        if (!path) return;
        const workspace = getWorkspacePath();
        if (workspace) {
          let relPath = path;
          if (relPath.startsWith(workspace)) {
            relPath = relPath.substring(workspace.length);
            if (relPath.startsWith('/')) {
              relPath = relPath.substring(1);
            }
          }
          await navigator.clipboard.writeText(relPath);
          showToast('已复制相对路径');
        }
        break;
      }
      case 'copy-absolute': {
        if (!path) return;
        await navigator.clipboard.writeText(path);
        showToast('已复制绝对路径');
        break;
      }
      case 'copy-workspace': {
        const workspace = getWorkspacePath();
        if (workspace) {
          await navigator.clipboard.writeText(workspace);
          showToast('已复制工作区路径');
        }
        break;
      }
      case 'reveal': {
        const revealPath = path || getWorkspacePath();
        if (revealPath) {
          try {
            await open(revealPath);
          } catch (e) {
            showToast(`打开失败: ${e}`);
          }
        }
        break;
      }
    }
  } catch (e) {
    showToast(`操作失败: ${e}`);
  }
}

// Click elsewhere to close
document.addEventListener('click', () => hideContextMenu());
