import { createFile, createDir, readSingleDir } from '../lib/storage';
import { insertEntryIntoTree, suppressNextWatcherRefresh } from './fileTree';
import { showToast } from './toast';
import { openFileInEditor } from './sidebar';
import { open, save } from '@tauri-apps/plugin-dialog';
import { showModal } from './ui/modal';

let mode: 'file' | 'folder' = 'file';
let closeDialog: (() => void) | null = null;

export function showNewFileDialog(type: 'file' | 'folder', workspacePath: string | null = null) {
  mode = type;

  // If no workspace is open, use system dialog
  if (!workspacePath) {
    if (type === 'file') {
      handleCreateNoWorkspace('file');
    } else {
      handleCreateNoWorkspace('folder');
    }
    return;
  }

  const modal = showModal({
    content: `
      <div class="newfile-modal">
        <div class="modal-header">
          <span id="newfile-title">${type === 'file' ? '新建文件' : '新建文件夹'}</span>
          <button class="modal-close" id="newfile-close">✕</button>
        </div>
        <div style="padding:16px 24px;">
          <input type="text" class="newfile-input" id="newfile-name"
            placeholder="${type === 'file' ? '文件名.md' : '文件夹名'}"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
        </div>
      </div>
    `,
  });
  closeDialog = () => modal.hide();

  const input = document.getElementById('newfile-name') as HTMLInputElement;
  input?.focus();

  document.getElementById('newfile-close')?.addEventListener('click', closeDialog);
  input?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      await handleCreateInWorkspace(input.value, workspacePath);
    } else if (e.key === 'Escape') {
      modal.hide();
    }
  });
}

async function handleCreateNoWorkspace(type: 'file' | 'folder') {
  if (type === 'file') {
    const path = await save({
      title: '保存文件',
      defaultPath: 'untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    if (path) {
      try {
        const filePath = path.endsWith('.md') ? path : `${path}.md`;
        await createFile(filePath, '');
        await openFileInEditor(filePath);
        showToast('文件已创建');
      } catch (e) {
        showToast(`创建失败: ${e}`);
      }
    }
  } else {
    const path = await open({
      title: '选择新建文件夹的位置',
      directory: true,
      multiple: false
    });
    if (path) {
      const name = prompt('输入文件夹名称:');
      if (name && name.trim()) {
        try {
          const fullPath = `${path}/${name.trim()}`;
          await createDir(fullPath);
          showToast('文件夹已创建');
        } catch (e) {
          showToast(`创建失败: ${e}`);
        }
      }
    }
  }
}

async function handleCreateInWorkspace(name: string, workspacePath: string | null) {
  if (!name.trim()) return;
  if (!workspacePath) {
    showToast('请先打开工作区');
    return;
  }

  const fullPath = `${workspacePath}/${name.trim()}`;

  try {
    if (mode === 'file') {
      const fileName = fullPath.endsWith('.md') ? fullPath : `${fullPath}.md`;
      suppressNextWatcherRefresh(fileName);
      await createFile(fileName, '');
      closeDialog?.();
      const entries = await readSingleDir(workspacePath);
      const newEntry = entries.find(e => e.path === fileName);
      if (newEntry) insertEntryIntoTree(workspacePath, newEntry);
      await openFileInEditor(fileName);
      showToast('文件已创建');
    } else {
      suppressNextWatcherRefresh(fullPath);
      await createDir(fullPath);
      closeDialog?.();
      const entries = await readSingleDir(workspacePath);
      const newEntry = entries.find(e => e.path === fullPath);
      if (newEntry) insertEntryIntoTree(workspacePath, newEntry);
      showToast('文件夹已创建');
    }
  } catch (e) {
    showToast(`创建失败: ${e}`);
  }
}
