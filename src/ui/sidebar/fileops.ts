import { normalizePathSegments } from '../../utils/paths';
import { readFile, writeFile, writeFileIfUnchanged, addRecentFile, authorizeImageStorage, getFileMetadata, getCachedSettings } from '../../infra/storage';
import { getMarkdownResult, getSavePlan, hasExternalModification, isDocumentDirty, markDocumentPersisted, markExternalModification, resetEditorScroll, setActiveDocumentPath, setMarkdown, getRevision, getSourceRevision, getLastReadMtime, getLastReadSize, hasLastReadStats, clearLastReadStats, setLastReadStats, getEditor, getPipelineMode } from '../../editor';
import { shouldUseReconcileBoundary } from '../../editor';
import { setSourceReadOnly } from '../../editor';
import { showToast } from '../toast';
import { suppressNextWatcherRefresh, cancelSuppressedWatcherRefresh, applyFileTreeEvents } from '../file-tree/index';
import { refreshOutline } from '../outline';
import { logException, logInfo, logDebug } from '../../infra/logger';
import { save } from '@tauri-apps/plugin-dialog';
import { showDialog } from '../dialog';
import { getActiveFilePath, setActiveFilePath } from '../active-document';
import { determineTier, formatFileSize, tierConfigFromSettings } from '../../utils/file-size-tier';
import { showDegradationBar, hideDegradationBar } from '../degradation-bar';
import { refreshFrontmatterPanel } from '../frontmatter-panel';
import { store } from '../../infra/store';
import { invoke } from '@tauri-apps/api/core';
import { runDocumentOperation, isDocumentOperationPending } from '../../infra/document-operations';
import { openDocumentTab, isPathOpenInOtherDocument } from '../documents/session';
import { getEditorDocumentVersion } from '../../editor';
import { commitEditorDocumentDrafts, flushEditorDirtyCheck } from '../../editor';
import {
  abortPendingImagesSave,
  completePendingImagesSave,
  preparePendingImagesForSave,
} from '../../infra/images/core';

// ── Serial save guard ────────────────────────────────────────────────

let savingInProgress = false;

/** Returns true if a save operation is currently in progress. */
export function isSavingInProgress(): boolean {
  return savingInProgress;
}

export function confirmDocumentTransition(): Promise<boolean> {
  return runDocumentOperation(confirmDocumentTransitionInOperation);
}

export async function confirmDocumentTransitionInOperation(): Promise<boolean> {
  commitEditorDocumentDrafts();
  flushEditorDirtyCheck();
  const dirty = isDocumentDirty();
  const conflicted = hasExternalModification();
  if (!dirty && !conflicted) return true;

  const title = conflicted ? '外部修改冲突' : '未保存的更改';
  const body = conflicted
    ? '当前文件已被外部修改。关闭前希望如何处理？'
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
    const saved = await saveActiveDocumentInOperation({ interactive: true });
    if (saved === 'saved' && !isDocumentDirty() && !hasExternalModification()) return true;
    if (saved === 'saved') showToast('保存期间文档又有更改，标签已保留');
    return false;
  }

  if (result === 'discard') return true;
  return false;
}

function getConflictSavePath(path: string) {
  return path.endsWith('.md') ? `${path.slice(0, -3)}.conflict.md` : `${path}.conflict.md`;
}

export function saveActiveDocumentAsNewFile() {
  const owner = getEditorDocumentVersion();
  return runDocumentOperation(() => owner === getEditorDocumentVersion() ? saveActiveDocumentAsNewFileInOperation() : false);
}
export async function saveActiveDocumentAsNewFileInOperation() {
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
  const revision = getRevision();
  const sourceRevision = getSourceRevision();
  const targetPath = await save({
    title: '另存为',
    defaultPath: getConflictSavePath(filePath),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });

  if (!targetPath) return false;
  if (targetPath === filePath || isPathOpenInOtherDocument(targetPath)) {
    showToast('请另选一个新文件名');
    return false;
  }

  try {
    suppressNextWatcherRefresh(targetPath);
    const prepared = await preparePendingImagesForSave(currentContent, targetPath);
    await writeFile(targetPath, prepared.markdown);
    const persistedSourceRevision = applyPreparedMarkdownIfCurrent(prepared.markdown, currentContent, revision, sourceRevision);
    setActiveFilePath(targetPath);
    // Record mtime + size for future external-modification checks
    try {
      const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: targetPath });
      setLastReadStats(stats.mtime, stats.size);
    } catch (e) { logDebug('fileops', 'Failed to get file stats after save-as (non-critical)', { path: targetPath, error: String(e) }); }
    markDocumentPersisted(prepared.markdown, revision, persistedSourceRevision);
    if (revision === getRevision() && persistedSourceRevision === getSourceRevision()) await completePendingImagesSave(prepared.draftId);
    else abortPendingImagesSave();
    await applyFileTreeEvents([{ path: targetPath, kind: 'create', timestamp: Date.now() }]);
    refreshOutline();
    showToast('已另存为新文件');
    return true;
  } catch (e) {
    abortPendingImagesSave();
    showToast(`另存为失败: ${e}`);
    return false;
  }
}

export type SaveResult = 'saved' | 'skipped' | 'failed';

export function saveActiveDocument(options: { interactive?: boolean } = {}): Promise<SaveResult> {
  if (options.interactive === false && isDocumentOperationPending()) return Promise.resolve('skipped');
  const owner = getEditorDocumentVersion();
  return runDocumentOperation(() => owner === getEditorDocumentVersion() ? saveActiveDocumentInOperation(options) : 'skipped');
}

/** Caller already owns document identity, including dialogs before any write. */
export async function saveActiveDocumentInOperation(options: { interactive?: boolean } = {}): Promise<SaveResult> {
  if (savingInProgress) return 'skipped';
  savingInProgress = true;
  try { return await saveActiveDocumentContent(options); }
  finally { savingInProgress = false; }
}
async function saveActiveDocumentContent(options: { interactive?: boolean }): Promise<SaveResult> {
  const { interactive = true } = options;
  flushEditorDirtyCheck();
  let filePath = getActiveFilePath();

  if (!filePath) {
    if (!interactive) return 'skipped';
    const targetPath = await save({
      title: '保存文件',
      defaultPath: 'untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (!targetPath) return 'skipped';
    if (isPathOpenInOtherDocument(targetPath)) { showToast('该文件已在其他标签中打开'); return 'skipped'; }
    const candidate = getMarkdownResult();
    if (!candidate.ok) return reportConversionFailure(candidate.error.stage, candidate.error.code, interactive);
    const content = candidate.markdown;
    const revision = getRevision();
    const sourceRevision = getSourceRevision();
    try {
      const prepared = await preparePendingImagesForSave(content, targetPath);
      suppressNextWatcherRefresh(targetPath);
      await writeFile(targetPath, prepared.markdown);
      setActiveFilePath(targetPath);
      const persistedSourceRevision = applyPreparedMarkdownIfCurrent(prepared.markdown, content, revision, sourceRevision);
      // Record mtime + size for future external-modification checks
      try {
        const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: targetPath });
        setLastReadStats(stats.mtime, stats.size);
      } catch (e) { logDebug('fileops', 'Failed to get file stats after save new file (non-critical)', { path: targetPath, error: String(e) }); }
      markDocumentPersisted(prepared.markdown, revision, persistedSourceRevision);
      try {
        if (revision === getRevision() && persistedSourceRevision === getSourceRevision()) await completePendingImagesSave(prepared.draftId);
    else abortPendingImagesSave();
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
    }
  }

  let confirmedExternalOverwrite = false;
  // ── External modification check (mtime + size) ──────────────────
  if (hasExternalModification()) {
    if (!interactive) return 'skipped';
    const confirmed = window.confirm('文件已被外部修改。是否覆盖磁盘中的最新内容？');
    if (!confirmed) {
      showToast('已取消保存');
      return 'skipped';
    }
    confirmedExternalOverwrite = true;
  }

  // ── Pre-save mtime + size validation ────────────────────────────
  let lastMtime = getLastReadMtime();
  let lastSize = getLastReadSize();
  const verifiedSave = shouldUseReconcileBoundary(getPipelineMode());
  if (hasLastReadStats()) {
    try {
      const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: filePath });
      if (stats.mtime !== lastMtime || stats.size !== lastSize) {
        if (!interactive) {
          logDebug('sidebar.save', 'Auto-save skipped — file modified externally', { path: filePath });
          return 'skipped';
        }
        const confirmed = confirmedExternalOverwrite || window.confirm('文件已被外部修改。是否覆盖磁盘中的最新内容？');
        if (!confirmed) {
          showToast('已取消保存');
          return 'skipped';
        }
        confirmedExternalOverwrite = true;
        lastMtime = stats.mtime;
        lastSize = stats.size;
      }
    } catch (e) {
      // Legacy saves keep their established best-effort policy. A verified
      // reconcile session is stricter: without a fresh stat we cannot prove
      // its source baseline still names the disk file, so invalidate it and
      // let the existing stale-source conflict path suppress the write.
      markExternalModification();
      if (!interactive) return 'skipped';
      if (!confirmedExternalOverwrite && !window.confirm('无法确认磁盘文件状态（文件可能已删除）。是否明确保存当前内容？')) return 'skipped';
      confirmedExternalOverwrite = true;
      logDebug('fileops', 'Pre-save stat check failed', { path: filePath, error: String(e) });
    }
  } else if (verifiedSave) {
    // Existing-file verified sessions require a known disk identity. New-file
    // and save-as branches returned above and are intentionally unaffected.
    markExternalModification();
  }

  // ── Reconcile boundary (opaque/reconcile mode, task 8.5) ──────────
  const plan = getSavePlan({ allowConfirmedExternalOverwrite: confirmedExternalOverwrite });
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
    const persistedSourceRevision = applyPreparedMarkdownIfCurrent(prepared.markdown, content, revision, sourceRevision);
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
    markDocumentPersisted(prepared.markdown, revision, persistedSourceRevision);
    try {
      if (revision === getRevision() && persistedSourceRevision === getSourceRevision()) await completePendingImagesSave(prepared.draftId);
    else abortPendingImagesSave();
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
  }
}

/** Rewriting staged image references must never replace newer user edits. */
function applyPreparedMarkdownIfCurrent(markdown: string, original: string, revision: number, sourceRevision: number): number {
  if (markdown !== original && revision === getRevision() && sourceRevision === getSourceRevision()) {
    setMarkdown(markdown, { caret: 'preserve' });
    return getSourceRevision();
  }
  return sourceRevision;
}

function reportConversionFailure(stage: string, code: string, interactive: boolean): SaveResult {
  logException('sidebar.save', 'Markdown conversion failed before disk write', undefined, { stage, code });
  if (interactive) showToast('Markdown 转换失败，未写入文件');
  return 'failed';
}

export function reloadActiveDocumentFromDisk(options: { force?: boolean } = {}) {
  const owner = getEditorDocumentVersion();
  return runDocumentOperation(() => owner === getEditorDocumentVersion() ? reloadActiveDocumentFromDiskInOperation(options) : false);
}
export async function reloadActiveDocumentFromDiskInOperation(options: { force?: boolean } = {}) {
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

export async function openFileInEditor(path: string): Promise<boolean> {
  path = normalizePathSegments(path.replace(/\\/g, '/'));
  try {
    const opened = await openDocumentTab(path, async () => {
      const metadata = await getFileMetadata(path);
      // Tier thresholds come from the current settings so a change applies to
      // the next opened document without a restart.
      const tier = determineTier(metadata.size, metadata.lines, tierConfigFromSettings(getCachedSettings()));
      let readOnly = false;
      if (tier === 'huge') {
        const choice = await showDialog({
          title: '文件过大',
          body: `<p>该文件较大 (${formatFileSize(metadata.size)}，${metadata.lines} 行)，可能导致编辑器卡顿。</p><p>建议以只读模式预览，或强制打开。</p>`,
          buttons: [{ label: '取消', value: 'cancel' }, { label: '强制打开', value: 'force' }, { label: '只读预览', value: 'readonly', primary: true }],
          width: '400px',
        });
        if (!choice || choice === 'cancel') return null;
        readOnly = choice === 'readonly';
      }
      const content = await readFile(path);
      await prepareImageLifecycleForOpenedDocument(path);
      let stats: { mtime: number; size: number } | null = null;
      try { stats = await invoke('get_file_stats', { path }); }
      catch (error) { logDebug('fileops', 'Failed to stat opened file', { path, error: String(error) }); }
      return () => {
        setActiveDocumentPath(path);
        setActiveFilePath(path);
        setMarkdown(content);
        setReadOnly(readOnly);
        if (tier === 'large' || tier === 'huge') showDegradationBar({ tier, size: formatFileSize(metadata.size), lines: metadata.lines, readOnly });
        else hideDegradationBar();
        if (stats) setLastReadStats(stats.mtime, stats.size);
        resetEditorScroll();
        refreshOutline();
        showToast(readOnly ? '已以只读模式打开文件' : '已打开文件');
      };
    });
    if (opened) await recordRecentFile(path);
    return opened;
  } catch (e) {
    showToast(`打开失败: ${e}`);
    return false;
  }
}

async function recordRecentFile(path: string) {
  try {
    await addRecentFile(path);
  } catch (e) {
    logDebug('fileops', 'Failed to record recent file (best-effort)', { path, error: String(e) });
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

}

function setReadOnly(readOnly: boolean): void {
  store.setState({ readOnly });
  // ProseMirror (WYSIWYG) read-only
  const editor = getEditor();
  if (editor) {
    editor.setEditable(!readOnly, false);
  }
  // CodeMirror (source mode) read-only
  setSourceReadOnly(readOnly);
  // The metadata panel is an independent surface, so reflect runtime lock
  // changes immediately without modifying the document or its revisions.
  refreshFrontmatterPanel();
}
