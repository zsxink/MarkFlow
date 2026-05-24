import { readFile, writeFile } from '../lib/storage';
import { getMarkdown, hasExternalModification, isDocumentDirty, markDocumentPersisted, setMarkdown } from '../lib/editor';
import { showToast } from './toast';
import { initFileTree, refreshFileTree, setWorkspacePath, getWorkspacePath, startInlineCreate, suppressNextWatcherRefresh } from './fileTree';
import { initOutline, refreshOutline } from './outline';
import { showContextMenu } from './contextMenu';
import { open } from '@tauri-apps/plugin-dialog';

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
  updateActiveTreeSelection(null);
  refreshOutline();
}

export async function confirmDocumentTransition() {
  const dirty = isDocumentDirty();
  const conflicted = hasExternalModification();
  if (!dirty && !conflicted) return true;

  const shouldSave = window.confirm(
    conflicted
      ? '当前文件已被外部修改。点击“确定”保存并覆盖磁盘版本后继续，点击“取消”查看放弃选项。'
      : '当前文件有未保存更改。点击“确定”保存后继续，点击“取消”查看放弃选项。'
  );

  if (shouldSave) {
    return saveActiveDocument();
  }

  return window.confirm('是否放弃当前修改并继续？');
}

export function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  initFileTree();
  initOutline();

  // Right-click on sidebar (outside file tree nodes) shows empty context menu
  sidebar.addEventListener('contextmenu', (e) => {
    if ((e.target as HTMLElement).closest('.tree-file, .tree-folder')) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, null, 'empty');
  });

  // Sidebar footer buttons
  document.getElementById('sidebar-open-btn')?.addEventListener('click', async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      if (!(await confirmDocumentTransition())) return;
      await setWorkspacePath(selected);
      clearActiveDocument();
      await refreshFileTree();
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

  // Tab switching
  sidebar.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab as 'files' | 'outline';
      switchSidebarTab(tabName);
    });
  });

  // Add resize handle functionality
  const resizeHandle = document.querySelector('.sidebar-resize-handle');

  if (resizeHandle && sidebar) {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
      // Don't start resize if sidebar is collapsed
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

export async function saveActiveDocument(options: { interactive?: boolean } = {}) {
  const { interactive = true } = options;
  const filePath = getActiveFilePath();
  if (!filePath) {
    if (interactive) showToast('没有打开的文件');
    return false;
  }

  if (hasExternalModification()) {
    if (!interactive) return false;
    const confirmed = window.confirm('文件已被外部修改。是否覆盖磁盘中的最新内容？');
    if (!confirmed) {
      showToast('已取消保存');
      return false;
    }
  }

  try {
    const content = getMarkdown();
    suppressNextWatcherRefresh(filePath);
    await writeFile(filePath, content);
    markDocumentPersisted(content);
    if (interactive) showToast('已保存');
    return true;
  } catch (e) {
    console.error('Save failed:', e);
    if (interactive) showToast('保存失败');
    return false;
  }
}

export async function openFileInEditor(path: string) {
  if (path === activeFilePath) return;
  if (!(await confirmDocumentTransition())) return;

  try {
    const content = await readFile(path);
    setMarkdown(content);
    setActiveFilePath(path);
    refreshOutline();
    showToast('已打开文件');
  } catch (e) {
    showToast(`打开失败: ${e}`);
  }
}
