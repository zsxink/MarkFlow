import { readFile, writeFile, addRecentFile } from '../lib/storage';
import { getMarkdown, hasExternalModification, isDocumentDirty, markDocumentPersisted, setActiveDocumentPath, setMarkdown } from '../lib/editor';
import { showToast } from './toast';
import { suppressNextWatcherRefresh, refreshFileTree } from './fileTree';
import { refreshOutline } from './outline';
import { logException, logInfo } from '../lib/logger';
import { save } from '@tauri-apps/plugin-dialog';
import { showDialog } from './ui/dialog';
import { getActiveFilePath, setActiveFilePath } from './activeDocument';

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

function getConflictSavePath(path: string) {
  return path.endsWith('.md') ? `${path.slice(0, -3)}.conflict.md` : `${path}.conflict.md`;
}

export async function saveActiveDocumentAsNewFile() {
  const filePath = getActiveFilePath();
  if (!filePath) return false;

  const currentContent = getMarkdown();
  const targetPath = await save({
    title: '另存为',
    defaultPath: getConflictSavePath(filePath),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });

  if (!targetPath) return false;
  if (targetPath === filePath) {
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
  const filePath = getActiveFilePath();
  if (!filePath) return false;
  if (!force && isDocumentDirty()) return false;
  if (!force && hasExternalModification()) return false;

  try {
    const content = await readFile(filePath);
    setMarkdown(content);
    refreshOutline();
    return true;
  } catch (e) {
    showToast(`重新加载失败: ${e}`);
    return false;
  }
}

export async function openFileInEditor(path: string) {
  const activePath = getActiveFilePath();
  if (path === activePath) {
    if (hasExternalModification() && !isDocumentDirty()) {
      const reloaded = await reloadActiveDocumentFromDisk({ force: true });
      if (reloaded) showToast('已从磁盘重新加载');
    } else if (hasExternalModification()) {
      const { handleActiveDocumentExternalModification } = await import('./sidebar.conflict');
      const result = await handleActiveDocumentExternalModification();
      if (result === 'reloaded') showToast('已加载磁盘版本');
    }
    return;
  }
  if (!(await confirmDocumentTransition())) return;

  try {
    const content = await readFile(path);
    setActiveDocumentPath(path);
    setActiveFilePath(path);
    setMarkdown(content);
    refreshOutline();
    showToast('已打开文件');
  } catch (e) {
    showToast(`打开失败: ${e}`);
  }
}
