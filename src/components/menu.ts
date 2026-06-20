import { loadSettings, clearRecentHistory, addRecentFile } from '../lib/storage';
import { showToast } from './toast';
import { confirmDocumentTransition, openFileInEditor, clearActiveDocument } from './sidebar';
import { setWorkspacePath, refreshFileTree } from './fileTree';

export function initMenu() {
  const btn = document.getElementById('toolbar-menu-btn');
  const menu = document.getElementById('app-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const isOpen = !menu.hidden;
    // Close all menus first
    document.querySelectorAll('.app-menu').forEach(m => (m as HTMLElement).hidden = true);
    if (isOpen) return;
    await renderMenu();
    menu.hidden = false;
  });

  document.addEventListener('click', () => {
    menu.hidden = true;
  });

  menu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  document.getElementById('menu-clear-history')?.addEventListener('click', async () => {
    menu.hidden = true;
    await clearRecentHistory();
    showToast('历史记录已清除');
  });
}

async function renderMenu() {
  const settings = await loadSettings();
  const recentFiles = (settings.recentFiles as string[]) || [];
  const recentFolders = (settings.recentFolders as string[]) || [];

  const filesContainer = document.getElementById('menu-recent-files');
  const foldersContainer = document.getElementById('menu-recent-folders');
  if (!filesContainer || !foldersContainer) return;

  // Files
  let filesHtml = '<div class="app-menu-section-title">最近打开的文件</div>';
  if (recentFiles.length === 0) {
    filesHtml += '<div class="app-menu-empty">无</div>';
  } else {
    for (const f of recentFiles) {
      const name = f.split('/').pop()?.split('\\').pop() || f;
      filesHtml += `<button class="app-menu-item" data-path="${f}" data-type="file">${name}</button>`;
    }
  }
  filesContainer.innerHTML = filesHtml;

  // Folders
  let foldersHtml = '<div class="app-menu-section-title">最近打开的文件夹</div>';
  if (recentFolders.length === 0) {
    foldersHtml += '<div class="app-menu-empty">无</div>';
  } else {
    for (const f of recentFolders) {
      const name = f.split('/').pop()?.split('\\').pop() || f;
      foldersHtml += `<button class="app-menu-item" data-path="${f}" data-type="folder">${name}</button>`;
    }
  }
  foldersContainer.innerHTML = foldersHtml;

  // Wire item clicks
  filesContainer.querySelectorAll('.app-menu-item').forEach(el => {
    el.addEventListener('click', async (e) => {
      const path = (e.currentTarget as HTMLElement).dataset.path;
      if (!path) return;
      (document.getElementById('app-menu'))!.hidden = true;
      if (!(await confirmDocumentTransition())) return;
      await addRecentFile(path);
      await openFileInEditor(path);
    });
  });

  foldersContainer.querySelectorAll('.app-menu-item').forEach(el => {
    el.addEventListener('click', async (e) => {
      const path = (e.currentTarget as HTMLElement).dataset.path;
      if (!path) return;
      (document.getElementById('app-menu'))!.hidden = true;
      if (!(await confirmDocumentTransition())) return;
      await setWorkspacePath(path);
      clearActiveDocument();
      await refreshFileTree();
      showToast('文件夹已打开');
    });
  });
}
