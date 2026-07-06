import { isDocumentDirty, hasExternalModification, setMarkdown, setActiveDocumentPath } from '../lib/editor';
import { showToast } from './toast';
import { initFileTree, refreshFileTree, setWorkspacePath, getWorkspacePath, startInlineCreate } from './fileTree';
import { initOutline, refreshOutline } from './outline';
import { showContextMenu } from './contextMenu';
import { open } from '@tauri-apps/plugin-dialog';
import { addRecentFolder, saveSettings } from '../lib/storage';

// Re-export functions from split modules for backward compatibility
export { saveActiveDocument, reloadActiveDocumentFromDisk, openFileInEditor } from './sidebar.fileops';
export { handleExternalDeletion, handleActiveDocumentExternalModification } from './sidebar.conflict';

let activeFilePath: string | null = null;

function updateActiveTreeSelection(path: string | null) {
  document.querySelectorAll('.tree-file').forEach(el => {
    el.classList.toggle('active', (el as HTMLElement).dataset.path === path);
  });
}

export function getActiveFilePath() {
  return activeFilePath;
}

export function setActiveFilePath(path: string | null) {
  activeFilePath = path;
  updateActiveTreeSelection(path);
}

export function rewriteActiveDocumentPath(from: string, to: string) {
  if (!activeFilePath) return;
  if (activeFilePath !== from && !activeFilePath.startsWith(`${from}/`)) return;
  const suffix = activeFilePath === from ? '' : activeFilePath.slice(from.length);
  setActiveFilePath(`${to}${suffix}`);
}

export function clearActiveDocumentIfMatches(path: string) {
  if (!activeFilePath) return;
  if (activeFilePath === path || activeFilePath.startsWith(`${path}/`)) {
    clearActiveDocument();
  }
}

export function clearActiveDocument() {
  activeFilePath = null;
  setMarkdown('');
  setActiveDocumentPath(null);
  updateActiveTreeSelection(null);
  refreshOutline();
}

export async function confirmDocumentTransition(): Promise<boolean> {
  const dirty = isDocumentDirty();
  const conflicted = hasExternalModification();
  if (!dirty && !conflicted) return true;

  return new Promise<boolean>((resolve) => {
    const overlay = document.getElementById('unsaved-modal');
    if (!overlay) return resolve(true);

    let settled = false;
    const title = conflicted ? '外部修改冲突' : '未保存的更改';
    const body = conflicted
      ? '当前文件已被外部修改。切换到其他文件前希望如何处理？'
      : '当前文件有未保存的更改。切换到其他文件前希望如何处理？';

    overlay.innerHTML = `
      <div class="modal" style="width:360px;">
        <div class="modal-header">
          <span>${title}</span>
          <button class="modal-close" id="confirm-dirty-close">✕</button>
        </div>
        <div style="padding:16px 24px;">
          <p style="margin:0 0 16px;font-size:14px;color:var(--fg);line-height:1.5;">${body}</p>
          <div class="modal-footer" style="padding-top:0;">
            <button class="btn-secondary" id="confirm-dirty-cancel">取消</button>
            <button class="btn-secondary" id="confirm-dirty-discard">不保存</button>
            <button class="btn-primary" id="confirm-dirty-save">保存</button>
          </div>
        </div>
      </div>
    `;
    overlay.hidden = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      overlay.hidden = true;
      overlay.removeEventListener('click', backdropClick);
      document.removeEventListener('keydown', keyHandler);
      resolve(result);
    };

    const cancel = () => finish(false);
    const discard = () => finish(true);

    const saveAndProceed = async () => {
      if (settled) return;
      // Dynamic import to avoid circular dependency at resolution time
      const { saveActiveDocument } = await import('./sidebar.fileops');
      const saved = await saveActiveDocument({ interactive: true });
      if (saved) finish(true);
    };

    // Bind button events
    document.getElementById('confirm-dirty-close')!.addEventListener('click', cancel);
    document.getElementById('confirm-dirty-cancel')!.addEventListener('click', cancel);
    document.getElementById('confirm-dirty-discard')!.addEventListener('click', discard);
    document.getElementById('confirm-dirty-save')!.addEventListener('click', saveAndProceed);

    // Backdrop click → cancel
    const backdropClick = (e: MouseEvent) => {
      if (e.target === overlay) cancel();
    };
    overlay.addEventListener('click', backdropClick);

    // Keyboard: Escape → cancel, Enter → save
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
      if (e.key === 'Enter' && !settled) {
        document.getElementById('confirm-dirty-save')?.click();
      }
    };
    document.addEventListener('keydown', keyHandler);

    // Focus the save button
    setTimeout(() => {
      const saveBtn = document.getElementById('confirm-dirty-save');
      if (saveBtn) saveBtn.focus();
    }, 0);
  });
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
      saveSettings({ lastSidebarTab: tabName } as unknown as Record<string, unknown>).catch(() => {});
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
