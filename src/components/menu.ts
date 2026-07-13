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

  // Event delegation for recent files
  const filesContainer = document.getElementById('menu-recent-files');
  filesContainer?.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.app-menu-item') as HTMLElement | null;
    if (!btn) return;
    const path = btn.dataset.path;
    if (!path) return;
    menu.hidden = true;
    if (!(await confirmDocumentTransition())) return;
    await addRecentFile(path);
    await openFileInEditor(path);
  });

  // Event delegation for recent folders
  const foldersContainer = document.getElementById('menu-recent-folders');
  foldersContainer?.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.app-menu-item') as HTMLElement | null;
    if (!btn) return;
    const path = btn.dataset.path;
    if (!path) return;
    menu.hidden = true;
    if (!(await confirmDocumentTransition())) return;
    await setWorkspacePath(path);
    clearActiveDocument();
    await refreshFileTree();
    showToast('文件夹已打开');
  });
}

/** @visibleForTesting */
export async function renderMenu() {
  const settings = await loadSettings();
  const recentFiles = (settings.recentFiles as string[]) || [];
  const recentFolders = (settings.recentFolders as string[]) || [];

  const filesContainer = document.getElementById('menu-recent-files');
  const foldersContainer = document.getElementById('menu-recent-folders');
  if (!filesContainer || !foldersContainer) return;

  // Files
  filesContainer.innerHTML = '';
  const filesTitle = document.createElement('div');
  filesTitle.className = 'app-menu-section-title';
  filesTitle.textContent = '最近打开的文件';
  filesContainer.appendChild(filesTitle);

  if (recentFiles.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'app-menu-empty';
    empty.textContent = '无';
    filesContainer.appendChild(empty);
  } else {
    for (const f of recentFiles) {
      const name = f.split('/').pop()?.split('\\').pop() || f;
      const btn = document.createElement('button');
      btn.className = 'app-menu-item';
      btn.dataset.path = f;
      btn.textContent = name;
      filesContainer.appendChild(btn);
    }
  }

  // Folders
  foldersContainer.innerHTML = '';
  const foldersTitle = document.createElement('div');
  foldersTitle.className = 'app-menu-section-title';
  foldersTitle.textContent = '最近打开的文件夹';
  foldersContainer.appendChild(foldersTitle);

  if (recentFolders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'app-menu-empty';
    empty.textContent = '无';
    foldersContainer.appendChild(empty);
  } else {
    for (const f of recentFolders) {
      const name = f.split('/').pop()?.split('\\').pop() || f;
      const btn = document.createElement('button');
      btn.className = 'app-menu-item';
      btn.dataset.path = f;
      btn.textContent = name;
      foldersContainer.appendChild(btn);
    }
  }
}
