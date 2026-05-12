import { renamePath, deletePath, copyFile } from '../lib/storage';
import { refreshFileTree } from './fileTree';
import { showToast } from './toast';

let currentPath: string | null = null;

export function showContextMenu(x: number, y: number, path: string) {
  currentPath = path;
  const menu = document.getElementById('context-menu');
  if (!menu) return;

  menu.innerHTML = `
    <button class="context-menu-item" data-action="rename">重命名</button>
    <button class="context-menu-item" data-action="copy">复制</button>
    <button class="context-menu-item danger" data-action="delete">删除</button>
  `;

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.hidden = false;

  menu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', async () => {
      const action = (item as HTMLElement).dataset.action;
      await handleAction(action!);
      hideContextMenu();
    });
  });
}

export function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  if (menu) menu.hidden = true;
  currentPath = null;
}

async function handleAction(action: string) {
  if (!currentPath) return;
  const path = currentPath;
  const name = path.split(/[/\\]/).pop() || '';

  try {
    switch (action) {
      case 'rename': {
        const newName = prompt('输入新名称:', name);
        if (newName && newName !== name) {
          const dir = path.substring(0, path.lastIndexOf('/'));
          await renamePath(path, `${dir}/${newName}`);
          showToast('已重命名');
          refreshFileTree();
        }
        break;
      }
      case 'copy': {
        const dotIdx = name.lastIndexOf('.');
        const baseName = dotIdx > 0 ? name.substring(0, dotIdx) : name;
        const ext = dotIdx > 0 ? name.substring(dotIdx) : '';
        const dir = path.substring(0, path.lastIndexOf('/'));
        await copyFile(path, `${dir}/${baseName} (副本)${ext}`);
        showToast('已复制');
        refreshFileTree();
        break;
      }
      case 'delete': {
        if (confirm(`确定删除 "${name}"？`)) {
          await deletePath(path);
          showToast('已删除');
          refreshFileTree();
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
