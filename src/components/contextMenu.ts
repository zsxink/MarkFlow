import { deletePath, copyFile, readSingleDir, addRecentFile } from '../lib/storage';
import { getWorkspacePath, removeEntryFromTree, insertEntryIntoTree, startInlineRename, startInlineCreate, setWorkspacePath, refreshFileTree } from './fileTree';
import { showToast } from './toast';
import { reportUserActionError } from '../lib/error';
import { clearActiveDocument, clearActiveDocumentIfMatches, confirmDocumentTransition, openFileInEditor } from './sidebar';
import { getFileName, getParentDir } from '../lib/pathUtils';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { open as dialogOpen } from '@tauri-apps/plugin-dialog';
import { ask } from '@tauri-apps/plugin-dialog';
import { showContextMenuStatic } from './ui/contextMenu';
import type { ContextMenuItem } from './ui/contextMenu';

type TargetType = 'file' | 'folder' | 'empty';

export function showContextMenu(x: number, y: number, path: string | null, type: TargetType) {
  const workspacePath = getWorkspacePath();
  const menuItems: ContextMenuItem[] = [];

  // New file / New folder — always available when workspace exists
  if (workspacePath) {
    menuItems.push({ label: '新建文件', onClick: () => handleContextAction('new-file', path, type) });
    menuItems.push({ label: '新建文件夹', onClick: () => handleContextAction('new-folder', path, type) });
  }

  if (type === 'file' || type === 'folder') {
    menuItems.push({ label: '重命名', onClick: () => handleContextAction('rename', path, type) });
    menuItems.push({ label: '复制(副本)', onClick: () => handleContextAction('duplicate', path, type) });
    menuItems.push({ label: '删除', danger: true, onClick: () => handleContextAction('delete', path, type) });
    menuItems.push({ divider: true });
    menuItems.push({ label: '复制文件路径', onClick: () => handleContextAction('copy-relative', path, type) });
    menuItems.push({ label: '复制绝对路径', onClick: () => handleContextAction('copy-absolute', path, type) });
  } else {
    if (workspacePath) {
      menuItems.push({ divider: true });
      menuItems.push({ label: '复制工作区路径', onClick: () => handleContextAction('copy-workspace', path, type) });
    } else {
      menuItems.push({ label: '打开文件夹', onClick: () => handleContextAction('open-folder', path, type) });
      menuItems.push({ label: '打开文件', onClick: () => handleContextAction('open-file', path, type) });
    }
  }

  // Reveal in explorer — always available when path or workspace exists
  if (path || workspacePath) {
    menuItems.push({ label: '在文件资源管理器中显示', onClick: () => handleContextAction('reveal', path, type) });
  }

  showContextMenuStatic(menuItems, { x, y });
}

function handleContextAction(action: string, path: string | null, type: TargetType) {
  // We can't await inside onClick, so we fire-and-forget
  handleAction(action, path, type).catch((e) => {
    reportUserActionError(`context-menu.${action}`, e);
  });
}

export function hideContextMenu() {
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
          clearActiveDocumentIfMatches(path);
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
      case 'open-folder': {
        if (!(await confirmDocumentTransition())) return;
        const folder = await dialogOpen({ directory: true, multiple: false });
        if (folder) {
          await setWorkspacePath(folder);
          clearActiveDocument();
          await refreshFileTree();
          showToast('文件夹已打开');
        }
        break;
      }
      case 'open-file': {
        if (!(await confirmDocumentTransition())) return;
        const file = await dialogOpen({
          multiple: false,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        });
        if (file) {
          await addRecentFile(file);
          await openFileInEditor(file);
        }
        break;
      }
      case 'reveal': {
        const revealPath = path || getWorkspacePath();
        if (revealPath) {
          try {
            await shellOpen(revealPath);
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
