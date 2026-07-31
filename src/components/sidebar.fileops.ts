import { readFile, authorizeImageStorage, getFileMetadata } from '../lib/storage';
import { getCurrentSourceMarkdown, hasExternalModification, isDocumentDirty, markDocumentPersisted, resetEditorScroll, setActiveDocumentPath, setMarkdown, setLastReadStats, getEditor } from '../lib/editor';
import { setSourceReadOnly } from '../lib/editor.source';
import { showToast } from './toast';
import { suppressNextWatcherRefresh, applyFileTreeEvents } from './fileTree';
import { refreshOutline } from './outline';
import { logException, logDebug } from '../lib/logger';
import { save } from '@tauri-apps/plugin-dialog';
import { showDialog } from './ui/dialog';
import { getActiveFilePath, setActiveFilePath } from './activeDocument';
import { handleActiveDocumentExternalModification } from './sidebar.conflict';
import { determineTier, formatFileSize } from '../lib/fileSizeTier';
import { showDegradationBar, hideDegradationBar } from './degradationBar';
import { store } from '../lib/store';
import { invoke } from '@tauri-apps/api/core';
import { discardActiveImageDraft } from '../lib/imageUtils';
import { saveCoreSession, getCoreSessionState, openCoreSession, closeCoreSession } from '../lib/coreSession';

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
    : '有未保存的内容，是否保存？';

  const result = await showDialog({
    title,
    body: `<p style="margin:0 0 12px;font-size:14px;color:var(--fg);line-height:1.5;">${body}</p>`,
    buttons: [
      { label: '取消', value: 'cancel' },
      { label: '不保存', value: 'discard' },
      { label: '保存', value: 'save', primary: true },
    ],
    width: '320px',
    padding: '12px 20px',
  });

  if (result === 'save') {
    const saved = await saveActiveDocument({ interactive: true });
    if (saved === 'saved') return true;
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

    // M3.1-5.4: Migrate Save As to Runtime authority when Core session is active
    const sessionState = getCoreSessionState();
    if (sessionState.isActive) {
      // 1. Save current session content first to ensure all patches are applied
      const savedRevision = await saveCoreSession({ interactive: false });

      if (savedRevision < 0) {
        showToast('另存为失败：无法保存当前文档');
        return false;
      }

      // 2. Close the current Core session (old path)
      await closeCoreSession();

      // 3. Open a new Core session for the target path
      const opened = await openCoreSession(targetPath);

      if (!opened) {
        showToast('另存为失败：无法创建新 Core 会话');
        return false;
      }

      // 4. Set new active path
      setActiveFilePath(targetPath);

      // 5. Record mtime + size from the newly created file
      try {
        const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: targetPath });
        setLastReadStats(stats.mtime, stats.size);
      } catch (e) { logDebug('fileops', 'Failed to get file stats after save-as (non-critical)', { path: targetPath, error: String(e) }); }

      await applyFileTreeEvents([{ path: targetPath, kind: 'create', timestamp: Date.now() }]);
      refreshOutline();
      showToast('已另存为新文件');
      return true;
    }

    showToast('另存为需要已确认的 Core 会话');
    return false;
  } catch (e) {
    showToast(`另存为失败: ${e}`);
    return false;
  }
}

export type SaveResult = 'saved' | 'skipped' | 'failed';

export async function saveActiveDocument(options: { interactive?: boolean } = {}): Promise<SaveResult> {
  const { interactive = true } = options;

  // ── Serial guard: skip if a save is already in progress ──────────
  if (savingInProgress) {
    logDebug('sidebar.save', 'Save skipped — previous save still in progress');
    return 'skipped';
  }

  let filePath = getActiveFilePath();

  if (!filePath) {
    if (!interactive) return 'skipped';
    const targetPath = await save({
      title: '保存文件',
      defaultPath: 'untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (!targetPath) return 'skipped';
    showToast('保存需要已确认的 Core 会话');
    return 'failed';
  }

  // ── External modification check (mtime + size) ──────────────────
  if (hasExternalModification()) {
    if (!interactive) return 'skipped';
    const confirmed = window.confirm('文件已被外部修改。是否覆盖磁盘中的最新内容？');
    if (!confirmed) {
      showToast('已取消保存');
      return 'skipped';
    }
  }

  // ── Core-backed save path (source mode with active Core session) ──
  const sessionState = getCoreSessionState();
  if (sessionState.isActive) {
    savingInProgress = true;
    try {
      const savedRevision = await saveCoreSession({ interactive });
      if (savedRevision >= 0) {
        markDocumentPersisted(getCurrentSourceMarkdown(), savedRevision);
        if (interactive) {
          showToast('已保存');
        }
        return 'saved';
      }
      showToast('保存失败，请重试');
      return 'failed';
    } catch (e) {
      logException('sidebar.save', 'Core-backed save failed', e, { path: filePath });
      if (interactive) showToast('保存失败，请重试');
      return 'failed';
    } finally {
      savingInProgress = false;
    }
  }

  if (interactive) showToast('保存需要已确认的 Core 会话');
  return 'failed';
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
        await prepareImageLifecycleForOpenedDocument(path);
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
    await prepareImageLifecycleForOpenedDocument(path);
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

async function prepareImageLifecycleForOpenedDocument(path: string): Promise<void> {
  try {
    await authorizeImageStorage(path);
  } catch (e) {
    logDebug('fileops', 'Failed to authorize image storage while opening document', {
      path,
      error: String(e),
    });
  }
  try {
    await discardActiveImageDraft();
  } catch (e) {
    logDebug('fileops', 'Failed to clean discarded image draft while opening document', {
      path,
      error: String(e),
    });
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
