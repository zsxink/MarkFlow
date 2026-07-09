import { isDocumentDirty, hasExternalModification } from '../lib/editor';
import { showToast } from './toast';
import { initFileTree, refreshFileTree, setWorkspacePath, getWorkspacePath, startInlineCreate } from './fileTree';
import { initOutline } from './outline';
import { showContextMenu } from './contextMenu';
import { open } from '@tauri-apps/plugin-dialog';
import { addRecentFolder, saveSettings } from '../lib/storage';
import { showDialog } from './ui/dialog';
import { saveActiveDocument } from './sidebar.fileops';
import { getActiveFilePath, setActiveFilePath, rewriteActiveDocumentPath, clearActiveDocument, clearActiveDocumentIfMatches } from './activeDoc';

// Re-export functions from split modules for backward compatibility
export { saveActiveDocument, reloadActiveDocumentFromDisk, openFileInEditor } from './sidebar.fileops';
export { handleExternalDeletion, handleActiveDocumentExternalModification } from './sidebar.conflict';
export { getActiveFilePath, setActiveFilePath, rewriteActiveDocumentPath, clearActiveDocument, clearActiveDocumentIfMatches };

export async function confirmDocumentTransition(): Promise<boolean> {
  const dirty = isDocumentDirty();
  const conflicted = hasExternalModification();
  if (!dirty && !conflicted) return true;

  const title = conflicted ? '外部修改冲突' : '未保存的更改';
  const body = conflicted
    ? '当前文件已被外部修改。切换到其他文件前希望如何处理？'
    : '当前文件有未保存的更改。切换到其他文件前希望如何处理？';

  const result = await showDialog({
    title,
    body: `<p style="margin:0 0 16px;font-size:14px;color:var(--fg);line-height:1.5;">${body}</p>`,
    buttons: [
      { label: '取消', value: 'cancel' },
      { label: '不保存', value: 'discard' },
      { label: '保存', value: 'save', primary: true },
    ],
    width: '360px',
  });

  if (result === 'save') {
    const saved = await saveActiveDocument({ interactive: true });
    if (saved) return true;
    return false;
  }

  if (result === 'discard') return true;
  return false;
}

export function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  initFileTree();
  initOutline();

  // Right-click on sidebar (outside file tree nodes)
  sidebar.addEventListener('contextmenu', (e) => {
    if ((e.target as HTMLElement).closest('.tree-file, .tree-folder')) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, null, 'empty');
  });

  // Sidebar footer buttons
  document.getElementById('sidebar-open-btn')?.addEventListener('click', async () => {
    if (!(await confirmDocumentTransition())) return;
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      await setWorkspacePath(selected);
      clearActiveDocument();
      await refreshFileTree();
      await addRecentFolder(selected);
      showToast('文件夹已打开');
    }
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
      saveSettings({ lastSidebarTab: tabName }).catch(() => {});
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

  if (fileTree) fileTree.hidden = tab !== 'files';
  if (outlineTree) outlineTree.hidden = tab !== 'outline';
  if (footer) footer.style.display = tab === 'files' ? 'flex' : 'none';
}
