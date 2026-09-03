import { readFile, writeFile, writeFileIfUnchanged, addRecentFile, authorizeImageStorage, getFileMetadata } from '../lib/storage';
import { getMarkdownResult, getSavePlan, hasExternalModification, isDocumentDirty, markDocumentPersisted, markExternalModification, resetEditorScroll, setActiveDocumentPath, setMarkdown, getRevision, getSourceRevision, getLastReadMtime, getLastReadSize, hasLastReadStats, clearLastReadStats, setLastReadStats, getEditor, getPipelineMode } from '../lib/editor';
import { shouldUseReconcileBoundary } from '../lib/editor.save.reconcile';
import { setSourceReadOnly } from '../lib/editor.source';
import { showToast } from './toast';
import { suppressNextWatcherRefresh, cancelSuppressedWatcherRefresh, applyFileTreeEvents } from './fileTree';
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
import {
  abortPendingImagesSave,
  completePendingImagesSave,
  discardActiveImageDraft,
  preparePendingImagesForSave,
} from '../lib/imageUtils';

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

  const candidate = getMarkdownResult();
  if (!candidate.ok) {
    logException('sidebar.save', 'Markdown conversion failed before save-as', undefined, {
      stage: candidate.error.stage,
      code: candidate.error.code,
    });
    showToast('Markdown 转换失败，未写入文件');
    return false;
  }
  const currentContent = candidate.markdown;
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
    const candidate = getMarkdownResult();
    if (!candidate.ok) return reportConversionFailure(candidate.error.stage, candidate.error.code, interactive);
    const content = candidate.markdown;
    const revision = getRevision();
    savingInProgress = true;
    try {
      const prepared = await preparePendingImagesForSave(content, targetPath);
      suppressNextWatcherRefresh(targetPath);
      await writeFile(targetPath, prepared.markdown);
      setActiveFilePath(targetPath);
      if (prepared.markdown !== content) setMarkdown(prepared.markdown);
      // Record mtime + size for future external-modification checks
      try {
        const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: targetPath });
        setLastReadStats(stats.mtime, stats.size);
      } catch (e) { logDebug('fileops', 'Failed to get file stats after save new file (non-critical)', { path: targetPath, error: String(e) }); }
      markDocumentPersisted(prepared.markdown, revision);
      try {
        await completePendingImagesSave(prepared.draftId);
      } catch (e) {
        logDebug('sidebar.save', 'Saved document but failed to clean pending images', {
          path: targetPath,
          error: String(e),
        });
      }
      addRecentFile(targetPath).catch((e) =>
        logDebug('sidebar.save', 'Failed to record recent file (best-effort)', { path: targetPath, error: String(e) }),
      );
      logInfo('sidebar.save', 'Saved new file', { path: targetPath });
      showToast('已保存');
      return 'saved';
    } catch (e) {
      abortPendingImagesSave();
      logException('sidebar.save', 'Failed to save new file without workspace', e, { path: targetPath });
      showToast('保存失败');
      return 'failed';
    } finally {
      savingInProgress = false;
    }
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

  // ── Pre-save mtime + size validation ────────────────────────────
  const lastMtime = getLastReadMtime();
  const lastSize = getLastReadSize();
  const verifiedSave = shouldUseReconcileBoundary(getPipelineMode());
  if (hasLastReadStats()) {
    try {
      const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: filePath });
      if (stats.mtime !== lastMtime || stats.size !== lastSize) {
        if (verifiedSave) {
          // A verified session's reconcile baseline names the old file. Do
          // not turn an interactive "overwrite" click into a stale verified
          // write; invalidate it and let the established conflict path decide.
          markExternalModification();
        }
        if (!interactive) {
          logDebug('sidebar.save', 'Auto-save skipped — file modified externally', { path: filePath });
          return 'skipped';
        }
        const confirmed = window.confirm('文件已被外部修改。是否覆盖磁盘中的最新内容？');
        if (!confirmed) {
          showToast('已取消保存');
          return 'skipped';
        }
      }
    } catch (e) {
      // Legacy saves keep their established best-effort policy. A verified
      // reconcile session is stricter: without a fresh stat we cannot prove
      // its source baseline still names the disk file, so invalidate it and
      // let the existing stale-source conflict path suppress the write.
      if (verifiedSave) markExternalModification();
      logDebug('fileops', 'Pre-save stat check failed', { path: filePath, error: String(e) });
    }
  } else if (verifiedSave) {
    // Existing-file verified sessions require a known disk identity. New-file
    // and save-as branches returned above and are intentionally unaffected.
    markExternalModification();
  }

  // ── Reconcile boundary (opaque/reconcile mode, task 8.5) ──────────
  const plan = getSavePlan();
  if (plan.kind !== 'legacy') {
    if (plan.kind === 'unchanged') {
      // Exact source baseline is already on disk; never rewrite it.
      if (interactive) showToast('内容无变化，未重复写入');
      return 'saved';
    }
    if (plan.kind === 'conflict') {
      // Suppressed: no disk write, dirty kept, reconcileError set by getSavePlan.
      if (interactive) showToast('保存被阻止：文档存在冲突，未写入磁盘');
      return 'failed';
    }
  }

  // ── Atomic save with revision tracking ──────────────────────────
  const candidate = getMarkdownResult();
  if (!candidate.ok) return reportConversionFailure(candidate.error.stage, candidate.error.code, interactive);
  // In safe-edit mode the reconcile boundary's verified candidate is written.
  const content = plan.kind === 'safe-edit' ? plan.markdown : candidate.markdown;
  const revision = getRevision();
  const sourceRevision = getSourceRevision();
  savingInProgress = true;
  try {
    const prepared = await preparePendingImagesForSave(content, filePath);
    suppressNextWatcherRefresh(filePath);
    if (verifiedSave) {
      // A Source/reload change during image staging invalidates the admission
      // session before touching disk. The backend then rechecks the exact disk
      // mtime+size immediately before its atomic rename.
      if (sourceRevision !== getSourceRevision() || !hasLastReadStats()) {
        markExternalModification();
        throw new Error('FILE_CHANGED_DURING_SAVE');
      }
      await writeFileIfUnchanged(filePath, prepared.markdown, lastMtime, lastSize);
    } else {
      await writeFile(filePath, prepared.markdown);
    }
    if (prepared.markdown !== content) setMarkdown(prepared.markdown);
    // Record mtime + size after successful write
    try {
      const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: filePath });
      setLastReadStats(stats.mtime, stats.size);
    } catch (e) {
      // The write succeeded but we cannot prove the identity for a later
      // verified save. Force a fresh admission/reload rather than reuse it.
      clearLastReadStats();
      logDebug('fileops', 'Failed to get file stats after write', { path: filePath, error: String(e) });
    }
    markDocumentPersisted(prepared.markdown, revision);
    try {
      await completePendingImagesSave(prepared.draftId);
    } catch (e) {
      logDebug('sidebar.save', 'Saved document but failed to clean pending images', {
        path: filePath,
        error: String(e),
      });
    }
    if (interactive) {
      logInfo('sidebar.save', 'Saved active document', { path: filePath, interactive: true });
      showToast('已保存');
    }
    return 'saved';
  } catch (e) {
    cancelSuppressedWatcherRefresh(filePath);
    abortPendingImagesSave();
    if (verifiedSave && String(e).includes('FILE_CHANGED_DURING_SAVE')) {
      markExternalModification();
      // Populate the production reconcile error (stale-source) now; this is
      // what suppresses following autosaves until the user resolves it.
      getSavePlan();
    }
    // Keep dirty state on failure — user sees error toast in interactive mode
    logException('sidebar.save', 'Failed to save active document', e, { path: filePath, interactive });
    if (interactive) showToast('保存失败，请重试');
    return 'failed';
  } finally {
    savingInProgress = false;
  }
}

function reportConversionFailure(stage: string, code: string, interactive: boolean): SaveResult {
  logException('sidebar.save', 'Markdown conversion failed before disk write', undefined, { stage, code });
  if (interactive) showToast('Markdown 转换失败，未写入文件');
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
    try {
      const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: filePath });
      setLastReadStats(stats.mtime, stats.size);
    } catch (e) {
      // A verified session cannot safely overwrite an unstatable reload.
      if (shouldUseReconcileBoundary(getPipelineMode())) markExternalModification();
      logDebug('fileops', 'Failed to stat reloaded document', { path: filePath, error: String(e) });
    }
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
