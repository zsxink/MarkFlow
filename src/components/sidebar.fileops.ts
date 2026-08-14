import { readFile, writeFile, addRecentFile, authorizeImageStorage, getFileMetadata } from '../lib/storage';
import { getMarkdown, hasExternalModification, isDocumentDirty, markDocumentPersisted, resetEditorScroll, setActiveDocumentPath, setMarkdown, getRevision, getDocumentGeneration, getLastReadMtime, getLastReadSize, setLastReadStats, getEditor, hasUnpersistedUserChanges } from '../lib/editor';
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
import {
  abortPendingImagesSave,
  completePendingImagesSave,
  discardActiveImageDraft,
  preparePendingImagesForSave,
} from '../lib/imageUtils';
import {
  closeLosslessActiveDocument,
  isLosslessActiveDoc,
  openLosslessDocument,
  reloadLosslessActiveDocument,
  saveLosslessActiveDocument,
  saveLosslessActiveDocumentAsNewFile,
} from '../lib/lossless/integration';
import { isLosslessCoreSessionEnabled } from '../lib/lossless/flag';

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
    return saved === 'saved';
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

  // ── Lossless Core path (P1B 3.7) ──────────────────────────────────
  if (isLosslessActiveDoc(filePath)) {
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
    const ok = await saveLosslessActiveDocumentAsNewFile(targetPath);
    if (ok) {
      setActiveFilePath(targetPath);
      await applyFileTreeEvents([{ path: targetPath, kind: 'create', timestamp: Date.now() }]);
      refreshOutline();
      showToast('已另存为新文件');
      return true;
    }
    showToast('另存为失败');
    return false;
  }

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

export type SaveResult = 'saved' | 'skipped' | 'failed';

export async function saveActiveDocument(options: { interactive?: boolean } = {}): Promise<SaveResult> {
  const { interactive = true } = options;

  // ── Lossless Core path (P1B 3.6) ───────────────────────────────────
  const losslessResult = await saveLosslessActiveDocument({ interactive });
  if (losslessResult !== null) {
    if (losslessResult === 'saved') {
      if (interactive) showToast('已保存');
      return 'saved';
    }
    if (losslessResult === 'skipped') return 'skipped';
    if (losslessResult === 'conflict') {
      // Guarded write surfaced a conflict — never silently overwrite. In the
      // rare displaced-mismatch race the displaced bytes are preserved as a
      // recovery copy on disk.
      if (interactive) {
        showToast('检测到外部修改，原文件已保留为恢复副本，未覆盖');
      }
      return 'failed';
    }
    return 'failed';
  }

  // ── Serial guard: skip if a save is already in progress ──────────
  if (savingInProgress) {
    logDebug('sidebar.save', 'Save skipped — previous save still in progress');
    return 'skipped';
  }

  let filePath = getActiveFilePath();

  // ── P0S clean-session guard (final write entrance) ────────────────
  // Even if the caller (UI/store/autosave) wrongly reports dirty, a document
  // with zero confirmed user edits MUST NOT be serialized or written. We check
  // this before any getMarkdown()/serializer call, so a clean Ctrl+S or an
  // erroneous dirty flag never touches disk or changes mtime/hash/length.
  if (!hasUnpersistedUserChanges()) {
    logDebug('sidebar.save', 'Save skipped — clean session (no unpersisted user changes)', {
      path: filePath,
      userRevision: getRevision(),
    });
    return 'skipped';
  }

  // ── P1: occupy the save lock BEFORE any await ─────────────────────
  // The save dialog, pre-save stat check, image migration, write and post-write
  // completion all run under the lock, so a second Cmd+S/autosave issued while
  // any of them is awaiting can never slip past isSavingInProgress() and start a
  // concurrent prepare/write. Released in the finally covering the whole body.
  savingInProgress = true;
  try {
    // ── P0: capture document identity for the async completion ──────
    // The generation token identifies the document instance this save started on.
    // If the user discards A and opens/edits B while the write is in flight, the
    // completion must NOT mark the NEW document persisted/clean or overwrite its
    // file stats — a stale A-save would otherwise clear B's dirty protection.
    const saveGeneration = getDocumentGeneration();

    if (!filePath) {
      if (!interactive) return 'skipped';
      const targetPath = await save({
        title: '保存文件',
        defaultPath: 'untitled.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (!targetPath) return 'skipped';
      const content = getMarkdown();
      const revision = getRevision();
      const prepared = await preparePendingImagesForSave(content, targetPath);
      suppressNextWatcherRefresh(targetPath);
      await writeFile(targetPath, prepared.markdown);
      setActiveFilePath(targetPath);
      if (getDocumentGeneration() === saveGeneration && prepared.markdown !== content) setMarkdown(prepared.markdown);
      // Record mtime + size for future external-modification checks
      try {
        const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: targetPath });
        if (getDocumentGeneration() === saveGeneration) setLastReadStats(stats.mtime, stats.size);
      } catch (e) { logDebug('fileops', 'Failed to get file stats after save new file (non-critical)', { path: targetPath, error: String(e) }); }
      if (getDocumentGeneration() === saveGeneration) markDocumentPersisted(prepared.markdown, revision);
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
    if (lastMtime > 0 || lastSize > 0) {
      try {
        const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: filePath });
        if (stats.mtime !== lastMtime || stats.size !== lastSize) {
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
        // If stat fails, proceed with save anyway
        logDebug('fileops', 'Pre-save stat check failed, proceeding with save', { path: filePath, error: String(e) });
      }
    }

    // ── Atomic save with revision tracking ──────────────────────────
    const content = getMarkdown();
    const revision = getRevision();
    const prepared = await preparePendingImagesForSave(content, filePath);
    suppressNextWatcherRefresh(filePath);
    await writeFile(filePath, prepared.markdown);
    if (getDocumentGeneration() === saveGeneration && prepared.markdown !== content) setMarkdown(prepared.markdown);
    // Record mtime + size after successful write
    try {
      const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: filePath });
      if (getDocumentGeneration() === saveGeneration) setLastReadStats(stats.mtime, stats.size);
    } catch (e) { logDebug('fileops', 'Failed to get file stats after write (non-critical)', { path: filePath, error: String(e) }); }
    // ── P0: only mark persisted/clear dirty if identity still matches ──
    if (getDocumentGeneration() === saveGeneration) {
      markDocumentPersisted(prepared.markdown, revision);
    } else {
      // The write itself succeeded, but the active document changed while it was
      // in flight. Keep the NEW document's revision/dirty/file-stat state untouched.
      logDebug('sidebar.save', 'Save completed for a previous document — leaving active document state untouched', {
        path: filePath,
      });
    }
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
    abortPendingImagesSave();
    // Keep dirty state on failure — user sees error toast in interactive mode
    logException('sidebar.save', 'Failed to save active document', e, { path: filePath, interactive });
    if (interactive) showToast('保存失败，请重试');
    return 'failed';
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

  // ── Lossless Core path (P1B 3.7) ──────────────────────────────────
  if (isLosslessActiveDoc(filePath)) {
    const ok = await reloadLosslessActiveDocument(filePath);
    if (ok) {
      refreshOutline();
      return true;
    }
    return false;
  }

  try {
    const content = await readFile(filePath);
    setMarkdown(content, 'reloadSync');
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

  // ── Lossless Core path (P1B 3.4) ──────────────────────────────────
  // Source mode uses Core logical text directly; `setMarkdown` / serializer are
  // never called for the lossless session (owner isolation).
  if (isLosslessCoreSessionEnabled()) {
    await prepareImageLifecycleForOpenedDocument(path);
    const opened = await openLosslessDocument(path);
    if (opened) {
      setActiveFilePath(path);
      resetEditorScroll();
      refreshOutline();
      showToast('已打开文件');
      return;
    }
    // Lossless open failed → dispose any stale binding, then fall through to
    // legacy so the file still opens.
    await closeLosslessActiveDocument();
  }

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
    // P0S: setEditable(true) after open must NOT send a document update — that
    // fired onUpdate, bumped userRevision and (with the old serializer dirty
    // check) made a zero-edit doc dirty so autosave rewrote the file. The
    // read-only toggle itself carries no document change.
    editor.setEditable(!readOnly, /* emitUpdate */ false);
  }
  // CodeMirror (source mode) read-only
  setSourceReadOnly(readOnly);
}
