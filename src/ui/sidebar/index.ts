import { showToast } from '../toast';
import { refreshFileTree, initTreeAria, setWorkspacePath, getWorkspacePath, startInlineCreate } from '../file-tree/index';
import { initMouseDrag } from '../file-tree/dragdrop';
import { initOutline } from '../outline';
import { showContextMenu } from '../file-tree-context-menu';
import { open } from '@tauri-apps/plugin-dialog';
import { saveSettings } from '../../infra/storage';
import { logException } from '../../infra/logger';

// Re-export functions from split modules for backward compatibility
export { saveActiveDocument, reloadActiveDocumentFromDisk, openFileInEditor, confirmDocumentTransition, isSavingInProgress } from './fileops';
export { handleExternalDeletion, handleActiveDocumentExternalModification } from './conflict';
export { getActiveFilePath, setActiveFilePath, rewriteActiveDocumentPath, clearActiveDocument, clearActiveDocumentIfMatches } from '../active-document';


export function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  initMouseDrag();
  initOutline();

  // Right-click on sidebar (outside file tree nodes)
  sidebar.addEventListener('contextmenu', (e) => {
    if ((e.target as HTMLElement).closest('.tree-file, .tree-folder')) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, null, 'empty');
  });

  // Sidebar footer buttons
  document.getElementById('sidebar-open-btn')?.addEventListener('click', async () => {
    await openWorkspaceFolderFlow();
  });

  document.getElementById('sidebar-newfolder-btn')?.addEventListener('click', () => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      showToast('请先打开一个工作区文件夹');
      return;
    }
    startInlineCreate('folder', workspacePath);
  });

  // Tab switching + save preference
  sidebar.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab as 'files' | 'outline';
      switchSidebarTab(tabName);
      saveSettings({ lastSidebarTab: tabName }).catch(e => logException('sidebar.tab', 'Failed to persist sidebar tab preference', e));
    });
  });

  // Add resize handle
  const resizeHandle = document.querySelector('.sidebar-resize-handle');

  if (resizeHandle && sidebar) {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
      if (sidebar.classList.contains('collapsed')) return;
      isResizing = true;
      startX = (e as MouseEvent).clientX;
      startWidth = sidebar.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const diff = e.clientX - startX;
      const newWidth = Math.max(200, Math.min(400, startWidth + diff));
      sidebar.style.width = `${newWidth}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }
}

export function switchSidebarTab(tab: 'files' | 'outline') {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  sidebar.querySelectorAll('.sidebar-tab').forEach(t => {
    t.classList.toggle('active', (t as HTMLElement).dataset.tab === tab);
  });

  const fileTree = document.getElementById('file-tree');
  const outlineTree = document.getElementById('outline-tree');
  const footer = document.getElementById('sidebar-footer');

  if (fileTree) {
    fileTree.hidden = tab !== 'files';
    if (tab === 'files') initTreeAria(fileTree);
  }
  if (outlineTree) outlineTree.hidden = tab !== 'outline';
  if (footer) footer.style.display = tab === 'files' ? 'flex' : 'none';
}

/**
 * Reveal the file tree of a freshly opened workspace.
 *
 * Opening a folder is an explicit request to browse it, so the sidebar must end
 * up expanded on the files tab — the default (and restored) tab is the outline,
 * which left the tree hidden behind `#file-tree[hidden]` (issue #375). A
 * collapsed sidebar is expanded through its toggle button so the button icon and
 * `aria-pressed` stay in sync with the visible sidebar.
 */
export function revealFilesTab(): void {
  const sidebar = document.getElementById('sidebar');
  if (sidebar?.classList.contains('collapsed')) {
    document.getElementById('sidebar-toggle')?.click();
  }
  switchSidebarTab('files');
}

/**
 * Open a workspace folder: pick a directory, register it, load the tree and show
 * it. Every entry point (sidebar footer, toolbar, native menu) goes through this
 * one flow so they cannot drift apart.
 */
export async function openWorkspaceFolderFlow(): Promise<void> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected) return;
  await activateWorkspaceFolder(selected);
}

/**
 * Activate an already-known workspace folder (recent folders, startup restore).
 * Same as {@link openWorkspaceFolderFlow} without the directory dialog.
 */
export async function activateWorkspaceFolder(path: string): Promise<void> {
  await setWorkspacePath(path);
  // setWorkspacePath logs and swallows backend failures; revealing the files tab
  // and reporting success on top of an empty tree would reproduce the very
  // symptom this flow exists to remove (issue #375).
  if (!getWorkspacePath()) return;
  await refreshFileTree();
  revealFilesTab();
  showToast('文件夹已打开');
}
