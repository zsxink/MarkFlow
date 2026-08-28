import { writeFile } from '../lib/storage';
import { getMarkdown, hasExternalModification, isDocumentDirty, markDocumentPersisted, markExternalModification } from '../lib/editor';
import { showToast } from './toast';
import { showDialog } from './ui/dialog';
import { suppressNextWatcherRefresh, applyFileTreeEvents } from './fileTree';
import { refreshOutline } from './outline';
import { getActiveFilePath, clearActiveDocument } from './activeDocument';
import { reloadActiveDocumentFromDisk, saveActiveDocumentAsNewFile } from './sidebar.fileops';
import { getActiveLosslessBinding } from '../lib/lossless/registry';
import { isLosslessCoreSessionEnabled } from '../lib/lossless/flag';

function showExternalConflictDialog() {
  return showDialog({
    title: '检测到外部修改',
    body: '<p>当前文件在磁盘上已发生变化。</p><p>你在编辑器中也有未保存改动，请选择接下来要保留哪一份内容。</p>',
    buttons: [
      { label: '保留当前', value: 'keep' },
      { label: '加载磁盘版本', value: 'disk' },
      { label: '另存为', value: 'save-as', primary: true },
    ],
    width: '520px',
  }) as Promise<'keep' | 'disk' | 'save-as' | null>;
}

function showExternalDeletionDialog() {
  return showDialog({
    title: '当前文件已被删除',
    body: '<p>当前打开的文件已在磁盘上被删除。</p><p>你在编辑器中的内容还在，是否要重新保存当前内容，还是直接删除掉？</p>',
    buttons: [
      { label: '删除掉', value: 'discard' },
      { label: '重新保存', value: 'resave', primary: true },
    ],
    width: '520px',
  }) as Promise<'resave' | 'discard' | null>;
}

async function restoreDeletedActiveDocument() {
  const filePath = getActiveFilePath();
  if (!filePath) return false;

  // ── Lossless path (reviewer N1): the binding's logical text is the ONLY
  // truthful content — never `getMarkdown()` (which reads the hidden/empty PM
  // or stale legacy source on a lossless doc). The file is gone on disk, so a
  // guarded write cannot replace it; write the confirmed logical text as a
  // recreate and keep the binding's persisted state synced.
  if (isLosslessCoreSessionEnabled() && getActiveLosslessBinding()) {
    const binding = getActiveLosslessBinding()!;
    const content = binding.logicalText;
    try {
      suppressNextWatcherRefresh(filePath);
      await writeFile(filePath, content);
      bindPersistedAfterResave(binding, content);
      await applyFileTreeEvents([{ path: filePath, kind: 'create', timestamp: Date.now() }]);
      refreshOutline();
      showToast('已重新保存当前文件');
      return true;
    } catch {
      return saveActiveDocumentAsNewFile();
    }
  }

  const content = getMarkdown();

  try {
    suppressNextWatcherRefresh(filePath);
    await writeFile(filePath, content);
    markDocumentPersisted(content);
    await applyFileTreeEvents([{ path: filePath, kind: 'create', timestamp: Date.now() }]);
    refreshOutline();
    showToast('已重新保存当前文件');
    return true;
  } catch {
    return saveActiveDocumentAsNewFile();
  }
}

/** Keep the lossless binding's file identity/persisted state aligned after a
 *  direct recreate (the file that was deleted is now re-created on disk). */
function bindPersistedAfterResave(binding: { persistedRevision: number; fileIdentity: unknown }, _content: string): void {
  // No-op hook: the binding's Core revision is unchanged by a recreate write;
  // the file identity record on the binding is refreshed by the next normal
  // save. Kept as a named seam so the delete-resave path stays symmetric with
  // the legacy `markDocumentPersisted`.
  void binding;
}

export async function handleExternalDeletion(path: string) {
  const filePath = getActiveFilePath();
  if (!filePath) return 'ignored' as const;
  if (filePath !== path && !filePath.startsWith(`${path}/`)) return 'ignored' as const;

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

function isLosslessActiveDoc(): boolean {
  return isLosslessCoreSessionEnabled() && getActiveLosslessBinding() !== null;
}

/** Guard: at most one lossless conflict prompt at a time (watcher fires per event). */
let losslessConflictPromptOpen = false;

/**
 * Interactive exit for a lossless document that cannot be written safely.
 *
 * - `external-modification` / `save-conflict`: reload the disk version, save a
 *   copy, or force overwrite (design 04 §4).
 * - `unsupported-platform`: the guarded replace is unavailable on this
 *   filesystem, so only Save Copy or a confirmed Force overwrite are offered —
 *   reload is not an exit because it would discard the user's edits without
 *   persisting them (spec atomic-save).
 *
 * Autosave never reaches this function: `saveActiveDocument` only calls it for
 * an interactive save, and `allowForce` must be passed explicitly.
 */
export async function handleLosslessConflict(
  reason: 'external-modification' | 'save-conflict' | 'unsupported-platform',
  options: { allowForce?: boolean } = {},
): Promise<'ignored' | 'kept' | 'reloaded' | 'saved-as' | 'forced' | 'failed'> {
  const filePath = getActiveFilePath();
  if (!filePath) return 'ignored';
  const binding = getActiveLosslessBinding();
  if (!binding) return 'ignored';
  // The watcher fires per filesystem event; never stack a second prompt on top
  // of an unresolved one.
  if (losslessConflictPromptOpen) return 'ignored';

  losslessConflictPromptOpen = true;
  try {
    const dirty = binding.isDirty();
    const choice = await showDialog({
      title:
        reason === 'unsupported-platform'
          ? '当前文件系统不支持安全覆盖保存'
          : '检测到外部修改',
      body: losslessConflictBody(reason),
      buttons: losslessConflictButtons({
        reason,
        // Force overwrite is only offered for a real interactive decision, and
        // only when there is something of the user's to overwrite with.
        allowForce: options.allowForce === true && dirty,
      }),
      width: '560px',
    });

    if (choice === 'reload') {
      const reloaded = await reloadActiveDocumentFromDisk({ force: true });
      if (!reloaded) return 'failed';
      refreshOutline();
      markDocumentPersisted(binding.logicalText);
      return 'reloaded';
    }

    if (choice === 'save-copy') {
      const saved = await saveActiveDocumentAsNewFile();
      if (!saved) return 'failed';
      markDocumentPersisted(binding.logicalText);
      return 'saved-as';
    }

    if (choice === 'force') {
      const forced = await forceOverwriteLossless(filePath);
      if (!forced) return 'failed';
      markDocumentPersisted(binding.logicalText);
      return 'forced';
    }

    return 'kept';
  } finally {
    losslessConflictPromptOpen = false;
  }
}

function losslessConflictBody(
  reason: 'external-modification' | 'save-conflict' | 'unsupported-platform',
): string {
  const warning =
    '<p style="margin:0 0 12px;font-size:13px;color:var(--muted);">强制覆盖会跳过替换瞬间的外部改动校验：若此刻有其他程序正在写入该文件，它的内容可能丢失。</p>';
  if (reason === 'unsupported-platform') {
    return (
      '<p style="margin:0 0 12px;font-size:14px;color:var(--fg);line-height:1.5;">' +
      '当前文件系统不支持“保留原文件的原子替换”，为避免覆盖并行写入，直接保存已被拒绝（原文件未被改动）。</p>' +
      '<p style="margin:0 0 12px;font-size:13px;color:var(--muted);">你可以把当前内容另存为副本（不改动原文件），或在确认风险后强制覆盖。</p>' +
      warning
    );
  }
  const lead =
    reason === 'save-conflict'
      ? '保存时检测到磁盘上的文件已被其他程序修改，已拒绝覆盖，被替换的内容已保留为恢复副本。'
      : '当前文件在磁盘上已发生变化，而你在编辑器中也有改动。';
  return (
    `<p style="margin:0 0 12px;font-size:14px;color:var(--fg);line-height:1.5;">${lead}</p>` +
    '<p style="margin:0 0 12px;font-size:13px;color:var(--muted);">重新加载会用磁盘版本替换编辑器内容（当前改动将丢失）；另存副本会把当前内容写到新路径，原文件保持不动。</p>' +
    warning
  );
}

function losslessConflictButtons(opts: {
  reason: 'external-modification' | 'save-conflict' | 'unsupported-platform';
  allowForce: boolean;
}): Array<{ label: string; value: string; primary?: boolean; danger?: boolean }> {
  const buttons: Array<{ label: string; value: string; primary?: boolean; danger?: boolean }> = [];
  if (opts.reason !== 'unsupported-platform') {
    buttons.push({ label: '重新加载磁盘版本（丢弃本地修改）', value: 'reload' });
  }
  buttons.push({ label: '另存副本到新路径', value: 'save-copy', primary: true });
  if (opts.allowForce) {
    buttons.push({ label: '强制覆盖磁盘版本（有丢失风险）', value: 'force', danger: true });
  }
  buttons.push({ label: '取消', value: 'cancel' });
  return buttons;
}

/**
 * Last-resort in-place write for a lossless document: a plain overwrite, only
 * after an explicit interactive risk confirmation. It deliberately bypasses the
 * guarded replace (the platform cannot perform one), so the session is re-opened
 * from the bytes we just wrote — that rebinds the file identity and the
 * persisted revision, which the bypassed write could not update.
 */
async function forceOverwriteLossless(path: string): Promise<boolean> {
  const binding = getActiveLosslessBinding();
  if (!binding) return false;
  try {
    const flush = await binding.flushNow();
    if (flush.status !== 'flushed') return false;
    suppressNextWatcherRefresh(path);
    await writeFile(path, binding.logicalText);
    const reloaded = await reloadActiveDocumentFromDisk({ force: true });
    if (!reloaded) return false;
    refreshOutline();
    return true;
  } catch {
    return false;
  }
}

export async function handleActiveDocumentExternalModification() {
  const filePath = getActiveFilePath();
  if (!filePath) return 'ignored' as const;

  // ── Lossless Core path ─────────────────────────────────────────────
  // The Core session owns the content; route to the lossless conflict surface
  // so every exit (reload / save copy / force) acts on the binding instead of
  // the hidden ProseMirror document.
  if (isLosslessActiveDoc()) {
    return handleLosslessConflict('external-modification', { allowForce: true });
  }

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
