import { readFile, writeFile, addRecentFile, addRecentFolder, saveSettings } from '../lib/storage';
import { getMarkdown, hasExternalModification, isDocumentDirty, markDocumentPersisted, markExternalModification, setMarkdown } from '../lib/editor';
import { showToast } from './toast';
import { initFileTree, refreshFileTree, setWorkspacePath, getWorkspacePath, startInlineCreate, suppressNextWatcherRefresh } from './fileTree';
import { initOutline, refreshOutline } from './outline';
import { showContextMenu } from './contextMenu';
import { open, save } from '@tauri-apps/plugin-dialog';
import { logException, logInfo } from '../lib/logger';

let activeFilePath: string | null = null;
let externalConflictDialogPromise: Promise<'keep' | 'disk' | 'save-as'> | null = null;
let externalDeletionDialogPromise: Promise<'resave' | 'discard'> | null = null;

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

export async function handleExternalDeletion(path: string) {
  if (!activeFilePath) return 'ignored' as const;
  if (activeFilePath !== path && !activeFilePath.startsWith(`${path}/`)) return 'ignored' as const;

  if (!isDocumentDirty() && !hasExternalModification()) {
    clearActiveDocument();
    return 'cleared' as const;
  }

  markExternalModification();
  const choice = await showExternalDeletionDialog();

  if (choice === 'discard') {
    clearActiveDocument();
    return 'discarded' as const;
  }

  const restored = await restoreDeletedActiveDocument();
  return restored ? 'resaved' as const : 'failed' as const;
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
      ? '当前文件已被外部修改。点击"确定"保存并覆盖磁盘版本后继续，点击"取消"查看放弃选项。'
      : '当前文件有未保存更改。点击"确定"保存后继续，点击"取消"查看放弃选项。'
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

  // Right-click on sidebar (outside file tree nodes)
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

function getConflictSavePath(path: string) {
  return path.endsWith('.md') ? `${path.slice(0, -3)}.conflict.md` : `${path}.conflict.md`;
}

function showExternalConflictDialog() {
  if (externalConflictDialogPromise) return externalConflictDialogPromise;

  externalConflictDialogPromise = new Promise<'keep' | 'disk' | 'save-as'>((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay external-conflict-dialog';
    overlay.innerHTML = `
      <div class="modal external-conflict-modal" role="dialog" aria-modal="true" aria-labelledby="external-conflict-title">
        <div class="modal-header">
          <span id="external-conflict-title">检测到外部修改</span>
        </div>
        <div class="external-conflict-body">
          <p>当前文件在磁盘上已发生变化。</p>
          <p>你在编辑器中也有未保存改动，请选择接下来要保留哪一份内容。</p>
        </div>
        <div class="external-conflict-actions">
          <button type="button" class="external-conflict-action secondary" data-action="keep">保留当前</button>
          <button type="button" class="external-conflict-action secondary" data-action="disk">加载磁盘版本</button>
          <button type="button" class="external-conflict-action primary" data-action="save-as">另存为</button>
        </div>
      </div>
    `;

    const finish = (choice: 'keep' | 'disk' | 'save-as') => {
      overlay.remove();
      externalConflictDialogPromise = null;
      resolve(choice);
    };

    overlay.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => finish(button.dataset.action as 'keep' | 'disk' | 'save-as'));
    });

    document.body.appendChild(overlay);
  });

  return externalConflictDialogPromise;
}

function showExternalDeletionDialog() {
  if (externalDeletionDialogPromise) return externalDeletionDialogPromise;

  externalDeletionDialogPromise = new Promise<'resave' | 'discard'>((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay external-delete-dialog';
    overlay.innerHTML = `
      <div class="modal external-delete-modal" role="dialog" aria-modal="true" aria-labelledby="external-delete-title">
        <div class="modal-header">
          <span id="external-delete-title">当前文件已被删除</span>
        </div>
        <div class="external-delete-body">
          <p>当前打开的文件已在磁盘上被删除。</p>
          <p>你在编辑器中的内容还在，是否要重新保存当前内容，还是直接删除掉？</p>
        </div>
        <div class="external-delete-actions">
          <button type="button" class="external-delete-action secondary" data-action="discard">删除掉</button>
          <button type="button" class="external-delete-action primary" data-action="resave">重新保存</button>
        </div>
      </div>
    `;

    const finish = (choice: 'resave' | 'discard') => {
      overlay.remove();
      externalDeletionDialogPromise = null;
      resolve(choice);
    };

    overlay.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => finish(button.dataset.action as 'resave' | 'discard'));
    });

    document.body.appendChild(overlay);
  });

  return externalDeletionDialogPromise;
}

async function restoreDeletedActiveDocument() {
  if (!activeFilePath) return false;

  const filePath = activeFilePath;
  const content = getMarkdown();

  try {
    suppressNextWatcherRefresh(filePath);
    await writeFile(filePath, content);
    markDocumentPersisted(content);
    await refreshFileTree();
    refreshOutline();
    showToast('已重新保存当前文件');
    return true;
  } catch {
    return saveActiveDocumentAsNewFile();
  }
}

async function saveActiveDocumentAsNewFile() {
  if (!activeFilePath) return false;

  const currentContent = getMarkdown();
  const targetPath = await save({
    title: '另存为',
    defaultPath: getConflictSavePath(activeFilePath),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });

  if (!targetPath) return false;
  if (targetPath === activeFilePath) {
    showToast('请另选一个新文件名');
    return false;
  }

  try {
    suppressNextWatcherRefresh(targetPath);
    await writeFile(targetPath, currentContent);
    setActiveFilePath(targetPath);
    markDocumentPersisted(currentContent);
    await refreshFileTree();
    refreshOutline();
    showToast('已另存为新文件');
    return true;
  } catch (e) {
    showToast(`另存为失败: ${e}`);
    return false;
  }
}

export async function saveActiveDocument(options: { interactive?: boolean } = {}) {
  const { interactive = true } = options;
  let filePath = getActiveFilePath();

  if (!filePath) {
    if (!interactive) return false;
    const targetPath = await save({
      title: '保存文件',
      defaultPath: 'untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (!targetPath) return false;
    const content = getMarkdown();
    try {
      suppressNextWatcherRefresh(targetPath);
      await writeFile(targetPath, content);
      setActiveFilePath(targetPath);
      markDocumentPersisted(content);
      addRecentFile(targetPath).catch(() => {});
      logInfo('sidebar.save', 'Saved new file', { path: targetPath });
      showToast('已保存');
      return true;
    } catch (e) {
      logException('sidebar.save', 'Failed to save new file without workspace', e, { path: targetPath });
      showToast('保存失败');
      return false;
    }
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
    if (interactive) {
      logInfo('sidebar.save', 'Saved active document', { path: filePath, interactive: true });
      showToast('已保存');
    }
    return true;
  } catch (e) {
    logException('sidebar.save', 'Failed to save active document', e, { path: filePath, interactive });
    if (interactive) showToast('保存失败');
    return false;
  }
}

export async function reloadActiveDocumentFromDisk(options: { force?: boolean } = {}) {
  const { force = false } = options;
  if (!activeFilePath) return false;
  if (!force && isDocumentDirty()) return false;
  if (!force && hasExternalModification()) return false;

  try {
    const content = await readFile(activeFilePath);
    setMarkdown(content);
    refreshOutline();
    return true;
  } catch (e) {
    showToast(`重新加载失败: ${e}`);
    return false;
  }
}

export async function handleActiveDocumentExternalModification() {
  if (!activeFilePath) return 'ignored' as const;

  if (!isDocumentDirty()) {
    const reloaded = await reloadActiveDocumentFromDisk({ force: true });
    return reloaded ? 'reloaded' as const : 'failed' as const;
  }

  markExternalModification();
  const choice = await showExternalConflictDialog();

  if (choice === 'disk') {
    const reloaded = await reloadActiveDocumentFromDisk({ force: true });
    return reloaded ? 'reloaded' as const : 'failed' as const;
  }

  if (choice === 'save-as') {
    const saved = await saveActiveDocumentAsNewFile();
    return saved ? 'saved-as' as const : 'kept' as const;
  }

  return 'kept' as const;
}

export async function openFileInEditor(path: string) {
  if (path === activeFilePath) {
    if (hasExternalModification() && !isDocumentDirty()) {
      const reloaded = await reloadActiveDocumentFromDisk({ force: true });
      if (reloaded) showToast('已从磁盘重新加载');
    } else if (hasExternalModification()) {
      const result = await handleActiveDocumentExternalModification();
      if (result === 'reloaded') showToast('已加载磁盘版本');
    }
    return;
  }
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
