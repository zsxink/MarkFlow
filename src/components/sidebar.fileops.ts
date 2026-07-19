import { readFile, writeFile, addRecentFile, getFileMetadata } from '../lib/storage';
import { getMarkdown, hasExternalModification, isDocumentDirty, markDocumentPersisted, resetEditorScroll, setActiveDocumentPath, setMarkdown, getRevision, getLastReadMtime, getLastReadSize, setLastReadStats, getEditor } from '../lib/editor';
import { setSourceReadOnly } from '../lib/editor.source';
import { showToast } from './toast';
import { suppressNextWatcherRefresh, applyFileTreeEvents } from './fileTree';
import { refreshOutline } from './outline';
import { logException, logInfo, logDebug } from '../lib/logger';
import { save } from '@tauri-apps/plugin-dialog';
import { showDialog } from './ui/dialog';
import { getActiveFilePath, setActiveFilePath } from './activeDocument';
import { handleActiveDocumentExternalModification } from './sidebar.conflict';
import { determineTier, formatFileSize } from '../lib/fileSizeTier';
import { showDegradationBar, hideDegradationBar } from './degradationBar';
import { store } from '../lib/store';
import { invoke } from '@tauri-apps/api/core';

// ── Serial save guard ────────────────────────────────────────────────

let savingInProgress = false;

/** Returns true if a save operation is currently in progress. */
export function isSavingInProgress(): boolean {
  return savingInProgress;
}

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
    // Record mtime + size for future external-modification checks
    try {
      const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: targetPath });
      setLastReadStats(stats.mtime, stats.size);
    } catch (e) { logDebug('fileops', 'Failed to get file stats after save-as (non-critical)', { path: targetPath, error: String(e) }); }
    markDocumentPersisted(currentContent);
    await applyFileTreeEvents([{ path: targetPath, kind: 'create', timestamp: Date.now() }]);
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

  // ── Serial guard: skip if a save is already in progress ──────────
  if (savingInProgress) {
    logDebug('sidebar.save', 'Save skipped — previous save still in progress');
    return false;
  }

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
    const revision = getRevision();
    savingInProgress = true;
    try {
      suppressNextWatcherRefresh(targetPath);
      await writeFile(targetPath, content);
      setActiveFilePath(targetPath);
      // Record mtime + size for future external-modification checks
      try {
        const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: targetPath });
        setLastReadStats(stats.mtime, stats.size);
      } catch (e) { logDebug('fileops', 'Failed to get file stats after save new file (non-critical)', { path: targetPath, error: String(e) }); }
      markDocumentPersisted(content, revision);
      addRecentFile(targetPath).catch((e) =>
        logDebug('sidebar.save', 'Failed to record recent file (best-effort)', { path: targetPath, error: String(e) }),
      );
      logInfo('sidebar.save', 'Saved new file', { path: targetPath });
      showToast('已保存');
      return true;
    } catch (e) {
      logException('sidebar.save', 'Failed to save new file without workspace', e, { path: targetPath });
      showToast('保存失败');
      return false;
    } finally {
      savingInProgress = false;
    }
  }

  // ── External modification check (mtime + size) ──────────────────
  if (hasExternalModification()) {
    if (!interactive) return false;
    const confirmed = window.confirm('文件已被外部修改。是否覆盖磁盘中的最新内容？');
    if (!confirmed) {
      showToast('已取消保存');
      return false;
    }
  }

  // ── Pre-save mtime + size validation ────────────────────────────
  const lastMtime = getLastReadMtime();
  const lastSize = getLastReadSize();
  if (lastMtime > 0 || lastSize > 0) {
    try {
      const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: filePath });
      if (stats.mtime !== lastMtime || stats.size !== lastSize) {
        if (!interactive) {
          logDebug('sidebar.save', 'Auto-save skipped — file modified externally', { path: filePath });
          return false;
        }
        const confirmed = window.confirm('文件已被外部修改。是否覆盖磁盘中的最新内容？');
        if (!confirmed) {
          showToast('已取消保存');
          return false;
        }
      }
    } catch (e) {
      // If stat fails, proceed with save anyway
      logDebug('fileops', 'Pre-save stat check failed, proceeding with save', { path: filePath, error: String(e) });
    }
  }

  // ── Atomic save with revision tracking ──────────────────────────
  const content = getMarkdown();
  const revision = getRevision();
  savingInProgress = true;
  try {
    suppressNextWatcherRefresh(filePath);
    await writeFile(filePath, content);
    // Record mtime + size after successful write
    try {
      const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: filePath });
      setLastReadStats(stats.mtime, stats.size);
    } catch (e) { logDebug('fileops', 'Failed to get file stats after write (non-critical)', { path: filePath, error: String(e) }); }
    markDocumentPersisted(content, revision);
    if (interactive) {
      logInfo('sidebar.save', 'Saved active document', { path: filePath, interactive: true });
      showToast('已保存');
    }
    return true;
  } catch (e) {
    // Keep dirty state on failure — user sees error toast in interactive mode
    logException('sidebar.save', 'Failed to save active document', e, { path: filePath, interactive });
    if (interactive) showToast('保存失败，请重试');
    return false;
  } finally {
    savingInProgress = false;
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
      const result = await handleActiveDocumentExternalModification();
      if (result === 'reloaded') showToast('已加载磁盘版本');
    }
    return;
  }
  if (!(await confirmDocumentTransition())) return;

  try {
    // Read metadata for tier classification
    const metadata = await getFileMetadata(path);
    const tier = determineTier(metadata.size, metadata.lines);

    // Handle Huge tier: confirmation before opening
    if (tier === 'huge') {
      const choice = await showDialog({
        title: '文件过大',
        body: `<p style="margin:0 0 12px;font-size:14px;color:var(--fg);">该文件较大 (${formatFileSize(metadata.size)}，${metadata.lines} 行)，可能导致编辑器卡顿。</p>
               <p style="margin:0 0 16px;font-size:13px;color:var(--muted);">建议以只读模式预览，或强制打开（部分功能可能受限）。</p>`,
        buttons: [
          { label: '取消', value: 'cancel' },
          { label: '强制打开', value: 'force' },
          { label: '只读预览', value: 'readonly', primary: true },
        ],
        width: '400px',
      });
      if (!choice || choice === 'cancel') return;

      if (choice === 'readonly') {
        const content = await readFile(path);
        setActiveDocumentPath(path);
        setActiveFilePath(path);
        setMarkdown(content);
        setReadOnly(true);
        showDegradationBar({ tier: 'huge', size: formatFileSize(metadata.size), lines: metadata.lines, readOnly: true });
        resetEditorScroll();
        refreshOutline();
        showToast('已以只读模式打开文件');
        return;
      }
      // choice === 'force' — proceed to normal open with degradation bar
    }

    const content = await readFile(path);
    setActiveDocumentPath(path);
    setActiveFilePath(path);
    setMarkdown(content);
    // Reset read-only state for normal/large opens
    setReadOnly(false);

    // Show degradation UI for large files
    if (tier === 'large') {
      showDegradationBar({ tier: 'large', size: formatFileSize(metadata.size), lines: metadata.lines });
    } else {
      hideDegradationBar();
    }

    // Record mtime + size for future external-modification checks
    try {
      const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path });
      setLastReadStats(stats.mtime, stats.size);
    } catch (e) { logDebug('fileops', 'Failed to get file stats after open (non-critical)', { path, error: String(e) }); }
    resetEditorScroll();
    refreshOutline();
    showToast('已打开文件');
  } catch (e) {
    showToast(`打开失败: ${e}`);
  }
}

function setReadOnly(readOnly: boolean): void {
  store.setState({ readOnly });
  // ProseMirror (WYSIWYG) read-only
  const editor = getEditor();
  if (editor) {
    editor.setEditable(!readOnly);
  }
  // CodeMirror (source mode) read-only
  setSourceReadOnly(readOnly);
}
